/* jshint node: true */
/* jshint expr: true */
/* jshint mocha: true */
'use strict';

var pagesServer = require('../index.js');
var RequestHelper = require('./request-helper.js');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var sinon = require('sinon');
var childProcess = require('child_process');
var mockSpawn = require('mock-spawn');
var fs = require('fs');
var path = require('path');

var expect = chai.expect;
chai.should();
chai.use(chaiAsPromised);

var config = {
  'port':             0,
  'home':             __dirname,
  'git':              'git',
  'bundler':          'bundle',
  'jekyll':           'jekyll',
  'rsync':            'rsync',
  'rsyncOpts':        ['-vaxp', '--delete', '--ignore-errors'],
  'payloadLimit':     1048576,
  'githubOrg':        '18F',
  'pagesConfig':      '_config_18f_pages.yml',
  'assetRoot':        '/guides-template',
  'fileLockWaitTime': 30000,
  'fileLockPollTime': 1000,
  'secretKeyFile':    path.join(__dirname, 'data', 'default.secret'),
  'builders': [
    {
      'branch':           '18f-pages',
      'repositoryDir':    'pages-repos',
      'generatedSiteDir': 'pages-generated',
      'secretKeyFile':    path.join(__dirname, 'data', '18f-pages.secret'),
    }
  ]
};

describe('launchServer', function() {
  var server, port, helper;
  var origSpawn, mySpawn;
  var defaultKey, pagesBranchKey;

  var captureLogs = function() {
    sinon.stub(console, 'log').returns(null);
    sinon.stub(console, 'error').returns(null);
  };

  var restoreLogs = function() {
    console.error.restore();
    console.log.restore();
  };

  before(function(done) {
    defaultKey = fs.readFileSync(config.secretKeyFile, 'utf8').trim();
    pagesBranchKey = fs.readFileSync(
      config.builders[0].secretKeyFile, 'utf8').trim();
    captureLogs();
    pagesServer.launchServer(config).then(function(runningServer) {
      server = runningServer;
      port = server.address().port;
      restoreLogs();
      done();
    }).catch(function(err) { restoreLogs(); done(err); });
    helper = new RequestHelper();
  });

  beforeEach(function() {
    origSpawn = childProcess.spawn;
    mySpawn = mockSpawn();
    mySpawn.setDefault(mySpawn.simple(0));
  });

  afterEach(function() {
    childProcess.spawn = origSpawn;
  });

  after(function() {
    server.close();
  });

  it('should have launched the server', function() {
    expect(server).to.not.be.undefined;
  });

  it('should make a successful request for 18f-pages', function() {
    var payload = helper.makePayload('18f-pages');
    var options = helper.httpOptions(port, payload, pagesBranchKey);
    return helper.sendRequest(options, payload).should.become('Accepted\n');
  });

  it('should make a successful request for master with default', function() {
    var payload = helper.makePayload('master');
    var options = helper.httpOptions(port, payload, defaultKey);
    return helper.sendRequest(options, payload).should.become('Accepted\n');
  });

  it('should fail a request for 18f-pages with the wrong key', function() {
    var payload = helper.makePayload('18f-pages');
    var options = helper.httpOptions(port, payload, defaultKey);
    return helper.sendRequest(options, payload)
      .should.be.rejectedWith('invalid webhook: 18f-pages');
  });

  it('should fail a request for 18f-pages if signature missing', function() {
    var payload = helper.makePayload('18f-pages');
    var options = helper.httpOptions(port, payload, pagesBranchKey);
    delete options.headers['X-Hub-Signature'];
    return helper.sendRequest(options, payload)
      .should.be.rejectedWith('invalid webhook: 18f-pages');
  });
});
