'use strict';

var ConfigHandler = require('../lib/config-handler');
var RepositoryFileHandler = require('../lib/repository-file-handler');
var BuildLogger = require('../lib/build-logger');
var pagesConfig = require('../pages-config.json');
var path = require('path');
var sinon = require('sinon');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var expect = chai.expect;

chai.should();
chai.use(chaiAsPromised);

describe('ConfigHandler', function() {
  var config, opts, handler, fileHandler, logger;

  before(function() {
    config = JSON.parse(JSON.stringify(pagesConfig));
    opts = {
      pagesConfig: config.pagesConfig,
      pagesYaml: config.pagesYaml,
      repoName: 'repo_name',
      destDir: 'dest_dir',
      internalDestDir: 'internal_dest_dir',
      assetRoot: '/guides-template',
      branchInUrlPattern: ''
    };
    opts.sitePath = path.join('some/test/dir', opts.repoName);
    fileHandler = new RepositoryFileHandler(opts);
    logger = new BuildLogger();
  });

  beforeEach(function() {
    handler = new ConfigHandler(opts, '18f-pages', fileHandler, logger);
  });

  describe('init and buildConfigurations', function() {
    beforeEach(function() {
      sinon.stub(fileHandler, 'exists');
      sinon.stub(fileHandler, 'readFile');
      fileHandler.exists.returns(Promise.resolve(false));
      fileHandler.exists.withArgs('_config.yml')
        .returns(Promise.resolve(true));
      sinon.stub(logger, 'log');
    });

    afterEach(function() {
      logger.log.restore();
      fileHandler.readFile.restore();
      fileHandler.exists.restore();
    });

    it('should detect when jekyll isn\'t used', function() {
      fileHandler.exists.withArgs('_config.yml')
        .returns(Promise.resolve(false));
      return handler.init().should.be.fulfilled
        .then(function() {
          handler.usesJekyll.should.be.false;
        });
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

    it('should use raw jekyll if there is no Gemfile', function() {
      return handler.init().should.be.fulfilled
        .then(function() {
          handler.usesBundler.should.be.false;
        });
    });

    it('should use bundle exec jekyll if there is a Gemfile', function() {
      fileHandler.exists.withArgs('Gemfile').returns(Promise.resolve(true));
      return handler.init().should.be.fulfilled
        .then(function() {
          handler.usesBundler.should.be.true;
        });
    });

    it('should do nothing if .18f-pages.yml is missing', function() {
      return handler.init().should.be.fulfilled
        .then(function() {
          handler.hasPagesYaml.should.be.false;
          expect(handler.baseurl).to.be.undefined;
          handler.buildDestination.should.eql(
            path.join(handler.destDir, handler.repoName));
          handler.internalBuildDestination.should.eql(
            path.join(handler.internalDestDir, handler.repoName));
        });
    });

    it('should set attributes if .18f-pages.yml is present', function() {
      fileHandler.exists.withArgs(pagesConfig.pagesYaml)
        .returns(Promise.resolve(true));
      fileHandler.readFile.withArgs(pagesConfig.pagesYaml)
        .returns(Promise.resolve('baseurl: /new-baseurl\n'));

      handler.branchInUrlPattern = new RegExp(
        'v[0-9]+.[0-9]+.[0-9]*[a-z]+', 'i');
      handler.branch = 'v0.9.0';

      return handler.init().should.be.fulfilled
        .then(function() {
          handler.hasPagesYaml.should.be.true;
          handler.baseurl.should.eql('/new-baseurl');
          handler.buildDestination.should.eql(
            path.join(handler.destDir, '/new-baseurl'));
          handler.internalBuildDestination.should.eql(
            path.join(handler.internalDestDir, '/new-baseurl'));
          handler.buildConfigurations().should.eql([
            { destination: path.join('dest_dir/new-baseurl/v0.9.0'),
              configurations: '_config.yml,' + config.pagesConfig
            }
          ]);
        });
    });

    it('should pass through any YAML errors', function() {
      fileHandler.exists.withArgs(pagesConfig.pagesYaml)
        .returns(Promise.resolve(true));
      fileHandler.readFile.withArgs(pagesConfig.pagesYaml)
        .returns(Promise.resolve('foo: "bar: baz'));

      return handler.init().should.be.rejectedWith(
        'Malformed inline YAML string ("bar: baz)');
    });

    it('should not detect YAML file presence if not configured', function() {
      // This can happen if the pages-config.json file does not have 
      // a pagesYaml property defined.
      fileHandler.exists.withArgs(undefined).throws();
      handler.pagesYaml = undefined;
      return handler.init().should.be.fulfilled
        .then(function() {
          logger.log.args.should.eql([
            ['missing file configuration for property: hasPagesYaml']
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

  describe('readOrWriteConfig', function() {
    beforeEach(function() {
      sinon.stub(logger, 'log');
      sinon.stub(fileHandler, 'exists');
      sinon.stub(fileHandler, 'readFile');
      sinon.stub(fileHandler, 'writeFile');
    });

    afterEach(function() {
      fileHandler.writeFile.restore();
      fileHandler.readFile.restore();
      fileHandler.exists.restore();
      logger.log.restore();
    });

    it('should write a configuration file', function() {
      fileHandler.exists.withArgs(config.pagesConfig)
        .returns(Promise.resolve(false));
      fileHandler.writeFile.returns(Promise.resolve());

      return handler.readOrWriteConfig().should.be.fulfilled
        .then(function() {
          handler.generatedConfig.should.be.true;
          logger.log.args.should.eql([['generating', config.pagesConfig]]);
          fileHandler.writeFile.args.should.eql([
            [config.pagesConfig,
             'baseurl: /repo_name\n' +
             'asset_root: ' + config.assetRoot + '\n'
            ]
          ]);
        });
    });

    it('should write a baseurl from .18f-pages.yml + branch', function() {
      handler.branchInUrlPattern = new RegExp(
        'v[0-9]+.[0-9]+.[0-9]*[a-z]+', 'i');
      handler.branch = 'v0.9.0';

      fileHandler.exists.returns(Promise.resolve(false));

      fileHandler.exists.withArgs(pagesConfig.pagesYaml)
        .returns(Promise.resolve(true));
      fileHandler.readFile.withArgs(pagesConfig.pagesYaml)
        .returns(Promise.resolve('baseurl: /new-baseurl\n'));

      fileHandler.exists.withArgs(config.pagesConfig)
        .returns(Promise.resolve(false));
      fileHandler.writeFile.returns(Promise.resolve());

      return handler.init().should.be.fulfilled
        .then(function() {
          return handler.readOrWriteConfig().should.be.fulfilled;
        })
        .then(function() {
          handler.generatedConfig.should.be.true;
          logger.log.args.should.eql([['generating', config.pagesConfig]]);
          fileHandler.writeFile.args.should.eql([
            [config.pagesConfig,
             'baseurl: /new-baseurl/v0.9.0\n' +
             'asset_root: ' + config.assetRoot + '\n'
            ]
          ]);
        });
    });

    it('should read a config file and add its baseurl to dest', function() {
      fileHandler.exists.withArgs(config.pagesConfig)
        .returns(Promise.resolve(true));
      fileHandler.readFile
        .returns(Promise.resolve('baseurl: /new-destination\n'));

      return handler.readOrWriteConfig().should.be.fulfilled
        .then(function() {
          expect(handler.generatedConfig).to.be.undefined;
          handler.buildDestination.should.eql(
            path.join(handler.destDir, '/new-destination'));
          handler.internalBuildDestination.should.eql(
            path.join(handler.internalDestDir, '/new-destination'));
          logger.log.args.should.eql([['using existing', config.pagesConfig]]);
          fileHandler.readFile.args.should.eql([[config.pagesConfig]]);
        });
    });
  });

  describe('removeGeneratedConfig', function() {
    beforeEach(function() {
      sinon.stub(logger, 'log');
      sinon.stub(fileHandler, 'unlink');
    });

    afterEach(function() {
      logger.log.restore();
      fileHandler.unlink.restore();
    });

    it('should do nothing if a config wasn\'t generated', function() {
      return handler.removeGeneratedConfig().should.be.fulfilled
        .then(function() {
          logger.log.called.should.be.false;
          fileHandler.unlink.called.should.be.false;
        });
    });

    it('should propagate errors if a config wasn\'t generated', function() {
      return handler.removeGeneratedConfig(new Error('test error'))
        .should.be.rejectedWith(Error, 'test error')
        .then(function() {
          logger.log.called.should.be.false;
          fileHandler.unlink.called.should.be.false;
        });
    });

    it('should remove the generated config', function() {
      handler.generatedConfig = true;
      fileHandler.unlink.withArgs(handler.pagesConfig)
        .returns(Promise.resolve());

      return handler.removeGeneratedConfig().should.be.fulfilled
        .then(function() {
          logger.log.args.should.eql([
            ['removing generated', handler.pagesConfig]
          ]);
        });
    });

    it('should remove the generated config and propagate errors', function() {
      handler.generatedConfig = true;
      fileHandler.unlink.withArgs(handler.pagesConfig)
        .returns(Promise.resolve());

      return handler.removeGeneratedConfig(new Error('test error'))
        .should.be.rejectedWith(Error, 'test error')
        .then(function() {
          logger.log.args.should.eql([
            ['removing generated', handler.pagesConfig]
          ]);
        });
    });

    it('should propagate unlink errors', function() {
      handler.generatedConfig = true;
      fileHandler.unlink.withArgs(handler.pagesConfig)
        .returns(Promise.reject(new Error('unlink error')));

      return handler.removeGeneratedConfig(new Error('test error'))
        .should.be.rejectedWith(Error, 'unlink error')
        .then(function() {
          logger.log.args.should.have.deep.property('[0]')
            .that.deep.equals(['removing generated', handler.pagesConfig]);
          logger.log.args.should.have.deep.property('[1][0].message')
            .that.deep.equals('unlink error');
        });
    });
  });
});
