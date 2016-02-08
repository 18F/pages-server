'use strict';

var JekyllCommandHelper = require('../lib/jekyll-command-helper');
var CommandRunner = require('../lib/command-runner');
var pagesConfig = require('../pages-config.json');
var path = require('path');
var sinon = require('sinon');
var chai = require('chai');

chai.should();

describe('JekyllCommandHelper', function() {
  var config, helper, commandRunner, internalConfig, externalConfig,
      buildConfigs, opts, preamble, configToArgs;

  before(function() {
    config = JSON.parse(JSON.stringify(pagesConfig));
    config.jekyll = 'jekyll';
    config.bundler = 'bundle';
    commandRunner = new CommandRunner();
    internalConfig = {
      destination: path.join('internal/deploy/dir'),
      configurations: '_config.yml,_config_internal.yml,' + config.pagesConfig
    };
    externalConfig = {
      destination: path.join('public/deploy/dir'),
      configurations: '_config.yml,' + config.pagesConfig
    };
    buildConfigs = [internalConfig, externalConfig];
  });

  beforeEach(function() {
    helper = new JekyllCommandHelper(config, commandRunner);
    sinon.stub(commandRunner, 'run');
  });

  afterEach(function() {
    commandRunner.run.restore();
  });

  configToArgs = function(configuration) {
    return [
      configuration.destination, '--config', configuration.configurations
    ];
  };

  it('should produce builds without bundler', function() {
    opts = {};
    preamble = ['build', '--trace', '--destination'];

    return helper.build(buildConfigs, opts).should.be.fulfilled
      .then(function() {
        commandRunner.run.args.should.eql([
          ['jekyll', preamble.concat(configToArgs(internalConfig))],
          ['jekyll', preamble.concat(configToArgs(externalConfig))]
        ]);
      });
  });

  it('should produce builds with bundler', function() {
    opts = { bundler: true };
    preamble = ['exec', 'jekyll', 'build', '--trace', '--destination'];

    return helper.build(buildConfigs, opts).should.be.fulfilled
      .then(function() {
        commandRunner.run.args.should.eql([
          ['bundle', preamble.concat(configToArgs(internalConfig))],
          ['bundle', preamble.concat(configToArgs(externalConfig))]
        ]);
      });
  });
});
