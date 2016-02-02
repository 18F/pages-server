'use strict';

module.exports = JekyllCommandHelper;

function JekyllCommandHelper(config, builderOpts, commandRunner) {
  this.jekyll = config.jekyll;
  this.bundler = config.bundler;
  this.commandRunner = commandRunner;
  this.builderOpts = builderOpts;
  this.args = ['build', '--trace', '--destination'];
}

JekyllCommandHelper.prototype.run = function(destination, opts, extraConfig) {
  var configs = ['_config.yml'],
      command = this.jekyll,
      args;

  if (extraConfig) {
    configs.push(extraConfig);
  }
  configs.push(this.builderOpts.pagesConfig);
  configs = configs.join(',');

  if (this.builderOpts.branchInUrlPattern) {
    destination = path.join(destination, opts.branch);
  }

  args = this.args.concat(destination).concat('--config').concat(configs);

  if (opts.bundler) {
    command = this.bundler;
    args = ['exec', 'jekyll'].concat(args);
  }
  return this.commandRunner.run(command, args);
};
