'use strict';

var fs = require('fs');
var path = require('path');
var temp = require('temp');
var scriptName = require('../package.json').name;

module.exports = FilesHelper;

function FilesHelper() {
}

FilesHelper.prototype.init = function(config) {
  var helper = this;

  return new Promise(function(resolve, reject) {
    temp.mkdir(scriptName + '-test-files-', function(err, tempDir) {
      var testRepoDir = path.resolve(tempDir, 'site_builder_test'),
          lockDir = path.resolve(tempDir, 'site_builder_test_lock_dir');

      if (err) {
        return reject(err);
      }

      fs.mkdir(lockDir, '0700', function(err) {
        if (err) {
          return reject(err);
        }
        initHelper(helper, config, tempDir, testRepoDir, lockDir);
        resolve();
      });
    });
  });
};

function initHelper(helper, config, tempDir, testRepoDir, lockDir) {
  helper.dirs = {
    testRepoDir: testRepoDir,
    lockDir: lockDir,
    tempDir: tempDir
  };

  helper.files = {
    gemfile: path.resolve(testRepoDir, 'Gemfile'),
    pagesConfig: path.resolve(testRepoDir, config.pagesConfig),
    configYml: path.resolve(testRepoDir, '_config.yml'),
    internalConfig: path.resolve(testRepoDir, '_config_internal.yml'),
    externalConfig: path.resolve(testRepoDir, '_config_external.yml'),
    lockfilePath: path.resolve(lockDir, '.update-lock-repo_name')
  };

  helper.filesToDelete = [];
}

FilesHelper.prototype.afterEach = function() {
  var helper = this,
      files = helper.filesToDelete.slice();

  helper.filesToDelete = [];
  files = files.concat(Object.keys(helper.files).map(function(key) {
    return helper.files[key];
  }));

  return removeItems(files, 'unlink')
    .then(function() {
      return helper.removeDir(helper.dirs.testRepoDir);
    });
};

FilesHelper.prototype.after = function() {
  return removeItems([this.dirs.lockDir, this.dirs.tempDir], 'rmdir');
};

FilesHelper.prototype.createRepoDir = function(done) {
  var helper = this;
  fs.mkdir(this.dirs.testRepoDir, '0700', function() {
    fs.writeFile(helper.files.configYml, '', done);
  });
};

FilesHelper.prototype.createRepoWithFiles = function(nameToContents, done) {
  var helper = this,
      filesRemaining,
      allDone;

  this.filesToDelete = Object.keys(nameToContents);
  filesRemaining = this.filesToDelete.length,
  allDone = function() {
    filesRemaining--;
    if (filesRemaining === 0) { done(); }
  };

  this.createRepoDir(function() {
    helper.filesToDelete.map(function(name) {
      fs.writeFile(name, nameToContents[name], allDone);
    });
  });
};

FilesHelper.prototype.removeFile = function(filename) {
  return removeItem(filename, 'unlink');
};

FilesHelper.prototype.removeDir = function(dirname) {
  return removeItem(dirname, 'rmdir');
};

function removeItems(items, operation) {
  var remover;

  remover = function(result, item) {
    return result.then(function() {
      return removeItem(item, operation);
    });
  };
  return items.reduce(remover, Promise.resolve());
}

function removeItem(name, operation) {
  return new Promise(function(resolve, reject) {
    fs.exists(name, function(exists) {
      if (!exists) {
        return resolve();
      }
      fs[operation](name, function(err) {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  });
}
