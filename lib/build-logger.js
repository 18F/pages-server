'use strict';

var fs = require('fs');

module.exports = BuildLogger;

// Message logger that logs both to the console and a repo-specific build.log.
function BuildLogger(logFilePath) {
  this.logFile = fs.createWriteStream(logFilePath, { flags: 'a' });
}

BuildLogger.prototype.log = function() {
  console.log.apply(console, arguments);
  writeToLogFile.apply(this.logFile, arguments);
};

BuildLogger.prototype.error = function() {
  console.error.apply(console, arguments);
  writeToLogFile.apply(this.logFile, arguments);
};

BuildLogger.prototype.close = function(done) {
  this.logFile.on('finish', done);
  this.logFile.end();
};

function writeToLogFile() {
  var i,
      endIndex = arguments.length - 1;

  for (i = 0; i !== arguments.length; ++i) {
    this.write(arguments[i]);
    if (i !== endIndex) {
      this.write(' ');
    }
  }
  this.write('\n');
}
