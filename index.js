'use strict';

var hookshot = require('hookshot');
var SiteBuilder = require('./lib/site-builder');
var packageInfo = require('./package.json');
var webhookValidator = require('github-webhook-validator');

var exports = module.exports = {};

exports.versionString = function() {
  return packageInfo.name + ' v' + packageInfo.version;
};

exports.launchServer = function(config) {
  SiteBuilder.setConfiguration(config);
  return webhookValidator.loadKeyDictionary(
    config.secretKeyFile, config.builders)
    .then(function(keyDictionary) {
      return doLaunch(config, keyDictionary);
    })
    .catch(function(err) {
      console.error('Failed to start server:', err);
    });
};

function doLaunch(config, keyDictionary) {
  // Passed through to bodyParser.json().
  // https://www.npmjs.com/package/body-parser#limit
  var jsonOptions = {
    limit: config.payloadLimit,
    verify: webhookValidator.middlewareValidator(keyDictionary)
  };
  var webhook = hookshot(null, null, jsonOptions);

  var numBuilders = config.builders.length;
  for (var i = 0; i != numBuilders; i++) {
    SiteBuilder.makeBuilderListener(webhook, config.builders[i]);
  }

  console.log(exports.versionString());
  var server = webhook.listen(config.port);
  console.log(config.githubOrg + ' pages: listening on port ' +
    server.address().port);
  return server;
}
