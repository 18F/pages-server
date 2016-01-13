/* jshint node: true */
/* jshint expr: true */
/* jshint mocha: true */
'use strict';

var fs = require('fs');
var path = require('path');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var sinon = require('sinon');
var childProcess = require('child_process');
var mockSpawn = require('mock-spawn');
var Options = require('../lib/options');
var siteBuilder = require('../lib/site-builder');
var buildLogger = require('../lib/build-logger');
var fileLockedOperation = require('file-locked-operation');

var FilesHelper = require('./files-helper');
var OrigConfig = require('../pages-config.json');

var expect = chai.expect;
chai.should();
chai.use(chaiAsPromised);

describe('SiteBuilder', function() {
  var builder, config, origSpawn, mySpawn, logger, logMock;
  var filesHelper, updateLock, filenameToContents;

  function cloneConfig() {
    config = JSON.parse(JSON.stringify(OrigConfig));
    config.home = '';
    config.git = 'git';
    config.bundler = 'bundle';
    config.jekyll = 'jekyll';
    config.rsync = 'rsync';
  }

  before(function(done) {
    cloneConfig();
    siteBuilder.setConfiguration(config);
    filesHelper = new FilesHelper(config, done);
  });

  after(function(done) { filesHelper.after(done); });

  beforeEach(function() {
    origSpawn = childProcess.spawn;
    mySpawn = mockSpawn();
    childProcess.spawn = mySpawn;
    logger = new buildLogger.BuildLogger('/dev/null');
    logMock = sinon.mock(logger);
    updateLock = new fileLockedOperation.FileLockedOperation(
      filesHelper.lockfilePath);
    filenameToContents = {};
  });

  afterEach(function(done) {
    childProcess.spawn = origSpawn;
    filesHelper.afterEach(done);
  });

  var spawnCalls = function() {
    return mySpawn.calls.map(function(value) {
      return value.command + ' ' + value.args.join(' ');
    });
  };

  var check = function(done, cb) {
    return function(err) { try { cb(err); done(); } catch (e) { done(e); } };
  };

  var makeOpts = function() {
    var info = {
      repository: {
        name: 'repo_name'
      },
      ref: 'refs/heads/18f-pages'
    };

    var builderConfig = {
      'branch': '18f-pages',
      'repositoryDir': 'repo_dir',
      'generatedSiteDir': 'dest_dir'
    };
    return new Options(info, config, builderConfig);
  };

  var makeBuilder = function(opts) {
    if (!opts) { opts = makeOpts(); }
    opts.sitePath = filesHelper.testRepoDir;
    return new siteBuilder.SiteBuilder(opts, logger, updateLock);
  };

  it('should write the expected configuration', function(done) {
    builder = makeBuilder();
    logMock.expects('log').withExactArgs(
      'generating', config.pagesConfig);
    logMock.expects('log').withExactArgs(
      'removing generated', config.pagesConfig);

    var inRepoDir = new Promise(function(resolve, reject) {
      filesHelper.createRepoDir(function(err) {
        if (err) { reject(err); } else { resolve(); }
      });
    });

    var writeConfig = function() {
      var configExists;
      return builder.readOrWriteConfig(configExists = false);
    };

    var readConfig = function() {
      expect(builder.generatedConfig).to.be.true;
      return new Promise(function(resolve, reject) {
        fs.readFile(filesHelper.pagesConfig, function(err, data) {
          if (err) { reject(err); } else { resolve(data.toString()); }
        });
      });
    };

    var checkResults = function(content) {
      expect(content).to.equal('baseurl: /repo_name\n' +
        'asset_root: ' + config.assetRoot + '\n');
      return new Promise(function(resolve, reject) {
        // Note the done callback wrapper will remove the generated config.
        var buildDone = builder.generateBuildDone(function(err) {
          if (err) { reject(err); } else { resolve(); }
        });
        buildDone();
      });
    };

    inRepoDir.then(writeConfig).then(readConfig).then(checkResults)
        .then(function() { logMock.verify(); }).should.notify(done);
  });

  // Note that this internal function will only get called when a
  // _config_18f_pages.yml file is present, not generated. Otherwise the
  // server will generate this file, and the baseurl will match the output
  // directory already.
  describe('_parseDestinationFromConfigData', function() {
    beforeEach(function() {
      builder = makeBuilder();
    });

    it('should keep the default destination if undefined', function() {
      builder._parseDestinationFromConfigData('');
      expect(builder.buildDestination).to.equal('dest_dir/repo_name');
    });

    it('should keep the default destination if empty', function() {
      builder._parseDestinationFromConfigData('baseurl:\n');
      expect(builder.buildDestination).to.equal('dest_dir/repo_name');
    });

    it('should keep the default destination if empty with spaces', function() {
      builder._parseDestinationFromConfigData('baseurl:   \n');
      expect(builder.buildDestination).to.equal('dest_dir/repo_name');
    });

    it('should keep the default destination if set to root path', function() {
      builder._parseDestinationFromConfigData('baseurl: /\n');
      expect(builder.buildDestination).to.equal('dest_dir/repo_name');
    });

    it('should set the destination from config data baseurl', function() {
      builder._parseDestinationFromConfigData('baseurl: /new-destination\n');
      expect(builder.buildDestination).to.equal('dest_dir/new-destination');
    });

    it('should set the internal destination from config data', function() {
      var opts = makeOpts();
      opts.internalDestDir = 'internal_dest_dir';
      var builder = makeBuilder(opts);
      builder._parseDestinationFromConfigData('baseurl: /new-destination\n');
      expect(builder.buildDestination).to.equal('dest_dir/new-destination');
      expect(builder.internalBuildDestination).to.equal(
        'internal_dest_dir/new-destination');
    });


    it('should parse baseurl if no leading space', function() {
      builder._parseDestinationFromConfigData('baseurl:/new-destination\n');
      expect(builder.buildDestination).to.equal('dest_dir/new-destination');
    });

    it('should trim all spaces around baseurl', function() {
      builder._parseDestinationFromConfigData(
        'baseurl:   /new-destination   \n');
      expect(builder.buildDestination).to.equal('dest_dir/new-destination');
    });
  });

  it('should clone the repo if the directory does not exist', function(done) {
    mySpawn.setDefault(mySpawn.simple(0));
    mySpawn.sequence.add(function(done) {
      filesHelper.createRepoDir(function() { done(0); });
    });

    logMock.expects('log').withExactArgs(
      'cloning', 'repo_name', 'into', filesHelper.testRepoDir);
    logMock.expects('log').withExactArgs(
      'generating', config.pagesConfig);
    logMock.expects('log').withExactArgs(
      'removing generated', config.pagesConfig);
    makeBuilder().build(check(done, function(err) {
      expect(err).to.be.undefined;
      expect(spawnCalls()).to.eql([
        'git clone git@github.com:18F/repo_name.git --branch 18f-pages',
        'jekyll build --trace --destination dest_dir/repo_name ' +
          '--config _config.yml,_config_18f_pages.yml',
      ]);
      logMock.verify();
    }));
  });

  it('should report an error if the clone fails', function(done) {
    mySpawn.sequence.add(mySpawn.simple(1));
    logMock.expects('log').withExactArgs(
      'cloning', 'repo_name', 'into', filesHelper.testRepoDir);
    makeBuilder().build(check(done, function(err) {
      var cloneCommand = 
        'git clone git@github.com:18F/repo_name.git --branch 18f-pages';
      expect(err).to.equal('Error: failed to clone repo_name with ' +
        'exit code 1 from command: ' + cloneCommand);
      expect(spawnCalls()).to.eql([cloneCommand]);
      logMock.verify();
    }));
  });

  it('should sync the repo if the directory already exists', function(done) {
    mySpawn.setDefault(mySpawn.simple(0));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    logMock.expects('log').withExactArgs(
      'generating', config.pagesConfig);
    logMock.expects('log').withExactArgs(
      'removing generated', config.pagesConfig);
    filesHelper.createRepoDir(function() {
      makeBuilder().build(check(done, function(err) {
        expect(err).to.be.undefined;
        expect(spawnCalls()).to.eql([
          'git stash',
          'git pull',
          'git submodule update --init',
          'jekyll build --trace --destination dest_dir/repo_name ' +
            '--config _config.yml,_config_18f_pages.yml',
        ]);
        logMock.verify();
      }));
    });
  });

  it ('should use bundler if a Gemfile is present', function(done) {
    mySpawn.setDefault(mySpawn.simple(0));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    logMock.expects('log').withExactArgs(
      'generating', config.pagesConfig);
    logMock.expects('log').withExactArgs(
      'removing generated', config.pagesConfig);
    filenameToContents[filesHelper.gemfile] = '';
    filesHelper.createRepoWithFiles(filenameToContents, function() {
      makeBuilder().build(check(done, function(err) {
        expect(err).to.be.undefined;
        expect(spawnCalls()).to.eql([
          'git stash',
          'git pull',
          'git submodule update --init',
          'bundle install',
          'bundle exec jekyll build --trace --destination dest_dir/repo_name ' +
            '--config _config.yml,_config_18f_pages.yml',
        ]);
        logMock.verify();
      }));
    });
  });

  it ('should fail if bundle install fails', function(done) {
    mySpawn.sequence.add(mySpawn.simple(0));
    mySpawn.sequence.add(mySpawn.simple(0));
    mySpawn.sequence.add(mySpawn.simple(0));
    mySpawn.sequence.add(mySpawn.simple(1));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    filenameToContents[filesHelper.gemfile] = '';
    filesHelper.createRepoWithFiles(filenameToContents, function() {
      makeBuilder().build(check(done, function(err) {
        var bundleInstallCommand = 'bundle install';
        expect(err).to.equal('Error: rebuild failed for repo_name with ' +
          'exit code 1 from command: ' + bundleInstallCommand);
        expect(spawnCalls()).to.eql([
          'git stash',
          'git pull',
          'git submodule update --init',
          bundleInstallCommand]);
        logMock.verify();
      }));
    });
  });

  it ('should fail if jekyll build fails', function(done) {
    mySpawn.sequence.add(mySpawn.simple(0));
    mySpawn.sequence.add(mySpawn.simple(0));
    mySpawn.sequence.add(mySpawn.simple(0));
    mySpawn.sequence.add(mySpawn.simple(0));
    mySpawn.sequence.add(mySpawn.simple(1));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    logMock.expects('log').withExactArgs(
      'generating', config.pagesConfig);
    logMock.expects('log').withExactArgs(
      'removing generated', config.pagesConfig);
    filenameToContents[filesHelper.gemfile] = '';
    filesHelper.createRepoWithFiles(filenameToContents, function() {
      makeBuilder().build(check(done, function(err) {
        var jekyllBuildCommand =
          'bundle exec jekyll build --trace --destination dest_dir/repo_name ' +
            '--config _config.yml,_config_18f_pages.yml';
        expect(err).to.equal('Error: rebuild failed for repo_name with ' +
          'exit code 1 from command: ' + jekyllBuildCommand);
        expect(spawnCalls()).to.eql([
          'git stash',
          'git pull',
          'git submodule update --init',
          'bundle install',
          jekyllBuildCommand]);
        logMock.verify();
      }));
    });
  });

  it('should use existing _config_18f_pages.yml if present', function(done) {
    mySpawn.setDefault(mySpawn.simple(0));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    logMock.expects('log').withExactArgs(
      'using existing', config.pagesConfig);
    filenameToContents[filesHelper.pagesConfig] = '';
    filesHelper.createRepoWithFiles(filenameToContents, function() {
      makeBuilder().build(check(done, function(err) {
        expect(err).to.be.undefined;
        expect(spawnCalls()).to.eql([
          'git stash',
          'git pull',
          'git submodule update --init',
          'jekyll build --trace --destination dest_dir/repo_name ' +
            '--config _config.yml,_config_18f_pages.yml',
        ]);
        logMock.verify();
      }));
    });
  });

  it('should use baseurl from _config_18f_pages.yml as dest', function(done) {
    mySpawn.setDefault(mySpawn.simple(0));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    logMock.expects('log').withExactArgs(
      'using existing', config.pagesConfig);
    filenameToContents[filesHelper.pagesConfig] =
      'baseurl:  /new-destination  ';
    filesHelper.createRepoWithFiles(filenameToContents, function() {
      makeBuilder().build(check(done, function(err) {
        expect(err).to.be.undefined;
        expect(spawnCalls()).to.eql([
          'git stash',
          'git pull',
          'git submodule update --init',
          'jekyll build --trace --destination dest_dir/new-destination ' +
            '--config _config.yml,_config_18f_pages.yml',
        ]);
        logMock.verify();
      }));
    });
  });

  it('should use rsync if _config.yml is not present', function(done) {
    mySpawn.setDefault(mySpawn.simple(0));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    filenameToContents[filesHelper.pagesConfig] = '';
    filesHelper.createRepoWithFiles(filenameToContents, function() {
      filesHelper.removeFile(filesHelper.configYml)
        .then(function() {
          makeBuilder().build(check(done, function(err) {
            expect(err).to.be.undefined;
            expect(spawnCalls()).to.eql([
              'git stash',
              'git pull',
              'git submodule update --init',
              'rsync -vaxp --delete --ignore-errors --exclude=.[A-Za-z0-9]* ' +
                './ dest_dir/repo_name',
            ]);
            logMock.verify();
          }));
        });
    });
  });

  describe('internal publishing mechanism', function() {
    it('should error if internal config without internal dir', function(done) {
      mySpawn.setDefault(mySpawn.simple(0));
      logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');

      filenameToContents[filesHelper.internalConfig] = '';
      filesHelper.createRepoWithFiles(filenameToContents, function() {
        makeBuilder().build(check(done, function(err) {
          expect(err).to.equal('Error: failed to build a site with a ' +
            '_config_internal.yml file without an internalSiteDir defined ' +
            'in the builder configuration');
          expect(spawnCalls()).to.eql([
            'git stash', 'git pull', 'git submodule update --init'
          ]);
          logMock.verify();
        }));
      });
    });

    it('should error if external config without internal conf', function(done) {
      mySpawn.setDefault(mySpawn.simple(0));
      logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');

      filenameToContents[filesHelper.externalConfig] = '';
      filesHelper.createRepoWithFiles(filenameToContents, function() {
        makeBuilder().build(check(done, function(err) {
          expect(err).to.equal('Error: failed to build a site with a ' +
            '_config_external.yml file without a corresponding ' +
            '_config_internal.yml file');
          expect(spawnCalls()).to.eql([
            'git stash', 'git pull', 'git submodule update --init'
          ]);
          logMock.verify();
        }));
      });
    });

    it('should publish with internal config only', function(done) {
      mySpawn.setDefault(mySpawn.simple(0));
      logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
      logMock.expects('log').withExactArgs(
        'generating', config.pagesConfig);
      logMock.expects('log').withExactArgs(
        'removing generated', config.pagesConfig);

      filenameToContents[filesHelper.internalConfig] = '';
      var opts = makeOpts();

      filesHelper.createRepoWithFiles(filenameToContents, function() {
        opts.internalDestDir = 'internal_dest_dir';
        makeBuilder(opts).build(check(done, function(err) {
          expect(err).to.be.undefined;
          expect(spawnCalls()).to.eql([
            'git stash',
            'git pull',
            'git submodule update --init',
            'jekyll build --trace --destination internal_dest_dir/repo_name ' +
              '--config _config.yml,_config_internal.yml,_config_18f_pages.yml',
            'jekyll build --trace --destination dest_dir/repo_name ' +
              '--config _config.yml,_config_18f_pages.yml',
          ]);
          logMock.verify();
        }));
      });
    });

    it('should publish with internal and external configs', function(done) {
      mySpawn.setDefault(mySpawn.simple(0));
      logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
      logMock.expects('log').withExactArgs(
        'generating', config.pagesConfig);
      logMock.expects('log').withExactArgs(
        'removing generated', config.pagesConfig);

      filenameToContents[filesHelper.internalConfig] = '';
      filenameToContents[filesHelper.externalConfig] = '';
      var opts = makeOpts();

      filesHelper.createRepoWithFiles(filenameToContents, function() {
        opts.internalDestDir = 'internal_dest_dir';
        makeBuilder(opts).build(check(done, function(err) {
          expect(err).to.be.undefined;
          expect(spawnCalls()).to.eql([
            'git stash',
            'git pull',
            'git submodule update --init',
            'jekyll build --trace --destination internal_dest_dir/repo_name ' +
              '--config _config.yml,_config_internal.yml,_config_18f_pages.yml',
            'jekyll build --trace --destination dest_dir/repo_name ' +
              '--config _config.yml,_config_external.yml,_config_18f_pages.yml',
          ]);
        logMock.verify();
        }));
      });
    });
  });

  describe('makeBuilderListener and launchBuilder', function() {
    var webhook, incomingPayload, builderConfig, cloneDir, outputDir, buildLog;

    before(function() {
      incomingPayload = {
        'ref': 'refs/heads/18f-pages',
        'repository': {
          'name': 'foo',
          'full_name': '18F/foo',
          'organization': '18F'
        },
        'head_commit': {
          'id': 'deadbeef',
          'message': 'Build me',
          'timestamp': '2015-09-25',
          'committer': { 'email': 'michael.bland@gsa.gov' }
        },
        'pusher': { 'name': 'Mike Bland', 'email': 'michael.bland@gsa.gov' },
        'sender': { 'login': 'mbland' }
      };

      builderConfig = {
        'branch': '18f-pages',
        'repositoryDir': path.join(filesHelper.testRepoDir, 'repo_dir'),
        'generatedSiteDir': path.join(filesHelper.testRepoDir, 'dest_dir')
      };

      cloneDir = path.join(filesHelper.testRepoDir, 'repo_dir', 'foo');
      outputDir = path.join(filesHelper.testRepoDir, 'dest_dir', 'foo');
      buildLog = path.join(outputDir, 'build.log');
    });

    beforeEach(function(done) {
      webhook = { on: sinon.spy() };
      fs.mkdir(filesHelper.testRepoDir, function(err) {
        if (err) { return done(err); }
        fs.mkdir(builderConfig.repositoryDir, function(err) {
          if (err) { return done(err); }
          fs.mkdir(builderConfig.generatedSiteDir, function(err) {
            if (err) { return done(err); }
            fs.mkdir(outputDir, done);
          });
        });
      });
    });

    // The outer afterEach() will remove the testRepoDir.
    afterEach(function(done) {
      fs.unlink(buildLog, function() {
        fs.rmdir(outputDir, function(err) {
          if (err) { return done(err); }
          fs.rmdir(builderConfig.generatedSiteDir, function(err) {
            if (err) { return done(err); }
            fs.rmdir(builderConfig.repositoryDir, done);
          });
        });
      });
    });

    var captureLogs = function() {
      sinon.stub(console, 'log').returns(null);
      sinon.stub(console, 'error').returns(null);
    };

    var restoreLogs = function() {
      console.error.restore();
      console.log.restore();
    };

    it('should create a function to launch a builder', function() {
      siteBuilder.makeBuilderListener(webhook, builderConfig);
      expect(webhook.on.calledTwice).to.be.true;
      expect(webhook.on.args[0].length).to.equal(2);
      expect(webhook.on.args[0][0]).to.equal('create');
      expect(webhook.on.args[1][0]).to.equal('push');
      expect(webhook.on.args[1].length).to.equal(2);
      expect(webhook.on.args[0][1]).to.be.a.Function;
      expect(webhook.on.args[1][1]).to.be.a.Function;
      expect(webhook.on.args[0][1]).to.equal(webhook.on.args[1][1]);
    });

    it('should create a builder that builds the site', function(done) {
      var checkResult = check(done, function(err) {
        var logMsgs = console.log.args;
        var errorMsgs = console.error.args;
        restoreLogs();
        expect(err).to.be.null;
        expect(logMsgs).to.eql([
          ['18F/foo: starting build at commit deadbeef'],
          ['description: Build me'],
          ['timestamp: 2015-09-25'],
          ['committer: michael.bland@gsa.gov'],
          ['pusher: Mike Bland michael.bland@gsa.gov'],
          ['sender: mbland'],
          ['cloning foo into ' + cloneDir],
          ['foo: build successful']
        ]);
        expect(errorMsgs).to.be.empty;
        var expectedLog = logMsgs.join('\n') + '\n';
        expect(fs.readFileSync(buildLog, 'utf8')).to.equal(expectedLog);
      });

      siteBuilder.makeBuilderListener(webhook, builderConfig, checkResult);
      var launcher = webhook.on.args[0][1];
      mySpawn.setDefault(mySpawn.simple(0));
      captureLogs();
      launcher(incomingPayload);
    });

    it('should create a builder that fails to build the site', function(done) {
      var checkResult = check(done, function(err) {
        var logMsgs = console.log.args;
        var errorMsgs = console.error.args;
        restoreLogs();
        expect(err).to.be.null;
        expect(logMsgs).to.eql([
          ['18F/foo: starting build at commit deadbeef'],
          ['description: Build me'],
          ['timestamp: 2015-09-25'],
          ['committer: michael.bland@gsa.gov'],
          ['pusher: Mike Bland michael.bland@gsa.gov'],
          ['sender: mbland'],
          ['cloning foo into ' + cloneDir],
        ]);
        expect(errorMsgs).to.eql([
          ['Error: failed to clone foo with exit code 1 from command: ' +
           'git clone git@github.com:18F/foo.git --branch 18f-pages'],
          ['foo: build failed']
        ]);
        var expectedLog = logMsgs.concat(errorMsgs).join('\n') + '\n';
        expect(fs.readFileSync(buildLog, 'utf8')).to.equal(expectedLog);
      });

      siteBuilder.makeBuilderListener(webhook, builderConfig, checkResult);
      var launcher = webhook.on.args[0][1];
      mySpawn.setDefault(mySpawn.simple(1));
      captureLogs();
      launcher(incomingPayload);
    });

    it('should ignore payloads from other organizations', function() {
      siteBuilder.makeBuilderListener(webhook, builderConfig);
      var launcher = webhook.on.args[0][1];
      sinon.spy(siteBuilder, 'launchBuilder');
      var internalLauncher = siteBuilder.launchBuilder;

      incomingPayload.repository.organization = 'not18F';
      launcher(incomingPayload);
      siteBuilder.launchBuilder.restore();
      expect(internalLauncher.called).to.be.false;
    });
  });
});
