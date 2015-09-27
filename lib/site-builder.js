/* jshint node: true */

'use strict';

var fs = require('fs');
var path = require('path');
var buildLogger = require('./build-logger');
var fileLockedOperation = require('file-locked-operation');
var childProcess = require('child_process');

var exports = module.exports = {};
var config = null;

exports.setConfiguration = function(configuration) {
  config = configuration;
}

// Creates an options object to pass to the SiteBuilder constructor
//
// Arguments:
//   info: GitHub webhook payload
//   repoDir: directory containing locally-cloned Pages repositories, relative
//     to config.home
//   destDir: directory containing published sites, relative to config.home
//
// Returns an object with the following properties:
//   repoDir: path to the cloned repository
//   repoName: name of the repo belonging to the GitHub organization
//   sitePath: path to the repo of the specific Pages site being rebuilt
//   branch: branch of the Pages repository to check out and rebuild
//   destDir: input argument prefixed with config.home
//   githubOrg: from builderConfig or top-level config
//   pagesConfig: from builderConfig or top-level config
//   assetRoot: from builderConfig or top-level config
function Options(info, builderConfig) {
  var repoDir = builderConfig.repositoryDir;
  var destDir = builderConfig.generatedSiteDir;

  return {
    repoDir: path.join(config.home, repoDir),
    repoName: info.repository.name,
    sitePath: path.join(config.home, repoDir, info.repository.name),
    branch: info.ref.split('/').pop(),
    destDir: path.join(config.home, destDir),
    githubOrg: builderConfig.githubOrg || config.githubOrg,
    pagesConfig: builderConfig.pagesConfig || config.pagesConfig,
    assetRoot: builderConfig.assetRoot || config.assetRoot
  };
}

// Executes the algorithm for cloning/syncing repos and publishing sites.
// Patterned after the ControlFlow pattern used within Google.
//
// Once instantiated, users need only call build(), which is the entry point
// to the algorithm. All other methods are "states" of the algorithm/state
// machine that are executed asynchronously via callbacks.
//
// opts: Options object
// buildLogger: BuildLogger instance
// updateLock: FileLockedOperation instance
function SiteBuilder(opts, buildLogger, updateLock) {
  this.opts = opts;
  this.logger = buildLogger;
  this.updateLock = updateLock;
  this.buildDestination = path.join(opts.destDir, opts.repoName);
}

SiteBuilder.prototype.generateBuildDone = function(done) {
  var that = this;
  return function(err) {
    if (that.generatedConfig) {
      that.logger.log('removing generated', that.opts.pagesConfig);
      var configPath = path.join(that.opts.sitePath, that.opts.pagesConfig);
      fs.unlink(configPath, function(unlinkErr) {
        if (unlinkErr) {
          that.logger.log('error removing ' + configPath + ': ' + unlinkErr);
        }
        done(err);
      });
    } else {
      done(err);
    }
  };
};

SiteBuilder.prototype.spawn = function(path, args) {
  var that = this;
  return new Promise(function(resolve, reject) {
    var opts = {cwd: that.opts.sitePath, stdio: 'inherit'};

    childProcess.spawn(path, args, opts).on('close', function(code) {
      if (code !== 0) {
        reject('Error: rebuild failed for ' + that.opts.repoName +
          ' with exit code ' + code + ' from command: ' +
          path + ' ' + args.join(' '));
      } else {
        resolve();
      }
    });
  });
};

SiteBuilder.prototype.build = function(done) {
  var that = this;
  var doBuild = function(lockedOperationDone) {
    fs.exists(that.opts.sitePath, function(exists) {
      (exists ? that.syncRepo() : that.cloneRepo())
        .then(function() { return that.checkForFile('_config.yml'); })
        .then(function(useJekyll) {
          return (useJekyll ? that._buildJekyll() : that._rsync());
        })
        .then(lockedOperationDone, lockedOperationDone);
    });
  };
  this.updateLock.doLockedOperation(doBuild, this.generateBuildDone(done));
};

SiteBuilder.prototype._rsync = function() {
  return this.spawn(config.rsync,
    config.rsyncOpts.concat(['./', this.buildDestination]));
};

SiteBuilder.prototype._buildJekyll = function() {
  var that = this;
  return this.checkForFile('Gemfile')
    .then(function(usesBundler) { return that.updateBundle(usesBundler); })
    .then(function() { return that.checkForFile(that.opts.pagesConfig); })
    .then(function(fileExists) { return that.readOrWriteConfig(fileExists); })
    .then(function() { return that.jekyllBuild(); });
};

SiteBuilder.prototype.syncRepo = function() {
  this.logger.log('syncing repo:', this.opts.repoName);
  var that = this;
  return this.spawn(config.git, ['stash'])
    .then(function() { return that.spawn(config.git, ['pull']); });
};

SiteBuilder.prototype.cloneRepo = function() {
  this.logger.log('cloning', this.opts.repoName, 'into', this.opts.sitePath);

  var cloneAddr = 'git@github.com:' + this.opts.githubOrg + '/' +
    this.opts.repoName + '.git';
  var cloneArgs = ['clone', cloneAddr, '--branch', this.opts.branch];
  var cloneOpts = {cwd: this.opts.repoDir, stdio: 'inherit'};
  var that = this;

  return new Promise(function(resolve, reject) {
    childProcess.spawn(config.git, cloneArgs, cloneOpts)
      .on('close', function(code) {
      if (code !== 0) {
        reject('Error: failed to clone ' + that.opts.repoName +
          ' with exit code ' + code + ' from command: ' +
          config.git + ' ' + cloneArgs.join(' '));
      } else {
        resolve();
      }
    });
  });
};

SiteBuilder.prototype.checkForFile = function(filePath) {
  var that = this;
  return new Promise(function(resolve) {
    fs.exists(path.join(that.opts.sitePath, filePath), resolve);
  });
};

SiteBuilder.prototype.updateBundle = function(usesBundler) {
  if (!usesBundler) { return; }
  this.usesBundler = usesBundler;
  return this.spawn(config.bundler, ['install']);
};

SiteBuilder.prototype._parseDestinationFromConfigData = function(configData) {
  var baseurlMatch = configData.match(/^baseurl:(.+)$/m);
  if (baseurlMatch === null) { return; }
  var baseurl = baseurlMatch[1].trim();
  if (baseurl !== '' && baseurl !== '/') {
    this.buildDestination = path.join(this.opts.destDir, baseurl);
  }
};

SiteBuilder.prototype.readOrWriteConfig = function(configExists) {
  var that = this;
  var configPath = path.join(that.opts.sitePath, this.opts.pagesConfig);

  if (configExists) {
    this.logger.log('using existing', this.opts.pagesConfig);
    return new Promise(function(resolve, reject) {
      fs.readFile(configPath, 'utf8', function(err, data) {
        if (err) { return reject(err); }
        that._parseDestinationFromConfigData(data);
        resolve();
      });
    });
  }

  this.logger.log('generating', this.opts.pagesConfig);
  return new Promise(function(resolve, reject) {
    // asset_root: is used by the guides_style_18f gem to ensure that updates
    // to common CSS and JavaScript files can be applied to Pages without
    // having to update the gem.
    var content = 'baseurl: /' + that.opts.repoName + '\n' +
      'asset_root: ' + that.opts.assetRoot + '\n';
    fs.writeFile(configPath, content, function(err) {
      if (err) { return reject(err); }
      that.generatedConfig = true;
      resolve();
    });
  });
};

SiteBuilder.prototype.jekyllBuild = function() {
  var jekyll = config.jekyll;
  var args = ['build', '--trace', '--destination', this.buildDestination,
    '--config', '_config.yml,_config_18f_pages.yml'];

  if (this.usesBundler) {
    jekyll = config.bundler;
    args = ['exec', 'jekyll'].concat(args);
  }
  return this.spawn(jekyll, args);
};

exports.launchBuilder = function(info, builderConfig, done) {
  var builderOpts = Options(info, builderConfig);
  var commit = info.head_commit;  // jshint ignore:line
  var buildLog = builderOpts.sitePath + '.log';
  var logger = new buildLogger.BuildLogger(buildLog);
  logger.log(info.repository.full_name + ':',   // jshint ignore:line
    'starting build at commit', commit.id);
  logger.log('description:', commit.message);
  logger.log('timestamp:', commit.timestamp);
  logger.log('committer:', commit.committer.email);
  logger.log('pusher:', info.pusher.name, info.pusher.email);
  logger.log('sender:', info.sender.login);

  var lockfilePath = path.join(builderOpts.destDir,
    '.update-lock-' + builderOpts.repoName);
  var updateLock = new fileLockedOperation.FileLockedOperation(lockfilePath,
    { wait: config.fileLockWaitTime, poll: config.fileLockPollTime });
  var builder = new SiteBuilder(builderOpts, logger, updateLock);

  builder.build(function(err) {
    if (err !== undefined) {
      logger.error(err);
      logger.error(builderOpts.repoName + ': build failed');
    } else {
      logger.log(builderOpts.repoName + ': build successful');
    }

    // Provides https://pages.18f.gov/REPO-NAME/build.log as an indicator of
    // latest status.
    var newLogPath = path.join(builder.buildDestination, 'build.log');
    fs.rename(buildLog, newLogPath, function(err) {
      if (err !== null) {
        console.error('Error moving build log from', buildLog, 'to',
          newLogPath);
      }
      if (done) { done(err); }
    });
  });
};

exports.makeBuilderListener = function(webhook, builderConfig, done) {
  var org = builderConfig.githubOrg || config.githubOrg;

  webhook.on('refs/heads/' + builderConfig.branch, function(info) {
    if (info.repository.organization == org) {
      exports.launchBuilder(info, builderConfig, done);
    }
  });
}

exports.Options = Options;
exports.SiteBuilder = SiteBuilder;
