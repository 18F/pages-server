'use strict';

module.exports = JekyllCommandHelper;

function JekyllCommandHelper(builder, jekyllPath, bundlerPath) {
  this.builder = builder;
  this.jekyll = jekyllPath;
  this.args = ['build', '--trace', '--destination'];

  if (builder.usesBundler) {
    this.jekyll = bundlerPath;
    this.args = ['exec', 'jekyll'].concat(this.args);
  }
}

JekyllCommandHelper.prototype.spawn = function(destination, extraConfig) {
  var configs = ['_config.yml'];
  if (extraConfig) {
    configs.push(extraConfig);
  }
  configs.push(this.builder.opts.pagesConfig);
  configs = configs.join(',');

  if (this.builder.opts.branchInUrlPattern) {
    destination = destination + '/' + this.builder.branch;
  }

  var args = this.args.concat(destination).concat('--config').concat(configs);
  return this.builder.spawn(this.jekyll, args);
};
