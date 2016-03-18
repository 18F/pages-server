'use strict';

var childProcess = require('child_process');

module.exports = CommandRunner;

function CommandRunner(sitePath, repoName, logger) {
  this.sitePath = sitePath;
  this.repoName = repoName;
  this.logger = logger;
}

CommandRunner.prototype.run = function(path, args, opts, message) {
  return doRun(this, path, args, opts, message);
};

function doRun(runner, path, args, opts, message) {
  return new Promise(function(resolve, reject) {
    var command,
        options = opts || {cwd: runner.sitePath},
        msg = message || 'rebuild failed for',
        error;

    command = childProcess.spawn(path, args, options);
    command.on('error', function(err) {
      error = err;
      reject('Error: ' + msg + ' ' + runner.repoName + ' due to failed ' +
        'command: ' + path + ' ' + args.join(' ') + ': ' + err.message);
    });

    command.stdout.setEncoding('utf8');
    command.stdout.on('data', function(data) {
      runner.logger.log(data.trimRight());
    });

    command.stderr.setEncoding('utf8');
    command.stderr.on('data', function(data) {
      runner.logger.error(data.trimRight());
    });

    command.on('close', function(code) {
      if (error) {
        return;
      }
      if (code !== 0) {
        reject('Error: ' + msg + ' ' + runner.repoName + ' with exit code ' +
          code + ' from command: ' + path + ' ' + args.join(' '));
      } else {
        resolve();
      }
    });
  });
}
