'use strict';

var ConfigHandler = require('../lib/config-handler');
var path = require('path');
var chai = require('chai');

chai.should();

describe('ConfigHandler', function() {
  var opts, handler, fileHandler, logger;

  before(function() {
    opts = {
      pagesConfig: '',
      repoName: 'repo_name',
      destDir: 'dest_dir',
      internalDestDir: 'internal_dest_dir',
      assetRoot: '',
      branchInUrlPattern: ''
    };
    handler = new ConfigHandler(opts, fileHandler, logger);
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
