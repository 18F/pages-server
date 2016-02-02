'use strict';

var fs = require('fs');
var path = require('path');

module.exports = RepositoryFileHandler;

function RepositoryFileHandler(sitePath) {
  this.sitePath = sitePath;
}

RepositoryFileHandler.prototype.path = function(filePath) {
  return path.join(this.sitePath, filePath);
};

RepositoryFileHandler.prototype.exists = function(filePath) {
  var fullPath = this.path(filePath);

  return new Promise(function(resolve) {
    fs.exists(fullPath, resolve);
  });
};

RepositoryFileHandler.prototype.unlink = function(filePath) {
  var fullPath = this.path(filePath);

  return new Promise(function(resolve, reject) {
    fs.unlink(fullPath, function(err) {
      if (err) {
        return reject(new Error('error removing ' + fullPath + ': ' + err));
      }
      resolve();
    });
  });
};
