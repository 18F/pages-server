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
  return removeItem(this, 'unlink', filePath);
};

RepositoryFileHandler.prototype.rmdir = function(dirname) {
  return removeItem(this, 'rmdir', dirname);
};

function removeItem(fileHandler, operation, itemPath) {
  var fullPath = fileHandler.path(itemPath);

  return new Promise(function(resolve, reject) {
    fs[operation](fullPath, function(err) {
      if (err) {
        return reject(new Error('error removing ' + fullPath + ': ' + err));
      }
      resolve();
    });
  });
}

RepositoryFileHandler.prototype.readFile = function(filePath) {
  var fullPath = this.path(filePath);

  return new Promise(function(resolve, reject) {
    fs.readFile(fullPath, 'utf8', function(err, data) {
      if (err) {
        return reject(err);
      }
      resolve(data);
    });
  });
};

RepositoryFileHandler.prototype.writeFile = function(filePath, content) {
  var fullPath = this.path(filePath);

  return new Promise(function(resolve, reject) {
    fs.writeFile(fullPath, content, function(err) {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
};
