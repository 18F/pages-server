/* jshint node: true */

'use strict';

var fs = require('fs');
var path = require('path');
var buildLogger = require('./build-logger');
var Options = require('./options');
var fileLockedOperation = require('file-locked-operation');
var childProcess = require('child_process');

var exports = module.exports = {};
var config = null;

exports.setConfiguration = function(configuration) {
  config = configuration;
};

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
  if (opts.internalDestDir) {
    this.internalBuildDestination = path.join(
      opts.internalDestDir, opts.repoName);
  }
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
  return this._checkInternalPublishingConfiguration()
    .then(function() { return that.checkForFile('Gemfile'); })
    .then(function(usesBundler) { return that.updateBundle(usesBundler); })
    .then(function() { return that.checkForFile(that.opts.pagesConfig); })
    .then(function(fileExists) { return that.readOrWriteConfig(fileExists); })
    .then(function() { return that.jekyllBuild(); });
};

SiteBuilder.prototype.syncRepo = function() {
  this.logger.log('syncing repo:', this.opts.repoName);
  var that = this;
  return this.spawn(config.git, ['stash'])
    .then(function() { return that.spawn(config.git, ['pull']); })
    .then(function() {
      return that.spawn(config.git, ['submodule', 'update', '--init']);
    });
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

SiteBuilder.prototype._checkInternalPublishingConfiguration = function() {
  var that = this;

  return this.checkForFile('_config_internal.yml')
    .then(function(hasInternalConfig) {
      that.hasInternalConfig = hasInternalConfig;
      if (hasInternalConfig && !that.opts.internalDestDir) {
        return Promise.reject('Error: failed to build a site with a ' +
          '_config_internal.yml file without an internalSiteDir defined ' +
          'in the builder configuration');
      }
      return that.checkForFile('_config_external.yml');
    })
    .then(function(hasExternalConfig) {
      that.hasExternalConfig = hasExternalConfig;
      if (hasExternalConfig && !that.hasInternalConfig) {
        return Promise.reject('Error: failed to build a site with a ' +
          '_config_external.yml file without a corresponding ' +
          '_config_internal.yml file');
      }
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
    if (this.internalBuildDestination) {
      this.internalBuildDestination = path.join(
        this.opts.internalDestDir, baseurl);
    }
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

function JekyllCommandHelper(builder) {
  this.builder = builder;
  this.jekyll = config.jekyll;
  this.args = ['build', '--trace', '--destination'];

  if (builder.usesBundler) {
    this.jekyll = config.bundler;
    this.args = ['exec', 'jekyll'].concat(this.args);
  }
}

JekyllCommandHelper.prototype.spawn = function(destination, extraConfig) {
  var configs = ['_config.yml'];
  if (extraConfig) {
    configs.push(extraConfig);
  }
  configs.push(this.builder.opts.pagesConfig);
  configs = configs.join(',');

  var args = this.args.concat(destination).concat('--config').concat(configs);
  return this.builder.spawn(this.jekyll, args);
};

SiteBuilder.prototype.jekyllBuild = function() {
  var helper = new JekyllCommandHelper(this);
  if (!this.hasInternalConfig) {
    return helper.spawn(this.buildDestination);
  }

  var that = this;
  var extConf = this.hasExternalConfig ? '_config_external.yml' : undefined;
  return helper.spawn(this.internalBuildDestination, '_config_internal.yml')
    .then(function() { return helper.spawn(that.buildDestination, extConf); });
};

exports.launchBuilder = function(info, builderConfig, done) {
  var builderOpts = new Options(info, config, builderConfig);
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
  var org = builderConfig.githubOrg || config.githubOrg,
      handler = function(info) {
        if (info.ref === ('refs/heads/' + builderConfig.branch) &&
          info.repository.organization === org) {
          exports.launchBuilder(info, builderConfig, done);
        }
      };
  webhook.on('create', handler);
  webhook.on('push', handler);
};

exports.SiteBuilder = SiteBuilder;
