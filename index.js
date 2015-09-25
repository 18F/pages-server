#! /usr/bin/env node
/* jshint node: true */
/* jshint bitwise: false */
'use strict';

var hookshot = require('hookshot');
var path = require('path');
var siteBuilder = require('./lib/site-builder');

var exports = module.exports = {};

function makeBuilderListener(webhook, builderConfig) {
  webhook.on('refs/heads/' + builderConfig.branch, function(info) {
    siteBuilder.launchBuilder(info, builderConfig.repositoryDir,
      builderConfig.generatedSiteDir);
  });
}

exports.LaunchServer = function(config) {
  siteBuilder.setConfiguration(config);

  // Passed through to bodyParser.json().
  // https://www.npmjs.com/package/body-parser#limit
  var jsonOptions = { limit: config.payloadLimit };
  var webhook = hookshot(null, null, jsonOptions);

  var numBuilders = config.builders.length;
  for (var i = 0; i != numBuilders; i++) {
    makeBuilderListener(webhook, config.builders[i]);
  }

  webhook.listen(config.port);
  console.log(config.githubOrg + ' pages: listening on port ' + config.port);
};
