'use strict';

var Options = require('../lib/options');
var path = require('path');
var chai = require('chai');

var expect = chai.expect;
chai.should();

var OrigConfig = require('../pages-config.json');

describe('Options', function() {
  var config;

  beforeEach(function() {
    config = JSON.parse(JSON.stringify(OrigConfig));
  });

  it('should use top-level configuration defaults', function() {
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

    var opts = new Options(info, config, builderConfig);
    expect(opts.repoDir).to.equal(path.join('/home/ubuntu/repo_dir'));
    expect(opts.repoName).to.equal('repo_name');
    expect(opts.sitePath).to.equal(
      path.join('/home/ubuntu/repo_dir/repo_name'));
    expect(opts.branch).to.equal('18f-pages');
    expect(opts.destDir).to.equal(path.join('/home/ubuntu/dest_dir'));
    expect(opts.internalDestDir).to.be.undefined;
    expect(opts.githubOrg).to.equal('18F');
    expect(opts.pagesConfig).to.equal('_config_18f_pages.yml');
    expect(opts.assetRoot).to.equal('/guides-template');
  });

  it('should override top-level defaults if builder-defined', function() {
    var info = {
      repository: {
        name: 'repo_name'
      },
      ref: 'refs/heads/foobar-pages'
    };

    var builderConfig = {
      'githubOrg': 'foobar',
      'pagesConfig': '_config_foobar_pages.yml',
      'pagesYaml': '.18f-pages.yml',
      'branch': 'foobar-pages',
      'repositoryDir': 'repo_dir',
      'generatedSiteDir': 'dest_dir',
      'assetRoot': '/foobar-template',
      'branchInUrlPattern': 'v[0-9\]+.[0-9]+.[0-9]*[a-z]+'
    };

    var opts = new Options(info, config, builderConfig);
    expect(opts.repoDir).to.equal(path.join('/home/ubuntu/repo_dir'));
    expect(opts.repoName).to.equal('repo_name');
    expect(opts.sitePath).to.equal(
      path.join('/home/ubuntu/repo_dir/repo_name'));
    expect(opts.branch).to.equal('foobar-pages');
    expect(opts.destDir).to.equal(path.join('/home/ubuntu/dest_dir'));
    expect(opts.internalDestDir).to.be.undefined;
    expect(opts.githubOrg).to.equal('foobar');
    expect(opts.pagesConfig).to.equal('_config_foobar_pages.yml');
    expect(opts.pagesYaml).to.equal('.18f-pages.yml');
    expect(opts.assetRoot).to.equal('/foobar-template');
    expect(opts.branchInUrlPattern.toString()).to.equal(
      '/' + builderConfig.branchInUrlPattern + '/i');
  });

  it('should set internalDestDir when internalSiteDir defined', function() {
    var info = {
      repository: {
        name: 'repo_name'
      },
      ref: 'refs/heads/18f-pages'
    };

    var builderConfig = {
      'branch': '18f-pages',
      'repositoryDir': 'repo_dir',
      'generatedSiteDir': 'dest_dir',
      'internalSiteDir': 'internal_dest_dir'
    };

    var opts = new Options(info, config, builderConfig);
    expect(opts.destDir).to.equal(path.join('/home/ubuntu/dest_dir'));
    expect(opts.internalDestDir).to.equal(
      path.join('/home/ubuntu/internal_dest_dir'));
  });
});
