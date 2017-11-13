#!/usr/bin/env node

"use strict" ;

const spawn = require('child_process').spawn;
const term = require('terminal-kit').terminal;
const concurrency = require('os').cpus().length;

module.exports = function(procs, options, callback) {
    const log = require('./log')();

    if (!callback && typeof options === 'function') {
        callback = options;
        options = {};
    }
    options = options || {};

    let terminating = false;

    term.grabInput();

    function spawnNext() {
        if (terminating) return;
        const next = procs.find(x => !x.started && !x.done);
        if (!next) return;

        next.process = spawn(next.exec, next.args, {stdio: 'pipe'});
        next.started = true;

        next.lineNo = log.curLine();
        log(next.name + ': Started\n');

        let lastStatus = '';

        function setStatus(status) {
            term.saveCursor();

            const startAt = next.name.length + 2;
            term.move(startAt, next.lineNo - log.curLine());
            process.stdout.write(status.slice(0, term.width - startAt));
            term.eraseLineAfter();
            term.restoreCursor();
            lastStatus = status;
        }

        let output = '';
        next.process.stdout.on('data', (chunk) => {
            chunk = chunk.toString().split('\n').splice(-2);
            if (chunk.length === 0) return;

            output += chunk[0];

            if (chunk.length === 2) {
                setStatus(output);
                output = chunk[1];
            }
        });

        next.process.on('close', function (code) {
            if (code === 0) {
                setStatus('Done!');
            } else if (next.process.killed) {
                setStatus('Terminated')
            } else {
                next.error = lastStatus;
                setStatus('Failed: ' + lastStatus)
            }

            next.done = true;
            next.exitCode = code;
            if (!spawnNext() && !procs.some(x => !x.done)) {
                log('\nAll processes done\n');
                terminate();
            }
        });

        return next.process;
    }

    function terminate() {
        terminating = true;

        let errCount = 0;
        let killedCount = 0;
        let doneCount = 0;
        for (const proc of procs) {
            if (proc.started && !proc.done) {
                proc.process.kill();
                killedCount++;
            }
            if (proc.error !== undefined)
                errCount++;
            else if (proc.done) doneCount++;
        }
        log(errCount+' processes failed\n');
        log(killedCount+' processes terminated\n');
        log(doneCount+' processes finished successfully\n');

        term.grabInput(false);
        setTimeout(function () {
            callback();
        }, 100);
    }

    term.on('key', function (name, matches, data) {
        if (matches.indexOf('CTRL_C') >= 0) {
            log('\nStopping all processes...\n');
            terminate();
        }
    });

    // Start calculations
    log(`Running ${procs.length} subprocesses...\n\n`);

    for (let x of new Array(concurrency))
        setTimeout(spawnNext, x * 100);
};