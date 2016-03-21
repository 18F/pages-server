'use strict';

var BuildLogger = require('./build-logger');
var Options = require('./options');
var ComponentFactory = require('./component-factory');
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');

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
      .then(function() {
        return builder.configHandler.init();
      })
      .then(function() {
        if (builder.configHandler.usesBundler) {
          return builder.commandRunner.run(
            config.bundler, ['install',
              '--path=' + path.join(config.home, config.bundlerCacheDir)]);
        }
      })
      .then(function() {
        return builder.configHandler.usesJekyll ?
          buildJekyll(builder) : rsync(builder);
      })
      .then(function() {
        return syncResults(builder);
      });
  };

  return builder.updateLock.doLockedOperation(doBuild);
};

function rsync(builder) {
  return builder.configHandler.buildConfigurations().reduce(
    function(previousRsync, buildConfig) {
      return generateRsyncOp(builder, previousRsync, buildConfig);
    },
    Promise.resolve());
}

function generateRsyncOp(builder, previousRsync, buildConfig) {
  return previousRsync.then(function() {
    return builder.commandRunner.run(config.rsync,
      config.rsyncOpts.concat(['./', buildConfig.destination]));
  });
}

function buildJekyll(builder) {
  var cleanup = function(err) {
    return builder.configHandler.removeGeneratedConfig(err);
  };

  return builder.configHandler.readOrWriteConfig()
    .then(function() {
      return builder.jekyllHelper.build(
        builder.configHandler.buildConfigurations(),
        { bundler: builder.configHandler.usesBundler });
    })
    .then(cleanup, cleanup);
}

function syncResults(builder) {
  return builder.configHandler.buildConfigurations().reduce(
    function(previousSync, buildConfig) {
      return generateSyncOp(builder, previousSync, buildConfig);
    },
    Promise.resolve());
}

function generateSyncOp(builder, previousSync, buildConfig) {
  return previousSync.then(function() {
    return builder.sync.sync(buildConfig.destination);
  });
}

SiteBuilder.launchBuilder = function(info, branch, builderConfig) {
  var builderOpts = new Options(info, config, builderConfig),
      commit = info.head_commit,
      buildLog = builderOpts.sitePath + '.log',
      logger = new BuildLogger(buildLog),
      builder = new SiteBuilder(
        branch,
        new ComponentFactory(config, builderOpts, branch, logger)),
      finishBuild,
      migrateLog;

  logger.log(info.repository.full_name + ':',
    'starting build at commit', commit.id);
  logger.log('description:', commit.message);
  logger.log('timestamp:', commit.timestamp);
  logger.log('committer:', commit.committer.email);
  logger.log('pusher:', info.pusher.name, info.pusher.email);
  logger.log('sender:', info.sender.login);

  finishBuild = function(err) {
    return new Promise(function(resolve, reject) {
      // Provides https://pages.18f.gov/REPO-NAME/build.log as an indicator of
      // latest status.
      if (err) {
        logger.error(err.message ? err.message : err);
        logger.error(builderOpts.repoName + ': build failed');
      } else {
        logger.log(builderOpts.repoName + ': build successful');
      }
      logger.close(function() {
        return err ? reject(err) : resolve();
      });
    });
  };

  migrateLog = function(err) {
    var newLogPath = path.join(
          builder.configHandler.buildDestination, 'build.log');

    return copyLog(buildLog, newLogPath)
      .then(function() {
        return removeLog(buildLog);
      })
      .catch(function(err) {
        console.error('Error moving build log: ' + (err.message || err));
        return Promise.reject(err);
      })
      .then(function() {
        return err ? Promise.reject(err) : Promise.resolve();
      });
  };
  return createBuildDestinationDir(builder.configHandler.buildDestination)
    .then(function() {
      return builder.build();
    })
    .then(finishBuild, finishBuild)
    .then(migrateLog, migrateLog);
};

function createBuildDestinationDir(buildDestinationDir) {
  return new Promise(function(resolve, reject) {
    mkdirp(buildDestinationDir, function(err) {
      if (err) {
        return reject(new Error('Creating build destination dir failed: ' +
          err.message));
      }
      resolve();
    });
  });
}

// In the Dockerized 18F/knowledge-sharing-toolkit environment, the git
// repositories live on one Docker volume (pages/repos), and the generated
// sites live on another (pages/sites). This server orignally used
// fs.rename(), which failed in this environment with the error:
//
//   Error moving build log: Error: EXDEV: cross-device link not permitted,
//   rename '/usr/local/18f/pages/repos/pages-internal.18f.gov/hub.log' ->
//   '/usr/local/18f/pages/sites/pages-internal.18f.gov/hub/build.log'
//
// Copying and manually removing the original log resolves this issue.
function copyLog(sourceLog, targetLog) {
  return new Promise(function(resolve, reject) {
    var sourceStream = fs.createReadStream(sourceLog),
        targetStream = fs.createWriteStream(targetLog);

    sourceStream.on('error', reject);
    targetStream.on('error', reject);
    targetStream.on('close', resolve);
    sourceStream.pipe(targetStream);
  });
}

function removeLog(sourceLog) {
  return new Promise(function(resolve, reject) {
    fs.unlink(sourceLog, function(err) {
      return err ? reject(err) : resolve();
    });
  });
}

SiteBuilder.makeBuilderListener = function(webhook, builderConfig) {
  var org = builderConfig.githubOrg || config.githubOrg,
      branchPattern = builderConfig.branchInUrlPattern || builderConfig.branch,
      branchRegexp,
      handler;

  branchRegexp = new RegExp('refs/heads/(' + branchPattern + ')$');

  handler = function(info) {
    var branch = branchRegexp.exec(info.ref);

    if (branch && (info.repository.organization === org)) {
      return SiteBuilder.launchBuilder(info, branch[1], builderConfig);
    }
  };
  webhook.on('create', handler);
  webhook.on('push', handler);
  return handler;
};
