'use strict';

module.exports = JekyllCommandHelper;

function JekyllCommandHelper(config, commandRunner) {
  this.jekyll = config.jekyll;
  this.bundler = config.bundler;
  this.commandRunner = commandRunner;
  this.args = ['build', '--trace', '--destination'];
}

JekyllCommandHelper.prototype.build = function(configHandler, opts) {
  var helper = this,
      configs = configHandler.buildConfigurations(),
      generateBuilds;

  generateBuilds = function(previousBuild, config) {
    return previousBuild.then(function() {
      return runBuild(helper, config.destination, opts, config.configurations);
    });
  };
  return configs.reduce(generateBuilds, Promise.resolve());
};

function runBuild(helper, destination, opts, configs) {
  var command = helper.jekyll,
      args;

  args = helper.args.concat(destination).concat('--config').concat(configs);

  if (opts.bundler) {
    command = helper.bundler;
    args = ['exec', 'jekyll'].concat(args);
  }
  return helper.commandRunner.run(command, args);
}
