'use strict';

var CommandRunner = require('../lib/command-runner');
var sinon = require('sinon');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');

var TEST_COMMAND = 'fake-command.js';

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
        fakeLogger.log.args.should.eql([['foo bar baz\n']]);
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
          [['no arguments passed on the command line\n']]);
      });
  });
});
