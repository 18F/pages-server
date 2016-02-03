'use strict';

var BuildLogger = require('../lib/build-logger.js');
var path = require('path');
var fs = require('fs');
var sinon = require('sinon');
var chai = require('chai');

chai.should();

describe('BuildLogger', function() {
  var logger, logFileDir, logFilePath, captureConsole, checkAndRestoreConsole;

  before(function() {
    logFileDir = path.resolve(__dirname, 'buildLogger_test');
    logFilePath = path.resolve(logFileDir, 'build.log');
  });

  beforeEach(function(done) {
    fs.exists(logFileDir, function(exists) {
      (exists ? fs.chmod : fs.mkdir)(logFileDir, '0700', done);
    });
  });

  afterEach(function(done) {
    fs.exists(logFilePath, function(exists) {
      if (exists) { fs.unlink(logFilePath, done); } else { done(); }
    });
  });

  after(function(done) {
    fs.exists(logFileDir, function(exists) {
      if (exists) { fs.rmdir(logFileDir, done); } else { done(); }
    });
  });

  captureConsole = function() {
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');
  };

  checkAndRestoreConsole = function(done, validate) {
    return function() {
      var err;

      try {
        validate();
      } catch (e) {
        err = e;
      } finally {
        console.error.restore();
        console.log.restore();
        done(err);
      }
    };
  };

  it('should log everything to the file', function(done) {
    logger = new BuildLogger(logFilePath);
    captureConsole();
    logger.log('This', 'should', 'be', 'logged', 'to', 'the', 'file');
    logger.error('This', 'should', 'also', 'be', 'logged', 'to', 'the', 'file');
    logger.close(checkAndRestoreConsole(done, function() {
      console.log.args.should.eql(
        [['This', 'should', 'be', 'logged', 'to', 'the', 'file']]);
      console.error.args.should.eql(
        [['This', 'should', 'also', 'be', 'logged', 'to', 'the', 'file']]);
      fs.readFileSync(logFilePath).toString().should.eql(
        'This should be logged to the file\n' +
        'This should also be logged to the file\n');
    }));
  });

  it('should log to a null file', function(done) {
    logger = new BuildLogger();
    captureConsole();
    logger.log('This', 'should', 'be', 'logged', 'to', 'stdout');
    logger.error('This', 'should', 'be', 'logged', 'to', 'stderr');
    logger.close(checkAndRestoreConsole(done, function() {
      console.log.args.should.eql(
        [['This', 'should', 'be', 'logged', 'to', 'stdout']]);
      console.error.args.should.eql(
        [['This', 'should', 'be', 'logged', 'to', 'stderr']]);
    }));
  });
});
