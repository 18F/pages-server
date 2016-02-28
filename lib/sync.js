'use strict';

var path = require('path');

module.exports = Sync;

function Sync(config, commandRunner, logger) {
  this.home = config.home;
  this.s3 = config.s3;
  this.commandRunner = commandRunner;
  this.logger = logger;
}

Sync.prototype.sync = function(buildDestination) {
  var homePrefix = path.join(this.home, path.sep),
      s3Path;

  if (buildDestination.substr(0, homePrefix.length) !== homePrefix) {
    throw new Error('invalid build destination ' + buildDestination +
      '; should be a subdirectory of ' + this.home);
  }

  if (!this.s3) {
    return Promise.resolve();
  }

  s3Path = this.s3.bucket +
    buildDestination.substr(this.home.length).replace(/\\/g, '/');

  this.logger.log('syncing to', s3Path);
  return this.commandRunner.run(this.s3.awscli,
    ['s3', 'sync', buildDestination, s3Path, '--delete'],
    null, 's3 sync failed for');
};
