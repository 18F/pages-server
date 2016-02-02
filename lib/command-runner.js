'use strict';

var childProcess = require('child_process');

module.exports = CommandRunner;

function CommandRunner(sitePath, repoName) {
  this.sitePath = sitePath;
  this.repoName = repoName;
}

CommandRunner.prototype.run = function(path, args, opts, message) {
  return doRun(this, path, args, opts, message);
};

function doRun(runner, path, args, opts, message) {
  return new Promise(function(resolve, reject) {
    var options = opts || {cwd: runner.sitePath, stdio: 'inherit'},
        msg = message || 'rebuild failed for';

    childProcess.spawn(path, args, options).on('close', function(code) {
      if (code !== 0) {
        reject('Error: ' + msg + ' ' + runner.repoName + ' with exit code ' +
          code + ' from command: ' + path + ' ' + args.join(' '));
      } else {
        resolve();
      }
    });
  });
}
