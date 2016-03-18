'use strict';

var CommandRunner = require('../lib/command-runner');
var path = require('path');
var sinon = require('sinon');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');

var TEST_COMMAND = path.join(__dirname, 'fake-command.js');

chai.should();
chai.use(chaiAsPromised);

describe('CommandRunner', function() {
  var runner, fakeLogger;

  beforeEach(function() {
    fakeLogger = { log: sinon.spy(), error: sinon.spy() };
    runner = new CommandRunner(__dirname, 'pages-server', fakeLogger);
  });

  it('should pass stdout to the logger and exit normally', function() {
    return runner.run('node', [TEST_COMMAND, 'foo', 'bar', 'baz'])
      .should.be.fulfilled.then(function() {
        fakeLogger.log.args.should.eql([['foo bar baz']]);
        sinon.assert.notCalled(fakeLogger.error);
      });
  });

  it('should pass stderr to the logger, exit with error message', function() {
    return runner.run('node', [TEST_COMMAND], null, 'test command failed for')
      .should.be.rejectedWith('Error: test command failed for pages-server ' +
        'with exit code 1 from command: node ' + TEST_COMMAND)
      .then(function() {
        sinon.assert.notCalled(fakeLogger.log);
        fakeLogger.error.args.should.eql(
          [['no arguments passed on the command line']]);
      });
  });

  it('should log and ignore the stdio option', function() {
    return runner.run('node', [TEST_COMMAND, 'foobar'], { stdio: 'inherit' })
      .should.be.fulfilled.then(function() {
        fakeLogger.log.args.should.eql([['foobar']]);
        fakeLogger.error.args.should.eql(
          [['CommandRunner ignoring stdio option value: inherit']]);
      });
  });

  it('should log a proper error if the command fails to spawn', function() {
    return runner.run('bogus-node', ['nonexistent', 'test'])
      .should.be.rejectedWith('Error: rebuild failed for pages-server due ' +
        'to failed command: bogus-node nonexistent test: ')
      .then(function() {
        sinon.assert.notCalled(fakeLogger.log);
        sinon.assert.notCalled(fakeLogger.error);
      });
  });
});
