'use strict';

var CommandRunner = require('./command-runner');
var JekyllCommandHelper = require('./jekyll-command-helper');
var BuildLogger = require('./build-logger');
var Options = require('./options');
var fileLockedOperation = require('file-locked-operation');
var fs = require('fs');
var path = require('path');

module.exports = SiteBuilder;

var config = null;

SiteBuilder.setConfiguration = function(configuration) {
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
// branch: Branch to build
// commandRunner: CommandRunner instance
// jekyllHelper: JekyllCommandHelper instance
// buildLogger: BuildLogger instance
// updateLock: FileLockedOperation instance
function SiteBuilder(opts, branch, commandRunner, jekyllHelper,
  buildLogger, updateLock) {
  this.opts = opts;
  this.branch = branch;
  this.commandRunner = commandRunner;
  this.jekyllHelper = jekyllHelper;
  this.logger = buildLogger;
  this.updateLock = updateLock;
  this.buildDestination = path.join(opts.destDir, opts.repoName);
  if (opts.internalDestDir) {
    this.internalBuildDestination = path.join(
      opts.internalDestDir, opts.repoName);
  }
}

SiteBuilder.prototype.finishBuild = function() {
  var builder = this,
      logger = this.logger,
      opts = this.opts;

  return new Promise(function(resolve, reject) {
    var configPath = path.join(opts.sitePath, opts.pagesConfig);

    if (builder.generatedConfig) {
      logger.log('removing generated', opts.pagesConfig);
      fs.unlink(configPath, function(unlinkErr) {
        if (unlinkErr) {
          logger.log('error removing ' + configPath + ': ' + unlinkErr);
          reject(unlinkErr);
        }
        resolve();
      });
    } else {
      resolve();
    }
  });
};

SiteBuilder.prototype.spawn = function(path, args) {
  return this.commandRunner.run(path, args);
};

SiteBuilder.prototype.build = function(done) {
  var builder = this;

  return new Promise(function() {
    var doBuild,
        finish;

    doBuild = function(lockedOperationDone) {
      fs.exists(builder.opts.sitePath, function(exists) {
        (exists ? builder.syncRepo() : builder.cloneRepo())
          .then(function() { return builder.checkForFile('_config.yml'); })
          .then(function(useJekyll) {
            return (useJekyll ? builder._buildJekyll() : builder._rsync());
          })
          .then(lockedOperationDone, lockedOperationDone);
      });
    };

    finish = function(err) {
      return builder.finishBuild()
        .then(function() {
          done(err);
        });
    };

    builder.updateLock.doLockedOperation(doBuild, finish);
  });
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
  var cloneAddr = 'git@github.com:' + this.opts.githubOrg + '/' +
        this.opts.repoName + '.git',
      cloneArgs = ['clone', cloneAddr, '--branch', this.branch],
      cloneOpts = {cwd: this.opts.repoDir, stdio: 'inherit'};

  this.logger.log('cloning', this.opts.repoName, 'into', this.opts.sitePath);
  return this.commandRunner.run(config.git, cloneArgs, cloneOpts,
    'failed to clone');
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
    var content,
        baseurl = '/' + that.opts.repoName;

    if (that.opts.branchInUrlPattern) {
      baseurl = baseurl + '/' + that.branch;
    }

    // asset_root: is used by the guides_style_18f gem to ensure that updates
    // to common CSS and JavaScript files can be applied to Pages without
    // having to update the gem.
    content = 'baseurl: ' + baseurl + '\n' +
      'asset_root: ' + that.opts.assetRoot + '\n';
    fs.writeFile(configPath, content, function(err) {
      if (err) { return reject(err); }
      that.generatedConfig = true;
      resolve();
    });
  });
};

SiteBuilder.prototype.jekyllBuild = function() {
  var builder = this,
      extConf = this.hasExternalConfig ? '_config_external.yml' : undefined,
      opts = { bundler: this.usesBundler, branch: this.branch };

  if (!this.hasInternalConfig) {
    return this.jekyllHelper.run(this.buildDestination, opts);
  }
  return this.jekyllHelper.run(
    this.internalBuildDestination, opts, '_config_internal.yml')
    .then(function() {
      return builder.jekyllHelper.run(builder.buildDestination, opts, extConf);
    });
};

SiteBuilder.launchBuilder = function(info, branch, builderConfig, done) {
  var builderOpts = new Options(info, config, builderConfig),
      commit = info.head_commit,
      commandRunner = new CommandRunner(
        builderOpts.sitePath, builderOpts.repoName),
      jekyllHelper = new JekyllCommandHelper(
        commandRunner, builderOpts, config.jekyll, config.bundler),
      buildLog = builderOpts.sitePath + '.log',
      logger = new BuildLogger(buildLog),
      lockfilePath = path.join(builderOpts.destDir,
        '.update-lock-' + builderOpts.repoName),
      updateLock = new fileLockedOperation.FileLockedOperation(lockfilePath,
        { wait: config.fileLockWaitTime, poll: config.fileLockPollTime }),
      builder = new SiteBuilder(builderOpts, branch, commandRunner,
        jekyllHelper, logger, updateLock);

  logger.log(info.repository.full_name + ':',
    'starting build at commit', commit.id);
  logger.log('description:', commit.message);
  logger.log('timestamp:', commit.timestamp);
  logger.log('committer:', commit.committer.email);
  logger.log('pusher:', info.pusher.name, info.pusher.email);
  logger.log('sender:', info.sender.login);

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
      logger.close(function() {
        if (done) {
          done(err);
        }
      });
    });
  });
};

SiteBuilder.makeBuilderListener = function(webhook, builderConfig, done) {
  var org = builderConfig.githubOrg || config.githubOrg,
      branchPattern = builderConfig.branchInUrlPattern || builderConfig.branch,
      branchRegexp,
      handler;

  branchRegexp = new RegExp('refs/heads/(' + branchPattern + ')');

  handler = function(info) {
    var branch = branchRegexp.exec(info.ref);

    if (branch && (info.repository.organization === org)) {
      SiteBuilder.launchBuilder(info, branch[1], builderConfig, done);
    }
  };
  webhook.on('create', handler);
  webhook.on('push', handler);
};
