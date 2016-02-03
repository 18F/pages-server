'use strict';

var GitRunner = require('../lib/git-runner');
var CommandRunner = require('../lib/command-runner');
var BuildLogger = require('../lib/build-logger');
var pagesConfig = require('../pages-config.json');
var path = require('path');
var fs = require('fs');
var sinon = require('sinon');
var chai = require('chai');

chai.should();

describe('GitRunner', function() {
  var config, opts, runner, commandRunner, logger;

  before(function() {
    config = JSON.parse(JSON.stringify(pagesConfig));
    config.git = 'git';
    opts = {
      githubOrg: '18F',
      repoDir: 'repo_dir',
      repoName: 'repo_name'
    };
    opts.sitePath = path.join('some/test/dir', opts.repoName);
    commandRunner = new CommandRunner(opts.sitePath, opts.repoName);
    logger = new BuildLogger();
  });

  beforeEach(function() {
    sinon.stub(fs, 'exists');
    sinon.stub(logger, 'log');
    sinon.stub(commandRunner, 'run');
    runner = new GitRunner(config, opts, commandRunner, logger);
  });

  afterEach(function() {
    commandRunner.run.restore();
    logger.log.restore();
    fs.exists.restore();
  });

  describe('prepareRepo, syncRepo, and cloneRepo', function() {
    var promise, sitePath, sitePathExists, startPromise;

    startPromise = function() {
      promise = runner.prepareRepo('18f-pages');
      sitePath = fs.exists.args[0][0];
      sitePathExists = fs.exists.args[0][1];
    };

    it('should sync an existing repository', function() {
      commandRunner.run.returns(Promise.resolve());
      commandRunner.run.returns(Promise.resolve());
      commandRunner.run.returns(Promise.resolve());

      startPromise();
      sitePath.should.eql(opts.sitePath);
      sitePathExists(true);

      return promise.should.be.fulfilled
        .then(function() {
          logger.log.args.should.eql([
            ['syncing repo:', opts.repoName]
          ]);
          commandRunner.run.args.should.eql([
            ['git', ['stash']],
            ['git', ['pull']],
            ['git', ['submodule', 'update', '--init']]
          ]);
        });
    });

    it('should clone the repository if none yet exists', function() {
      startPromise();
      sitePath.should.eql(opts.sitePath);
      sitePathExists(false);

      return promise.should.be.fulfilled
        .then(function() {
          logger.log.args.should.eql([
            [ 'cloning', 'repo_name', 'into',
              path.join('some/test/dir/repo_name')
            ]
          ]);
          commandRunner.run.args.should.eql([
            [ 'git',
              [ 'clone', 'git@github.com:18F/repo_name.git',
                '--branch', '18f-pages'
              ],
              { cwd: opts.repoDir, stdio: 'inherit' },
              'failed to clone'
            ]
          ]);
        });
    });
  });
});
