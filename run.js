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

    for (const proc of procs) {
        proc.ready = () => !terminating && !proc.started && !proc.done && !proc.terminated;
        proc.running = () => proc.started && !proc.done && !proc.terminated;
        proc.terminate = () => {
            if (proc.running()) {
                proc.process.kill();
                proc.terminated = true;
            }
        };
    }

    term.grabInput();

    function spawnNext() {
        const next = procs.find(x => x.ready());
        if (!next) return;

        next.process = spawn(next.exec, next.args, {stdio: 'pipe'});
        next.started = true;

        const lineNo = log.curLine();
        log(next.name + ': Started\n');

        let lastStatus = '';

        function setStatus(status) {
            term.saveCursor();

            const startAt = next.name.length + 2;
            term.move(startAt, lineNo - log.curLine());
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
            if (proc.running)
                proc.terminate();
            if (proc.terminated)
                killedCount++;
            if (proc.error !== undefined)
                errCount++;
            else if (proc.done)
                doneCount++;
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