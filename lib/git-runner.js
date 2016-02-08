'use strict';

var fs = require('fs');

module.exports = GitRunner;

function GitRunner(config, builderOpts, commandRunner, logger) {
  this.git = config.git;
  this.githubOrg = builderOpts.githubOrg;
  this.repoDir = builderOpts.repoDir;
  this.sitePath = builderOpts.sitePath;
  this.commandRunner = commandRunner;
  this.logger = logger;
}

GitRunner.prototype.prepareRepo = function(branch) {
  var gitRunner = this;

  return new Promise(function(resolve) {
    fs.exists(gitRunner.sitePath, function(exists) {
      resolve(
        exists ? syncRepo(gitRunner, branch) : cloneRepo(gitRunner, branch));
    });
  });
};

function syncRepo(gitRunner, branch) {
  var commandRunner = gitRunner.commandRunner,
      git = gitRunner.git;

  gitRunner.logger.log('syncing repo:', commandRunner.repoName);
  return commandRunner.run(git, ['fetch', 'origin', branch])
    .then(function() {
      return commandRunner.run(git, ['clean', '-f']);
    })
    .then(function() {
      return commandRunner.run(git, ['reset', '--hard', 'origin/' + branch]);
    })
    .then(function() {
      return commandRunner.run(
        git, ['submodule', 'sync', '--recursive']);
    })
    .then(function() {
      return commandRunner.run(
        git, ['submodule', 'update', '--init', '--recursive']);
    });
}

function cloneRepo(gitRunner, branch) {
  var cloneAddr = 'git@github.com:' + gitRunner.githubOrg + '/' +
        gitRunner.commandRunner.repoName + '.git',
      cloneArgs = ['clone', cloneAddr, '--branch', branch],
      cloneOpts = {cwd: gitRunner.repoDir, stdio: 'inherit'},
      errMsg = 'failed to clone';

  gitRunner.logger.log('cloning', gitRunner.commandRunner.repoName,
    'into', gitRunner.commandRunner.sitePath);
  return gitRunner.commandRunner.run(
    gitRunner.git, cloneArgs, cloneOpts, errMsg);
}
