#! /usr/bin/env node
/*
 * This is for command-runner-test.js. It will echo its command line args if
 * there are any, and exit with zero status. If there are no command line
 * args, it will write to stderr and exit with an error status.
 */

var message = process.argv.slice(2);

if (message.length !== 0) {
  process.stdout.write(message.join(' ') + '\n');
} else {
  process.stderr.write('no arguments passed on the command line\n');
  process.exit(1);
}
