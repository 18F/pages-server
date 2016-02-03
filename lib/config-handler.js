'use strict';

var path = require('path');

module.exports = ConfigHandler;

function ConfigHandler(builderOpts, branch, repoFileHandler, logger) {
  this.pagesConfig = builderOpts.pagesConfig;
  this.repoName = builderOpts.repoName;
  this.destDir = builderOpts.destDir;
  this.assetRoot = builderOpts.assetRoot;
  this.branchInUrlPattern = builderOpts.branchInUrlPattern;
  this.buildDestination = path.join(builderOpts.destDir, builderOpts.repoName);
  this.branch = branch;
  this.fileHandler = repoFileHandler;
  this.logger = logger;

  if (builderOpts.internalDestDir) {
    this.internalDestDir = builderOpts.internalDestDir;
    this.internalBuildDestination = path.join(
      builderOpts.internalDestDir, builderOpts.repoName);
  }
}

ConfigHandler.prototype.init = function() {
  return this.checkInternalPublishingConfiguration();
};

ConfigHandler.prototype.checkInternalPublishingConfiguration = function() {
  var handler = this;

  return this.fileHandler.exists('_config_internal.yml')
    .then(function(hasInternalConfig) {
      handler.hasInternalConfig = hasInternalConfig;
      if (hasInternalConfig && !handler.internalDestDir) {
        return Promise.reject('Error: failed to build a site with a ' +
          '_config_internal.yml file without an internalSiteDir defined ' +
          'in the builder configuration');
      }
      return handler.fileHandler.exists('_config_external.yml');
    })
    .then(function(hasExternalConfig) {
      handler.hasExternalConfig = hasExternalConfig;
      if (hasExternalConfig && !handler.hasInternalConfig) {
        return Promise.reject('Error: failed to build a site with a ' +
          '_config_external.yml file without a corresponding ' +
          '_config_internal.yml file');
      }
    });
};

ConfigHandler.prototype.hasJekyllConfig = function() {
  return this.fileHandler.exists('_config.yml');
};

ConfigHandler.prototype.readOrWriteConfig = function() {
  var handler = this;

  return this.fileHandler.exists(this.pagesConfig)
    .then(function(hasConfig) {
      return hasConfig ? handler.readConfig() : handler.writeConfig();
    });
};

ConfigHandler.prototype.readConfig = function() {
  var handler = this;

  handler.logger.log('using existing', handler.pagesConfig);

  return handler.fileHandler.readFile(handler.pagesConfig)
    .then(function(data) {
      return handler.parseDestinationFromConfigData(data);
    });
};

ConfigHandler.prototype.writeConfig = function() {
  var handler = this,
      content,
      baseurl;

  this.logger.log('generating', this.pagesConfig);

  baseurl = '/' + this.repoName;
  if (this.branchInUrlPattern) {
    baseurl = baseurl + '/' + this.branch;
  }

  // asset_root: is used by the guides_style_18f gem to ensure that updates to
  // common CSS and JavaScript files can be applied to Pages without having to
  // update the gem.
  content = 'baseurl: ' + baseurl + '\n' +
    'asset_root: ' + this.assetRoot + '\n';

  return this.fileHandler.writeFile(this.pagesConfig, content)
    .then(function() {
      handler.generatedConfig = true;
    });
};

ConfigHandler.prototype.parseDestinationFromConfigData = function(configData) {
  var baseurlMatch = configData.match(/^baseurl:(.+)$/m),
      baseurl;

  if (baseurlMatch === null) {
    return;
  }
  baseurl = baseurlMatch[1].trim();

  if (baseurl !== '' && baseurl !== '/') {
    this.buildDestination = path.join(this.destDir, baseurl);

    if (this.internalBuildDestination) {
      this.internalBuildDestination = path.join(this.internalDestDir, baseurl);
    }
  }
};

ConfigHandler.prototype.removeGeneratedConfig = function(err) {
  var handler = this;

  return new Promise(function(resolve, reject) {
    var done;

    done = function() {
      err ? reject(err) : resolve();
    };

    if (!handler.generatedConfig) {
      return done();
    }
    handler.logger.log('removing generated', handler.pagesConfig);
    handler.fileHandler.unlink(handler.pagesConfig)
      .catch(function(unlinkErr) {
        handler.logger.log(unlinkErr);
        reject(unlinkErr);
      })
      .then(done);
  });
};
