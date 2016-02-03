'use strict';

var ConfigHandler = require('../lib/config-handler');
var RepositoryFileHandler = require('../lib/repository-file-handler');
var pagesConfig = require('../pages-config.json');
var path = require('path');
var sinon = require('sinon');
var chai = require('chai');

chai.should();

describe('ConfigHandler', function() {
  var config, opts, handler, fileHandler, logger;

  before(function() {
    config = JSON.parse(JSON.stringify(pagesConfig));
    opts = {
      pagesConfig: config.pagesConfig,
      repoName: 'repo_name',
      destDir: 'dest_dir',
      internalDestDir: 'internal_dest_dir',
      assetRoot: '',
      branchInUrlPattern: ''
    };
    opts.sitePath = path.join('some/test/dir', opts.repoName);
    fileHandler = new RepositoryFileHandler(opts);
  });

  beforeEach(function() {
    handler = new ConfigHandler(opts, '18f-pages', fileHandler, logger);
  });

  describe('init and buildConfigurations', function() {
    beforeEach(function() {
      sinon.stub(fileHandler, 'exists');
    });

    afterEach(function() {
      fileHandler.exists.restore();
    });

    it('should publish with the default config', function() {
      fileHandler.exists.withArgs('_config_internal.yml')
        .returns(Promise.resolve(false));

      return handler.init().should.be.fulfilled
        .then(function() {
          handler.buildConfigurations().should.eql([
            { destination: path.join('dest_dir/repo_name'),
              configurations: '_config.yml,' + config.pagesConfig
            }
          ]);
        });
    });

    it('should error if internal config without internal dir', function() {
      delete handler.internalDestDir;
      fileHandler.exists.withArgs('_config_internal.yml')
        .returns(Promise.resolve(true));

      return handler.init().should.be.rejectedWith(
        'Error: failed to build a site with a _config_internal.yml file ' +
         'without an internalSiteDir defined in the builder configuration');
    });

    it('should error if external config without internal conf', function() {
      fileHandler.exists
        .withArgs('_config_internal.yml').returns(Promise.resolve(false))
        .withArgs('_config_external.yml').returns(Promise.resolve(true));

      return handler.init().should.be.rejectedWith(
        'Error: failed to build a site with a _config_external.yml file ' +
        'without a corresponding _config_internal.yml file');
    });

    it('should publish with internal config only', function() {
      fileHandler.exists
        .withArgs('_config_internal.yml').returns(Promise.resolve(true))
        .withArgs('_config_external.yml').returns(Promise.resolve(false));

      return handler.init().should.be.fulfilled
        .then(function() {
          handler.buildConfigurations().should.eql([
            { destination: path.join('internal_dest_dir/repo_name'),
              configurations: '_config.yml,_config_internal.yml,' +
                config.pagesConfig
            },
            { destination: path.join('dest_dir/repo_name'),
              configurations: '_config.yml,' + config.pagesConfig
            }
          ]);
        });
    });

    it('should publish with internal and external configs', function() {
      fileHandler.exists
        .withArgs('_config_internal.yml').returns(Promise.resolve(true))
        .withArgs('_config_external.yml').returns(Promise.resolve(true));

      return handler.init().should.be.fulfilled
        .then(function() {
          handler.buildConfigurations().should.eql([
            { destination: path.join('internal_dest_dir/repo_name'),
              configurations: '_config.yml,_config_internal.yml,' +
                config.pagesConfig
            },
            { destination: path.join('dest_dir/repo_name'),
              configurations: '_config.yml,_config_external.yml,' +
                config.pagesConfig
            }
          ]);
        });
    });

    it('should publish to a dest dir containing the branch name', function() {
      handler.branchInUrlPattern = new RegExp(
        'v[0-9]+.[0-9]+.[0-9]*[a-z]+', 'i');
      handler.branch = 'v0.9.0';

      fileHandler.exists
        .withArgs('_config_internal.yml').returns(Promise.resolve(true))
        .withArgs('_config_external.yml').returns(Promise.resolve(false));

      return handler.init().should.be.fulfilled
        .then(function() {
          handler.buildConfigurations().should.eql([
            { destination: path.join('internal_dest_dir/repo_name/v0.9.0'),
              configurations: '_config.yml,_config_internal.yml,' +
                config.pagesConfig
            },
            { destination: path.join('dest_dir/repo_name/v0.9.0'),
              configurations: '_config.yml,' + config.pagesConfig
            }
          ]);
        });
    });

  });

  // Note that this will only get called when a _config_18f_pages.yml file is
  // present, not generated. Otherwise the server will generate this file, and
  // the baseurl will match the output directory already.
  describe('parseDestinationFromConfigData', function() {
    it('should keep the default destination if undefined', function() {
      handler.parseDestinationFromConfigData('');
      handler.buildDestination.should.equal(path.join('dest_dir/repo_name'));
    });

    it('should keep the default destination if empty', function() {
      handler.parseDestinationFromConfigData('baseurl:\n');
      handler.buildDestination.should.equal(path.join('dest_dir/repo_name'));
    });

    it('should keep the default destination if empty with spaces', function() {
      handler.parseDestinationFromConfigData('baseurl:   \n');
      handler.buildDestination.should.equal(path.join('dest_dir/repo_name'));
    });

    it('should keep the default destination if set to root path', function() {
      handler.parseDestinationFromConfigData('baseurl: /\n');
      handler.buildDestination.should.equal(path.join('dest_dir/repo_name'));
    });

    it('should set the destination from config data baseurl', function() {
      handler.parseDestinationFromConfigData('baseurl: /new-destination\n');
      handler.buildDestination.should.equal(
        path.join('dest_dir/new-destination'));
    });

    it('should set the internal destination from config data', function() {
      handler.internalDestDir = 'internal_dest_dir';
      handler.parseDestinationFromConfigData('baseurl: /new-destination\n');
      handler.buildDestination.should.equal(
        path.join('dest_dir/new-destination'));
      handler.internalBuildDestination.should.equal(
        path.join('internal_dest_dir/new-destination'));
    });

    it('should parse baseurl if no leading space', function() {
      handler.parseDestinationFromConfigData('baseurl:/new-destination\n');
      handler.buildDestination.should.equal(
        path.join('dest_dir/new-destination'));
    });

    it('should trim all spaces around baseurl', function() {
      handler.parseDestinationFromConfigData(
        'baseurl:   /new-destination   \n');
      handler.buildDestination.should.equal(
        path.join('dest_dir/new-destination'));
    });
  });
});
