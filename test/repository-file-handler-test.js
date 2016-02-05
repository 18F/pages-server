'use strict';

var RepositoryFileHandler = require('../lib/repository-file-handler');
var temp = require('temp');
var scriptName = require('../package.json').name;
var chai = require('chai');

chai.should();

describe('RepositoryFileHandler', function() {
  var fileHandler, filesToDelete, writeFile;

  before(function() {
    return new Promise(function(resolve, reject) {
      temp.mkdir(scriptName + '-repository-file-handler-test-files-',
        function(err, tempDir) {
          err ? reject(err) : resolve(tempDir);  
        });
    })
    .then(function(tempDir) {
      fileHandler = new RepositoryFileHandler(tempDir);
    });
  });

  beforeEach(function() {
    filesToDelete = [];
  });

  afterEach(function() {
    return Promise.all(filesToDelete.map(function(filename) {
      return fileHandler.unlink(filename);
    }));
  });

  after(function() {
    return fileHandler.rmdir('');
  });

  writeFile = function(filename, content) {
    return fileHandler.writeFile(filename, content)
      .then(function() {
        filesToDelete.push(filename);
      });
  };

  it('should detect that the siteDir exists', function() {
    return fileHandler.exists('');
  });

  it('should detect when a file does and doesn\'t exist', function() {
    return fileHandler.exists('testfile').should.become(false)
      .then(function() {
        // Use fileHandler.writeFile() directly to avoid adding the file to
        // filesToDelete.
        return fileHandler.writeFile('testfile', 'content!');
      })
      .then(function() {
        return fileHandler.exists('testfile').should.become(true);
      })
      .then(function() {
        return fileHandler.unlink('testfile');
      })
      .then(function() {
        return fileHandler.exists('testfile').should.become(false);
      });
  });

  it('should be able to write to and read content from a file', function() {
    return fileHandler.exists('testfile').should.become(false)
      .then(function() {
        return writeFile('testfile', 'content!');
      })
      .then(function() {
        return fileHandler.exists('testfile').should.become(true);
      })
      .then(function() {
        return fileHandler.readFile('testfile').should.become('content!');
      });
  });

  it('should propagate errors for nonexistent files', function() {
    return fileHandler.exists('testfile').should.become(false)
      .then(function() {
        return fileHandler.unlink('testfile').should.be.rejectedWith(
          Error, 'error removing ' + fileHandler.path('testfile'));
      })
      .then(function() {
        return fileHandler.readFile('testfile').should.be.rejectedWith(
          Error, fileHandler.path('testfile'));
      });
  });

  it('should propagate errors for nonexistent directories', function() {
    return fileHandler.exists('testdir').should.become(false)
      .then(function() {
        return fileHandler.rmdir('testdir').should.be.rejectedWith(
          Error, 'error removing ' + fileHandler.path('testdir'));
      })
      .then(function() {
        return fileHandler.writeFile(fileHandler.path('testdir/testfile'))
          .should.be.rejectedWith(Error, fileHandler.path('testdir/testfile'));
      });
  });
});
