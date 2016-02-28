'use strict';

var SiteBuilder = require('../lib/site-builder');
var Options = require('../lib/options');
var BuildLogger = require('../lib/build-logger');
var ComponentFactory = require('../lib/component-factory');
var FileLockedOperation = require('file-locked-operation');
var fs = require('fs');
var path = require('path');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var sinon = require('sinon');
var childProcess = require('child_process');
var mockSpawn = require('mock-spawn');

var FilesHelper = require('./files-helper');
var OrigConfig = require('../pages-config.json');

var expect = chai.expect;
chai.should();
chai.use(chaiAsPromised);

describe('SiteBuilder', function() {
  var config, origSpawn, mySpawn, logger, filesHelper, expectLogMessages;

  function cloneConfig() {
    config = JSON.parse(JSON.stringify(OrigConfig));
    config.home = '';
    config.git = 'git';
    config.bundler = 'bundle';
    config.jekyll = 'jekyll';
    config.rsync = 'rsync';
  }

  before(function() {
    cloneConfig();
    SiteBuilder.setConfiguration(config);
    filesHelper = new FilesHelper();
    return filesHelper.init(config);
  });

  after(function() {
    return filesHelper.after();
  });

  beforeEach(function() {
    origSpawn = childProcess.spawn;
    mySpawn = mockSpawn();
    childProcess.spawn = mySpawn;
    logger = new BuildLogger();
  });

  afterEach(function() {
    childProcess.spawn = origSpawn;
    return filesHelper.afterEach();
  });

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

  var makeBuilder = function(options, branch) {
    var opts = options || makeOpts(),
        targetBranch = branch || '18f-pages',
        components;

    opts.sitePath = filesHelper.dirs.testRepoDir;
    components = new ComponentFactory(config, opts, targetBranch, logger);
    components.updateLock = new FileLockedOperation(
      filesHelper.files.lockfilePath);
    return new SiteBuilder(targetBranch, components);
  };

  expectLogMessages = function(consoleArgs, expected) {
    var consoleMessages = consoleArgs.map(function(arg) {
      return arg.join(' ');
    });
    expect(consoleMessages).to.eql(expected);
  };

  describe('build', function() {
    var builder, buildConfigs, runBuild;

    beforeEach(function() {
      builder = makeBuilder();
      buildConfigs = [{
        destination: 'dest_dir',
        configurations: '_config.yml,' + config.pagesConfig
      }];

      sinon.stub(builder.gitRunner, 'prepareRepo')
        .returns(Promise.resolve());
      sinon.stub(builder.configHandler, 'init')
        .returns(Promise.resolve());
      sinon.stub(builder.commandRunner, 'run')
        .returns(Promise.resolve());
      sinon.stub(builder.configHandler, 'readOrWriteConfig')
        .returns(Promise.resolve());
      sinon.stub(builder.configHandler, 'buildConfigurations')
        .returns(buildConfigs);
      sinon.stub(builder.jekyllHelper, 'build')
        .returns(Promise.resolve());
      sinon.stub(builder.configHandler, 'removeGeneratedConfig')
        .returns(Promise.resolve());
      sinon.stub(builder.updateLock, 'doLockedOperation')
        .returns(Promise.resolve());
    });

    runBuild = function() {
      return builder.build()
        .then(function() {
          return builder.updateLock.doLockedOperation.args[0][0]();
        });
    };

    it('should perform a successful jekyll build without bundler', function() {
      builder.configHandler.usesJekyll = true;
      builder.configHandler.usesBundler = false;

      return runBuild().should.be.fulfilled
        .then(function() {
          builder.gitRunner.prepareRepo.args.should.eql([[builder.branch]]);
          builder.configHandler.init.called.should.be.true;
          builder.commandRunner.run.called.should.be.false;
          builder.configHandler.readOrWriteConfig.called.should.be.true;
          builder.jekyllHelper.build.args.should.eql([
            [buildConfigs, { bundler: false }]
          ]);
          builder.configHandler.removeGeneratedConfig.called.should.be.true;
        });
    });

    it('should perform a successful jekyll build using bundler', function() {
      builder.configHandler.usesJekyll = true;
      builder.configHandler.usesBundler = true;

      return runBuild().should.be.fulfilled
        .then(function() {
          builder.gitRunner.prepareRepo.args.should.eql([[builder.branch]]);
          builder.configHandler.init.called.should.be.true;
          builder.commandRunner.run.args.should.eql([
            [config.bundler, ['install']]
          ]);
          builder.configHandler.readOrWriteConfig.called.should.be.true;
          builder.jekyllHelper.build.args.should.eql([
            [buildConfigs, { bundler: true }]
          ]);
          builder.configHandler.removeGeneratedConfig.called.should.be.true;
        });
    });

    it('should perform a successful rsync build', function() {
      builder.configHandler.usesJekyll = false;
      builder.configHandler.usesBundler = false;
      builder.configHandler.buildDestination = 'dest_dir';

      return runBuild().should.be.fulfilled
        .then(function() {
          builder.gitRunner.prepareRepo.args.should.eql([[builder.branch]]);
          builder.configHandler.init.called.should.be.true;
          builder.commandRunner.run.args.should.eql([
            [config.rsync, config.rsyncOpts.concat(['./', 'dest_dir'])]
          ]);
          builder.configHandler.readOrWriteConfig.called.should.be.false;
          builder.jekyllHelper.build.called.should.be.false;
          builder.configHandler.removeGeneratedConfig.called.should.be.false;
        });
    });

    it('should propagate errors from a failed build', function() {
      builder.gitRunner.prepareRepo.withArgs(builder.branch)
        .returns(Promise.reject(new Error('test error')));

      return runBuild().should.be.rejectedWith(Error, 'test error')
        .then(function() {
          builder.configHandler.init.called.should.be.false;
          builder.commandRunner.run.called.should.be.false;
          builder.configHandler.readOrWriteConfig.called.should.be.false;
          builder.jekyllHelper.build.called.should.be.false;
          builder.configHandler.removeGeneratedConfig.called.should.be.false;
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
        'repositoryDir': path.join(filesHelper.dirs.testRepoDir, 'repo_dir'),
        'generatedSiteDir': path.join(filesHelper.dirs.testRepoDir, 'dest_dir')
      };

      cloneDir = path.join(filesHelper.dirs.testRepoDir, 'repo_dir/foo');
      outputDir = path.join(filesHelper.dirs.testRepoDir, 'dest_dir/foo');
      buildLog = path.join(outputDir, 'build.log');
    });

    beforeEach(function(done) {
      webhook = { on: sinon.spy() };
      fs.mkdir(filesHelper.dirs.testRepoDir, function(err) {
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
      var handler = SiteBuilder.makeBuilderListener(webhook, builderConfig);
      expect(handler).to.be.a.Function;
      expect(webhook.on.calledTwice).to.be.true;
      expect(webhook.on.args[0].length).to.equal(2);
      expect(webhook.on.args[0][0]).to.equal('create');
      expect(webhook.on.args[0][1]).to.be.handler;
      expect(webhook.on.args[1].length).to.equal(2);
      expect(webhook.on.args[1][0]).to.equal('push');
      expect(webhook.on.args[1][1]).to.be.handler;
    });

    it('should create a builder that builds the site', function() {
      var handler = SiteBuilder.makeBuilderListener(webhook, builderConfig);

      mySpawn.setDefault(mySpawn.simple(0));
      captureLogs();
      return handler(incomingPayload).should.be.fulfilled.then(function() {
        var logMsgs = console.log.args,
            errorMsgs = console.error.args,
            expectedMessages = [
              '18F/foo: starting build at commit deadbeef',
              'description: Build me',
              'timestamp: 2015-09-25',
              'committer: michael.bland@gsa.gov',
              'pusher: Mike Bland michael.bland@gsa.gov',
              'sender: mbland',
              'cloning foo into ' + cloneDir,
              'foo: build successful'
            ],
            expectedLog = expectedMessages.join('\n') + '\n';

        restoreLogs();
        expectLogMessages(logMsgs, expectedMessages);
        expect(errorMsgs).to.be.empty;
        expect(fs.readFileSync(buildLog, 'utf8')).to.equal(expectedLog);
      });
    });

    it('should create a builder that fails to build the site', function() {
      var handler = SiteBuilder.makeBuilderListener(webhook, builderConfig);

      mySpawn.setDefault(mySpawn.simple(1));
      captureLogs();
      return handler(incomingPayload).should.be.fulfilled.then(function() {
        var logMsgs = console.log.args,
            errorMsgs = console.error.args,
            expectedMessages = [
              '18F/foo: starting build at commit deadbeef',
              'description: Build me',
              'timestamp: 2015-09-25',
              'committer: michael.bland@gsa.gov',
              'pusher: Mike Bland michael.bland@gsa.gov',
              'sender: mbland',
              'cloning foo into ' + cloneDir
            ],
            expectedErrors = [
              'Error: failed to clone foo with exit code 1 from command: ' +
                'git clone git@github.com:18F/foo.git --branch 18f-pages',
              'foo: build failed'
            ],
            expectedLog = expectedMessages.concat(expectedErrors)
              .join('\n') + '\n';

        restoreLogs();
        expectLogMessages(logMsgs, expectedMessages);
        expectLogMessages(errorMsgs, expectedErrors);
        expect(fs.readFileSync(buildLog, 'utf8')).to.equal(expectedLog);
      });
    });

    it('should ignore payloads from other organizations', function() {
      var handler = SiteBuilder.makeBuilderListener(webhook, builderConfig);
      incomingPayload.repository.organization = 'not18F';
      expect(handler(incomingPayload)).to.be.undefined;
    });
  });
});
