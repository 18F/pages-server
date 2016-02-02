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
      if (exists) {
        return resolve(gitRunner.syncRepo());
      }
      return resolve(gitRunner.cloneRepo(branch));
    });
  });
};

GitRunner.prototype.syncRepo = function() {
  var commandRunner = this.commandRunner,
      git = this.git;

  this.logger.log('syncing repo:', this.commandRunner.repoName);
  return commandRunner.run(git, ['stash'])
    .then(function() {
      return commandRunner.run(git, ['pull']);
    })
    .then(function() {
      return commandRunner.run(git, ['submodule', 'update', '--init']);
    });
};

GitRunner.prototype.cloneRepo = function(branch) {
  var cloneAddr = 'git@github.com:' + this.githubOrg + '/' +
        this.commandRunner.repoName + '.git',
      cloneArgs = ['clone', cloneAddr, '--branch', branch],
      cloneOpts = {cwd: this.repoDir, stdio: 'inherit'},
      errMsg = 'failed to clone';

  this.logger.log('cloning', this.commandRunner.repoName,
    'into', this.commandRunner.sitePath);
  return this.commandRunner.run(this.git, cloneArgs, cloneOpts, errMsg);
};
