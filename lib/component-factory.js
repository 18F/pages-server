'use strict';

var CommandRunner = require('./command-runner');
var RepositoryFileHandler = require('./repository-file-handler');
var ConfigHandler = require('./config-handler');
var GitRunner = require('./git-runner');
var JekyllCommandHelper = require('./jekyll-command-helper');
var Sync = require('./sync');
var FileLockedOperation = require('file-locked-operation');
var path = require('path');

module.exports = ComponentFactory;

function ComponentFactory(config, builderOpts, branch, logger) {
  this.commandRunner = new CommandRunner(
    builderOpts.sitePath, builderOpts.repoName);
  this.configHandler = new ConfigHandler(
    builderOpts, branch,
    new RepositoryFileHandler(builderOpts.sitePath), logger);
  this.jekyllHelper = new JekyllCommandHelper(config, this.commandRunner);
  this.gitRunner = new GitRunner(
    config, builderOpts, this.commandRunner, logger);
  this.sync = new Sync(config, this.commandRunner, logger);
  this.updateLock = new FileLockedOperation(
    path.join(builderOpts.destDir, '.update-lock-' + builderOpts.repoName),
    { wait: config.fileLockWaitTime, poll: config.fileLockPollTime });
}
