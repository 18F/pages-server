'use strict';

var SiteBuilder = require('../lib/site-builder');
var Options = require('../lib/options');
var CommandRunner = require('../lib/command-runner');
var JekyllCommandHelper = require('../lib/jekyll-command-helper');
var BuildLogger = require('../lib/build-logger');
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
  var builder, config, origSpawn, mySpawn, logger, logMock;
  var filesHelper, updateLock, filenameToContents, expectLogMessages;

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
    logMock = sinon.mock(logger);
    updateLock = new FileLockedOperation(filesHelper.files.lockfilePath);
    filenameToContents = {};
  });

  afterEach(function() {
    childProcess.spawn = origSpawn;
    return filesHelper.afterEach();
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

  var makeBuilder = function(options, branch) {
    var opts = options || makeOpts(),
        targetBranch = branch || '18f-pages',
        commandRunner,
        jekyllHelper;

    opts.sitePath = filesHelper.dirs.testRepoDir;
    commandRunner = new CommandRunner(opts.sitePath, opts.repoName);
    jekyllHelper = new JekyllCommandHelper(commandRunner, opts,
      config.jekyll, config.bundler);
    return new SiteBuilder(opts, targetBranch, commandRunner, jekyllHelper,
      logger, updateLock);
  };

  describe('generated configuration', function() {
    var inRepoDir, writeConfig, readConfig, checkResults;

    inRepoDir = function() {
      return filesHelper.createRepoDir();
    };

    writeConfig = function() {
      var configExists = false;
      return builder.readOrWriteConfig(configExists);
    };

    readConfig = function() {
      expect(builder.generatedConfig).to.be.true;
      return new Promise(function(resolve, reject) {
        fs.readFile(filesHelper.files.pagesConfig, function(err, data) {
          if (err) { reject(err); } else { resolve(data.toString()); }
        });
      });
    };

    checkResults = function(expectedContent) {
      return function(content) {
        return builder.finishBuild()
          .then(function() {
            expect(content).to.equal(expectedContent);
          });
      };
    };

    expectLogMessages = function(consoleArgs, expected) {
      var consoleMessages = consoleArgs.map(function(arg) {
        return arg.join(' ');
      });

      expect(consoleMessages).to.eql(expected);
    };

    it('should write the expected configuration', function() {
      var expectedContent = 'baseurl: /repo_name\n' +
        'asset_root: ' + config.assetRoot + '\n';

      builder = makeBuilder();
      logMock.expects('log').withExactArgs(
        'generating', config.pagesConfig);
      logMock.expects('log').withExactArgs(
        'removing generated', config.pagesConfig);

      return inRepoDir().then(writeConfig).then(readConfig)
        .then(checkResults(expectedContent))
        .then(function() { logMock.verify(); });
    });

    it('should write a config with a branch-specific baseurl', function() {
      var expectedContent,
          opts;

      opts = makeOpts();
      opts.sitePath = filesHelper.dirs.testRepoDir;
      opts.branchInUrlPattern = 'v[0-9]+.[0-9]+.[0-9]*[a-z]+';
      builder = makeBuilder(opts, 'v0.9.x');

      expectedContent = 'baseurl: /repo_name/v0.9.x\n' +
        'asset_root: ' + config.assetRoot + '\n';

      logMock.expects('log').withExactArgs(
        'generating', config.pagesConfig);
      logMock.expects('log').withExactArgs(
        'removing generated', config.pagesConfig);

      return inRepoDir().then(writeConfig).then(readConfig)
        .then(checkResults(expectedContent))
        .then(function() { logMock.verify(); });
    });
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
      expect(builder.buildDestination).to.equal(
        path.join('dest_dir/repo_name'));
    });

    it('should keep the default destination if empty', function() {
      builder._parseDestinationFromConfigData('baseurl:\n');
      expect(builder.buildDestination).to.equal(
        path.join('dest_dir/repo_name'));
    });

    it('should keep the default destination if empty with spaces', function() {
      builder._parseDestinationFromConfigData('baseurl:   \n');
      expect(builder.buildDestination).to.equal(
        path.join('dest_dir/repo_name'));
    });

    it('should keep the default destination if set to root path', function() {
      builder._parseDestinationFromConfigData('baseurl: /\n');
      expect(builder.buildDestination).to.equal(
        path.join('dest_dir/repo_name'));
    });

    it('should set the destination from config data baseurl', function() {
      builder._parseDestinationFromConfigData('baseurl: /new-destination\n');
      expect(builder.buildDestination).to.equal(
        path.join('dest_dir/new-destination'));
    });

    it('should set the internal destination from config data', function() {
      var opts = makeOpts();
      opts.internalDestDir = 'internal_dest_dir';
      var builder = makeBuilder(opts);
      builder._parseDestinationFromConfigData('baseurl: /new-destination\n');
      expect(builder.buildDestination).to.equal(
        path.join('dest_dir/new-destination'));
      expect(builder.internalBuildDestination).to.equal(
        path.join('internal_dest_dir/new-destination'));
    });

    it('should parse baseurl if no leading space', function() {
      builder._parseDestinationFromConfigData('baseurl:/new-destination\n');
      expect(builder.buildDestination).to.equal(
        path.join('dest_dir/new-destination'));
    });

    it('should trim all spaces around baseurl', function() {
      builder._parseDestinationFromConfigData(
        'baseurl:   /new-destination   \n');
      expect(builder.buildDestination).to.equal(
        path.join('dest_dir/new-destination'));
    });
  });

  it('should clone the repo if the directory does not exist', function() {
    mySpawn.setDefault(mySpawn.simple(0));
    mySpawn.sequence.add(function(done) {
      filesHelper.createRepoDir()
        .then(function() {
          done(0);
        });
    });

    logMock.expects('log').withExactArgs(
      'cloning', 'repo_name', 'into', filesHelper.dirs.testRepoDir);
    logMock.expects('log').withExactArgs(
      'generating', config.pagesConfig);
    logMock.expects('log').withExactArgs(
      'removing generated', config.pagesConfig);
    return makeBuilder().build().should.be.fulfilled.then(function() {
      expect(spawnCalls()).to.eql([
        'git clone git@github.com:18F/repo_name.git --branch 18f-pages',
        'jekyll build --trace --destination ' +
          path.join('dest_dir/repo_name') +
          ' --config _config.yml,_config_18f_pages.yml'
      ]);
      logMock.verify();
    });
  });

  it('should report an error if the clone fails', function() {
    var cloneCommand =
      'git clone git@github.com:18F/repo_name.git --branch 18f-pages';

    mySpawn.sequence.add(mySpawn.simple(1));
    logMock.expects('log').withExactArgs(
      'cloning', 'repo_name', 'into', filesHelper.dirs.testRepoDir);
    return makeBuilder().build().should.be.rejectedWith(
      'Error: failed to clone repo_name with exit code 1 from command: ' +
        cloneCommand)
      .then(function() {
        expect(spawnCalls()).to.eql([cloneCommand]);
        logMock.verify();
      });
  });

  it('should sync the repo if the directory already exists', function() {
    mySpawn.setDefault(mySpawn.simple(0));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    logMock.expects('log').withExactArgs(
      'generating', config.pagesConfig);
    logMock.expects('log').withExactArgs(
      'removing generated', config.pagesConfig);
    return filesHelper.createRepoDir()
      .then(function() {
        return makeBuilder().build().should.be.fulfilled.then(function() {
          expect(spawnCalls()).to.eql([
            'git stash',
            'git pull',
            'git submodule update --init',
            'jekyll build --trace --destination ' +
              path.join('dest_dir/repo_name') +
              ' --config _config.yml,_config_18f_pages.yml'
          ]);
          logMock.verify();
        });
      });
  });

  it ('should use bundler if a Gemfile is present', function() {
    mySpawn.setDefault(mySpawn.simple(0));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    logMock.expects('log').withExactArgs(
      'generating', config.pagesConfig);
    logMock.expects('log').withExactArgs(
      'removing generated', config.pagesConfig);
    filenameToContents[filesHelper.files.gemfile] = '';
    return filesHelper.createRepoWithFiles(filenameToContents)
      .then(function() {
        return makeBuilder().build().should.be.fulfilled.then(function() {
          expect(spawnCalls()).to.eql([
            'git stash',
            'git pull',
            'git submodule update --init',
            'bundle install',
            'bundle exec jekyll build --trace --destination ' +
              path.join('dest_dir/repo_name') +
              ' --config _config.yml,_config_18f_pages.yml'
          ]);
          logMock.verify();
        });
      });
  });

  it ('should fail if bundle install fails', function() {
    mySpawn.sequence.add(mySpawn.simple(0));
    mySpawn.sequence.add(mySpawn.simple(0));
    mySpawn.sequence.add(mySpawn.simple(0));
    mySpawn.sequence.add(mySpawn.simple(1));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    filenameToContents[filesHelper.files.gemfile] = '';
    return filesHelper.createRepoWithFiles(filenameToContents)
      .then(function() {
        var bundleInstallCommand = 'bundle install';

        return makeBuilder().build().should.be.rejectedWith(
          'Error: rebuild failed for repo_name with ' +
            'exit code 1 from command: ' + bundleInstallCommand)
          .then(function() {
            expect(spawnCalls()).to.eql([
              'git stash',
              'git pull',
              'git submodule update --init',
              bundleInstallCommand]);
            logMock.verify();
          });
      });
  });

  it ('should fail if jekyll build fails', function() {
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
    filenameToContents[filesHelper.files.gemfile] = '';
    return filesHelper.createRepoWithFiles(filenameToContents)
      .then(function() {
        var jekyllBuildCommand =
          'bundle exec jekyll build --trace --destination ' +
            path.join('dest_dir/repo_name') +
            ' --config _config.yml,_config_18f_pages.yml';

        return makeBuilder().build().should.be.rejectedWith(
          'Error: rebuild failed for repo_name with ' +
            'exit code 1 from command: ' + jekyllBuildCommand)
          .then(function() {
            expect(spawnCalls()).to.eql([
              'git stash',
              'git pull',
              'git submodule update --init',
              'bundle install',
              jekyllBuildCommand]);
            logMock.verify();
          });
      });
  });

  it('should use existing _config_18f_pages.yml if present', function() {
    mySpawn.setDefault(mySpawn.simple(0));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    logMock.expects('log').withExactArgs(
      'using existing', config.pagesConfig);
    filenameToContents[filesHelper.files.pagesConfig] = '';
    return filesHelper.createRepoWithFiles(filenameToContents)
      .then(function() {
        return makeBuilder().build().should.be.fulfilled.then(function() {
          expect(spawnCalls()).to.eql([
            'git stash',
            'git pull',
            'git submodule update --init',
            'jekyll build --trace --destination ' +
              path.join('dest_dir/repo_name') +
              ' --config _config.yml,_config_18f_pages.yml'
          ]);
          logMock.verify();
        });
      });
  });

  it('should use baseurl from _config_18f_pages.yml as dest', function() {
    mySpawn.setDefault(mySpawn.simple(0));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    logMock.expects('log').withExactArgs(
      'using existing', config.pagesConfig);
    filenameToContents[filesHelper.files.pagesConfig] =
      'baseurl:  /new-destination  ';
    return filesHelper.createRepoWithFiles(filenameToContents)
      .then(function() {
        return makeBuilder().build().should.be.fulfilled.then(function() {
          expect(spawnCalls()).to.eql([
            'git stash',
            'git pull',
            'git submodule update --init',
            'jekyll build --trace --destination ' +
              path.join('dest_dir/new-destination') +
              ' --config _config.yml,_config_18f_pages.yml'
          ]);
          logMock.verify();
        });
      });
  });

  it('should use rsync if _config.yml is not present', function() {
    mySpawn.setDefault(mySpawn.simple(0));
    logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
    filenameToContents[filesHelper.files.pagesConfig] = '';
    return filesHelper.createRepoWithFiles(filenameToContents)
      .then(function() {
        return filesHelper.removeFile(filesHelper.files.configYml);
      })
      .then(function() {
        return makeBuilder().build().should.be.fulfilled.then(function() {
          expect(spawnCalls()).to.eql([
            'git stash',
            'git pull',
            'git submodule update --init',
            'rsync -vaxp --delete --ignore-errors --exclude=.[A-Za-z0-9]* ' +
              './ ' + path.join('dest_dir/repo_name')
          ]);
          logMock.verify();
        });
      });
  });

  describe('internal publishing mechanism', function() {
    it('should error if internal config without internal dir', function() {
      mySpawn.setDefault(mySpawn.simple(0));
      logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');

      filenameToContents[filesHelper.files.internalConfig] = '';
      return filesHelper.createRepoWithFiles(filenameToContents)
        .then(function() {
          return makeBuilder().build().should.be.rejectedWith(
            'Error: failed to build a site with a ' +
              '_config_internal.yml file without an internalSiteDir defined ' +
              'in the builder configuration')
            .then(function() {
              expect(spawnCalls()).to.eql([
                'git stash', 'git pull', 'git submodule update --init'
              ]);
              logMock.verify();
            });
        });
    });

    it('should error if external config without internal conf', function() {
      mySpawn.setDefault(mySpawn.simple(0));
      logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');

      filenameToContents[filesHelper.files.externalConfig] = '';
      return filesHelper.createRepoWithFiles(filenameToContents)
        .then(function() {
          return makeBuilder().build().should.be.rejectedWith(
            'Error: failed to build a site with a ' +
              '_config_external.yml file without a corresponding ' +
              '_config_internal.yml file')
            .then(function() {
              expect(spawnCalls()).to.eql([
                'git stash', 'git pull', 'git submodule update --init'
              ]);
              logMock.verify();
            });
        });
    });

    it('should publish with internal config only', function() {
      mySpawn.setDefault(mySpawn.simple(0));
      logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
      logMock.expects('log').withExactArgs(
        'generating', config.pagesConfig);
      logMock.expects('log').withExactArgs(
        'removing generated', config.pagesConfig);

      filenameToContents[filesHelper.files.internalConfig] = '';
      var opts = makeOpts();

      return filesHelper.createRepoWithFiles(filenameToContents)
        .then(function() {
          opts.internalDestDir = 'internal_dest_dir';
          return makeBuilder(opts).build().should.be.fulfilled.then(function() {
            expect(spawnCalls()).to.eql([
              'git stash',
              'git pull',
              'git submodule update --init',
              'jekyll build --trace --destination ' +
                path.join('internal_dest_dir/repo_name') +
                ' --config _config.yml,_config_internal.yml,' +
                '_config_18f_pages.yml',
              'jekyll build --trace --destination ' +
                path.join('dest_dir/repo_name') +
                ' --config _config.yml,_config_18f_pages.yml'
            ]);
            logMock.verify();
          });
        });
    });

    it('should publish with internal and external configs', function() {
      mySpawn.setDefault(mySpawn.simple(0));
      logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
      logMock.expects('log').withExactArgs(
        'generating', config.pagesConfig);
      logMock.expects('log').withExactArgs(
        'removing generated', config.pagesConfig);

      filenameToContents[filesHelper.files.internalConfig] = '';
      filenameToContents[filesHelper.files.externalConfig] = '';
      var opts = makeOpts();

      return filesHelper.createRepoWithFiles(filenameToContents)
        .then(function() {
          opts.internalDestDir = 'internal_dest_dir';
          return makeBuilder(opts).build().should.be.fulfilled.then(function() {
            expect(spawnCalls()).to.eql([
              'git stash',
              'git pull',
              'git submodule update --init',
              'jekyll build --trace --destination ' +
                path.join('internal_dest_dir/repo_name') +
                ' --config _config.yml,_config_internal.yml,' +
                '_config_18f_pages.yml',
              'jekyll build --trace --destination ' +
                path.join('dest_dir/repo_name') +
                ' --config _config.yml,_config_external.yml,' +
                '_config_18f_pages.yml'
            ]);
            logMock.verify();
          });
        });
    });
  });

  describe('write to a branch-specific URL', function() {
    it('should use config.branchInUrlPattern as a trigger', function() {
      mySpawn.setDefault(mySpawn.simple(0));
      logMock.expects('log').withExactArgs('syncing repo:', 'repo_name');
      logMock.expects('log').withExactArgs(
        'generating', config.pagesConfig);
      logMock.expects('log').withExactArgs(
        'removing generated', config.pagesConfig);

      filenameToContents[filesHelper.files.gemfile] = '';
      return filesHelper.createRepoWithFiles(filenameToContents)
        .then(function() {
          var opts = makeOpts();

          opts.branchInUrlPattern = 'v[0-9]+.[0-9]+.[0-9]*[a-z]+';
          opts.sitePath = filesHelper.dirs.testRepoDir;
          return makeBuilder(opts, 'v0.9.x').build()
            .should.be.fulfilled.then(function() {
              expect(spawnCalls()).to.eql([
                'git stash',
                'git pull',
                'git submodule update --init',
                'bundle install',
                'bundle exec jekyll build --trace --destination ' +
                  path.join('dest_dir/repo_name/v0.9.x') +
                  ' --config _config.yml,_config_18f_pages.yml'
              ]);
              logMock.verify();
            });
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
      SiteBuilder.makeBuilderListener(webhook, builderConfig);
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
        expect(err).to.be.null;
        expectLogMessages(logMsgs, expectedMessages);
        expect(errorMsgs).to.be.empty;
        expect(fs.readFileSync(buildLog, 'utf8')).to.equal(expectedLog);
      });

      SiteBuilder.makeBuilderListener(webhook, builderConfig, checkResult);
      var launcher = webhook.on.args[0][1];
      mySpawn.setDefault(mySpawn.simple(0));
      captureLogs();
      launcher(incomingPayload);
    });

    it('should build by matching branchInUrlPattern', function(done) {
      var launcher, checkResult, payload, config;

      checkResult = check(done, function(err) {
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
        expect(err).to.be.null;
        expectLogMessages(logMsgs, expectedMessages);
        expect(errorMsgs).to.be.empty;
        expect(fs.readFileSync(buildLog, 'utf8')).to.equal(expectedLog);
      });

      payload = JSON.parse(JSON.stringify(incomingPayload));
      payload.ref = 'refs/heads/v0.9.x';
      config = JSON.parse(JSON.stringify(builderConfig));
      delete config.branch;
      config.branchInUrlPattern = 'v[0-9]+.[0-9]+.[0-9]*[a-z]+';

      SiteBuilder.makeBuilderListener(webhook, config, checkResult);
      launcher = webhook.on.args[0][1];
      mySpawn.setDefault(mySpawn.simple(0));
      captureLogs();
      launcher(payload);
    });

    it('should create a builder that fails to build the site', function(done) {
      var checkResult = check(done, function(err) {
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
        expect(err).to.be.null;
        expectLogMessages(logMsgs, expectedMessages);
        expectLogMessages(errorMsgs, expectedErrors);
        expect(fs.readFileSync(buildLog, 'utf8')).to.equal(expectedLog);
      });

      SiteBuilder.makeBuilderListener(webhook, builderConfig, checkResult);
      var launcher = webhook.on.args[0][1];
      mySpawn.setDefault(mySpawn.simple(1));
      captureLogs();
      launcher(incomingPayload);
    });

    it('should ignore payloads from other organizations', function() {
      SiteBuilder.makeBuilderListener(webhook, builderConfig);
      var launcher = webhook.on.args[0][1];
      sinon.spy(SiteBuilder, 'launchBuilder');
      var internalLauncher = SiteBuilder.launchBuilder;

      incomingPayload.repository.organization = 'not18F';
      launcher(incomingPayload);
      SiteBuilder.launchBuilder.restore();
      expect(internalLauncher.called).to.be.false;
    });
  });
});
