'use strict';

var path = require('path');
var yamlJs = require('yamljs');

module.exports = ConfigHandler;

function ConfigHandler(builderOpts, branch, repoFileHandler, logger) {
  this.pagesConfig = builderOpts.pagesConfig;
  this.pagesYaml = builderOpts.pagesYaml;
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
  var handler = this,
      attributesToFiles = {
        hasPagesYaml: this.pagesYaml,
        usesJekyll: '_config.yml',
        usesBundler: 'Gemfile',
        hasInternalConfig: '_config_internal.yml',
        hasExternalConfig: '_config_external.yml'
      };

  return Promise.all(Object.keys(attributesToFiles).map(function(attribute) {
    return setAttributeBasedOnFilePresence(
      handler, attribute, attributesToFiles[attribute]);
  }))
  .then(function() {
    return Promise.all([
      checkInternalPublishingConfiguration(handler),
      loadPagesYamlAttributes(handler)
    ]);
  });
};

function loadPagesYamlAttributes(handler) {
  if (handler.hasPagesYaml) {
    return handler.fileHandler.readFile(handler.pagesYaml)
      .then(function(contents) {
        return yamlJs.parse(contents);
      })
      .then(function(result) {
        assignPagesYamlAttributes(handler, result);
      });
  }
}

function assignPagesYamlAttributes(handler, attributes) {
  Object.keys(attributes).forEach(function(key) {
    handler[key] = attributes[key];
  });
  if (handler.baseurl) {
    setBuildDestinationFromBaseurl(handler, handler.baseurl);
  }
}

function setBuildDestinationFromBaseurl(handler, baseurl) {
  handler.buildDestination = path.join(handler.destDir, baseurl);

  if (handler.internalBuildDestination) {
    handler.internalBuildDestination = path.join(
      handler.internalDestDir, baseurl);
  }
}

function checkInternalPublishingConfiguration(handler) {
  if (handler.hasInternalConfig && !handler.internalDestDir) {
    return Promise.reject('Error: failed to build a site with a ' +
      '_config_internal.yml file without an internalSiteDir defined ' +
      'in the builder configuration');
  }
  if (handler.hasExternalConfig && !handler.hasInternalConfig) {
    return Promise.reject('Error: failed to build a site with a ' +
      '_config_external.yml file without a corresponding ' +
      '_config_internal.yml file');
  }
}

function setAttributeBasedOnFilePresence(handler, attribute, filename) {
  return handler.fileHandler.exists(filename)
    .then(function(exists) {
      handler[attribute] = exists;
    });
}

ConfigHandler.prototype.readOrWriteConfig = function() {
  var handler = this;

  return this.fileHandler.exists(this.pagesConfig)
    .then(function(hasConfig) {
      return hasConfig ? readConfig(handler) : writeConfig(handler);
    });
};

function readConfig(handler) {
  handler.logger.log('using existing', handler.pagesConfig);

  return handler.fileHandler.readFile(handler.pagesConfig)
    .then(function(data) {
      return handler.parseDestinationFromConfigData(data);
    });
}

function writeConfig(handler) {
  var content,
      baseurl;

  handler.logger.log('generating', handler.pagesConfig);

  baseurl = handler.baseurl || ('/' + handler.repoName);
  if (handler.branchInUrlPattern) {
    baseurl = baseurl + '/' + handler.branch;
  }

  // asset_root: is used by the guides_style_18f gem to ensure that updates to
  // common CSS and JavaScript files can be applied to Pages without having to
  // update the gem.
  content = 'baseurl: ' + baseurl + '\n' +
    'asset_root: ' + handler.assetRoot + '\n';

  return handler.fileHandler.writeFile(handler.pagesConfig, content)
    .then(function() {
      handler.generatedConfig = true;
    });
}

ConfigHandler.prototype.parseDestinationFromConfigData = function(configData) {
  var baseurlMatch = configData.match(/^baseurl:(.+)$/m),
      baseurl;

  if (baseurlMatch === null) {
    return;
  }
  baseurl = baseurlMatch[1].trim();

  if (baseurl !== '' && baseurl !== '/') {
    setBuildDestinationFromBaseurl(this, baseurl);
  }
};

ConfigHandler.prototype.buildConfigurations = function() {
  var branch = this.branch,
      configs = [];

  if (this.hasInternalConfig) {
    configs.push({
      destination: this.internalBuildDestination,
      configurations: '_config.yml,_config_internal.yml,' + this.pagesConfig
    });
  }

  if (this.hasExternalConfig) {
    configs.push({
      destination: this.buildDestination,
      configurations: '_config.yml,_config_external.yml,' + this.pagesConfig
    });
  } else {
    configs.push({
      destination: this.buildDestination,
      configurations: '_config.yml,' + this.pagesConfig
    });
  }

  if (this.branchInUrlPattern) {
    configs.forEach(function(config) {
      config.destination = path.join(config.destination, branch);
    });
  }
  return configs;
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
