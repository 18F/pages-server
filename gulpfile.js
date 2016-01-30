var gulp = require('gulp');
var mocha = require('gulp-mocha');
var eslint = require('gulp-eslint');

gulp.task('test', function() {
  return gulp.src('./test/*.js', {read: false})
    // Reporters:
    // https://github.com/mochajs/mocha/blob/master/lib/reporters/index.js
    .pipe(mocha({reporter: 'spec'}));
});

gulp.task('lint', function() {
  return gulp.src(['bin/18f-pages', '*.js', 'lib/**/*.js', 'test/**/*.js'])
    .pipe(eslint())
    .pipe(eslint.format());
});
