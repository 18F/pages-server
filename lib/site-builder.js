'use strict';

var BuildLogger = require('./build-logger');
var Options = require('./options');
var ComponentFactory = require('./component-factory');
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
// branch: Branch to build
// components: object containing all the components needed by the SiteBuilder
function SiteBuilder(branch, components) {
  var builder = this;

  this.branch = branch;
  Object.keys(components).forEach(function(key) {
    builder[key] = components[key];
  });
}

SiteBuilder.prototype.build = function() {
  var builder = this,
      doBuild;

  doBuild = function() {
    return builder.gitRunner.prepareRepo(builder.branch)
      .then(function() { return builder.configHandler.hasJekyllConfig(); })
      .then(function(useJekyll) {
        return (useJekyll ? buildJekyll(builder) : rsync(builder));
      });
  };

  return builder.updateLock.doLockedOperation(doBuild);
};

function rsync(builder) {
  return builder.commandRunner.run(config.rsync,
    config.rsyncOpts.concat(['./', builder.configHandler.buildDestination]));
}

function buildJekyll(builder) {
  var cleanup = function(err) {
    return builder.configHandler.removeGeneratedConfig(err);
  };

  return builder.configHandler.init()
    .then(function() {
      return builder.fileHandler.exists('Gemfile');
    })
    .then(function(usesBundler) {
      return builder.updateBundle(usesBundler);
    })
    .then(function() {
      return builder.configHandler.readOrWriteConfig();
    })
    .then(function() {
      return builder.jekyllHelper.build(builder.configHandler,
        { bundler: builder.usesBundler, branch: builder.branch });
    })
    .then(cleanup, cleanup);
}

SiteBuilder.prototype.updateBundle = function(usesBundler) {
  if (!usesBundler) { return; }
  this.usesBundler = usesBundler;
  return this.commandRunner.run(config.bundler, ['install']);
};

SiteBuilder.launchBuilder = function(info, branch, builderConfig, done) {
  var builderOpts = new Options(info, config, builderConfig),
      commit = info.head_commit,
      buildLog = builderOpts.sitePath + '.log',
      logger = new BuildLogger(buildLog),
      builder = new SiteBuilder(
        branch,
        new ComponentFactory(config, builderOpts, branch, logger)),
      finishBuild;

  logger.log(info.repository.full_name + ':',
    'starting build at commit', commit.id);
  logger.log('description:', commit.message);
  logger.log('timestamp:', commit.timestamp);
  logger.log('committer:', commit.committer.email);
  logger.log('pusher:', info.pusher.name, info.pusher.email);
  logger.log('sender:', info.sender.login);

  finishBuild = function(err) {
    if (err !== undefined) {
      logger.error(err);
      logger.error(builderOpts.repoName + ': build failed');
    } else {
      logger.log(builderOpts.repoName + ': build successful');
    }

    // Provides https://pages.18f.gov/REPO-NAME/build.log as an indicator of
    // latest status.
    var newLogPath = path.join(
      builder.configHandler.buildDestination, 'build.log');
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
  };
  return builder.build()
    .then(finishBuild, finishBuild);
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
