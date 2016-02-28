'use strict';

var Sync = require('../lib/sync');
var pagesConfig = require('../pages-config.json');
var path = require('path');
var sinon = require('sinon');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var expect = chai.expect;

chai.should();
chai.use(chaiAsPromised);

describe('Sync', function() {
  var sync,
      config,
      fakeRunner = {},
      fakeLogger = {},
      buildDestination = path.join(pagesConfig.home, 'dest_dir/repo_name');

  beforeEach(function() {
    config = JSON.parse(JSON.stringify(pagesConfig));
    config.s3 = {
      awscli: 'aws',
      bucket: 's3://18f-pages'
    };
    fakeRunner.run = sinon.stub();
    fakeLogger.log = sinon.stub();
    sync = new Sync(config, fakeRunner, fakeLogger);
  });

  it('should throw if the build destination is invalid', function() {
    expect(function() { sync.sync('/foo'); })
      .to.throw('invalid build destination /foo; ' +
        'should be a subdirectory of ' + config.home);
    fakeRunner.run.called.should.be.false;
    fakeLogger.log.called.should.be.false;
  });

  it('should skip the sync if not configured', function() {
    delete sync.s3;
    return sync.sync(buildDestination).should.be.fulfilled.then(function() {
      fakeRunner.run.called.should.be.false;
      fakeLogger.log.called.should.be.false;
    });
  });

  it('should invoke the aws s3 sync tool', function() {
    var s3Path = config.s3.bucket + '/dest_dir/repo_name';

    fakeRunner.run.returns(Promise.resolve());
    return sync.sync(buildDestination).should.be.fulfilled.then(function() {
      fakeRunner.run.args.should.eql([
        [config.s3.awscli,
         ['s3', 'sync', buildDestination, s3Path, '--delete'],
         null,
         's3 sync failed for'
        ]
      ]);
      fakeLogger.log.args.should.eql([['syncing to', s3Path]]);
    });
  });

  it('should report an error from the aws s3 sync tool', function() {
    fakeRunner.run.returns(Promise.reject('test failure'));
    return sync.sync(buildDestination)
      .should.be.rejectedWith('test failure');
  });
});
