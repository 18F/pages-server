/* jshint node: true */
/* jshint expr: true */
/* jshint mocha: true */
'use strict';

var crypto = require('crypto');
var http = require('http');

module.exports = RequestHelper;

function RequestHelper() {
}

RequestHelper.prototype.makeSignature = function(payload, secret) {
  return 'sha1=' +
    crypto.createHmac('sha1', secret).update(payload, 'utf8').digest('hex');
};

RequestHelper.prototype.httpOptions = function(port, payload, secret) {
  return {
    hostname: 'localhost',
    port: port,
    path: '/',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Expect': '100-continue',
      'User-Agent': 'GitHub-Hookshot/9db916b',
      'X-GitHub-Delivery': '01234567-0123-0123-1234-0123456789ab',
      'X-GitHub-Event': 'push',
      'X-Hub-Signature': this.makeSignature(payload, secret),
      'Content-Type': 'application/json',
      // See the following for why payload.length doesn't cut it for
      // Content-Length (note GitHub doesn't send Content-Length):
      // https://stackoverflow.com/questions/17922748/
      'Content-Length': Buffer.byteLength(payload, 'utf8')
    }
  };
};

RequestHelper.prototype.makePayload = function(branch) {
  return JSON.stringify({
    'ref': 'refs/heads/' + branch,
    'repository': {
      'name': 'foo',
      'full_name': '18F/foo',
      // Alter the name of the organization so the request is silently ignored
      // to avoid tons of server logging in the background.
      'organization': '19G',
      // Include a UTF-8 character to ensure it’s handled correctly.
      'description': 'The apostrophe in "it’s" is a UTF-8 character.'
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
};

RequestHelper.prototype.sendRequest = function(options, payload) {
  return new Promise(function(resolve, reject) {
    var req = http.request(options, function(res) {
      var data = '';
      res.setEncoding('utf8');
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        if (res.statusCode >= 200 && res.statusCode <= 300) {
          resolve(data);
        } else {
          reject(new Error(
            data.length !== 0 ? data : http.STATUS_CODES[res.statusCode]));
        }
      });
    });

    req.on('error', function(err) { reject(err); });
    req.write(payload);
    req.end();
  });
};
