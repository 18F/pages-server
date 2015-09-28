/* jshint node: true */
/* jshint expr: true */
/* jshint mocha: true */
'use strict';

var pagesServer = require('../index.js');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var sinon = require('sinon');
var childProcess = require('child_process');
var mockSpawn = require('mock-spawn');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var http = require('http');

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

function makeSignature(payload, secret) {
  return 'sha1=' +
    crypto.createHmac('sha1', secret).update(payload).digest('hex');
}

function httpOptions(port, payload, secret) {
  return {
    hostname: 'localhost',
    port: port,
    path: '/',
    method: 'POST',
    headers: {
      'Request URL': 'https://pages.18f.gov/deploy',
      'Request method': 'POST',
      'content-type': 'application/json',
      'Expect': '',
      'User-Agent': 'GitHub-Hookshot/9db916b',
      'X-GitHub-Delivery': '01234567-0123-0123-1234-0123456789ab',
      'X-GitHub-Event': 'push',
      'X-Hub-Signature': makeSignature(payload, secret),
      'Content-Type': 'application/json',
      'Content-Length': payload.length
    }
  };
}

function makePayload(branch) {
  return JSON.stringify({
    'ref': 'refs/heads/' + branch,
    'repository': {
      'name': 'foo',
      'full_name': '18F/foo',
      // Alter the name of the organization so the request is silently ignored
      // to avoid tons of server logging in the background.
      'organization': '19G'
    },
    'head_commit': {
      'id': 'deadbeef',
      'message': 'Build me',
      'timestamp': '2015-09-25',
      'committer': { 'email': 'michael.bland@gsa.gov' }
    },
    'pusher': { 'name': 'Mike Bland', 'email': 'michael.bland@gsa.gov' },
    'sender': { 'login': 'mbland' }
  });
}

function sendRequest(options, payload) {
  return new Promise(function(resolve, reject) {
    var req = http.request(options, function(res) {
      var data = '';
      res.setEncoding('utf8');
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        if (res.statusCode >= 200 && res.statusCode <= 300) {
          resolve(data);
        } else {
          reject(data);
        }
      });
    });

    req.on('error', function(e) { reject(e.message); });
    req.write(payload);
    req.end();
  });
}

describe('launchServer', function() {
  var server, port;
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
    var payload = makePayload('18f-pages');
    var options = httpOptions(port, payload, pagesBranchKey);
    return sendRequest(options, payload).should.become('Accepted\n');
  });

  it('should make a successful request for master with default', function() {
    var payload = makePayload('master');
    var options = httpOptions(port, payload, defaultKey);
    return sendRequest(options, payload).should.become('Accepted\n');
  });

  it('should fail a request for 18f-pages with the wrong key', function() {
    var payload = makePayload('18f-pages');
    var options = httpOptions(port, payload, defaultKey);
    return sendRequest(options, payload)
      .should.be.rejectedWith('invalid webhook: 18f-pages');
  });

  it('should fail a request for 18f-pages if signature missing', function() {
    var payload = makePayload('18f-pages');
    var options = httpOptions(port, payload, pagesBranchKey);
    delete options.headers['X-Hub-Signature'];
    return sendRequest(options, payload)
      .should.be.rejectedWith('invalid webhook: 18f-pages');
  });
});
