#! /usr/bin/env node
/* jshint node: true */
/* jshint bitwise: false */
'use strict';

var hookshot = require('hookshot');
var path = require('path');
var siteBuilder = require('./lib/site-builder');
var packageInfo = require('./package.json');

var exports = module.exports = {};

exports.versionString = function() {
  return packageInfo.name + ' v' + packageInfo.version;
}

exports.LaunchServer = function(config) {
  siteBuilder.setConfiguration(config);

  // Passed through to bodyParser.json().
  // https://www.npmjs.com/package/body-parser#limit
  var jsonOptions = { limit: config.payloadLimit };
  var webhook = hookshot(null, null, jsonOptions);

  var numBuilders = config.builders.length;
  for (var i = 0; i != numBuilders; i++) {
    siteBuilder.makeBuilderListener(webhook, config.builders[i]);
  }

  console.log(exports.versionString());
  webhook.listen(config.port);
  console.log(config.githubOrg + ' pages: listening on port ' + config.port);
};
