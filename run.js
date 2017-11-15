#!/usr/bin/env node

"use strict" ;

const EventEmitter = require('events');
const concurrency = require('os').cpus().length;
const startTimeout = 5000;
const procTimeout = 2*60*1000;

module.exports = function(initialProcs, options) {
    const spawn = require('child_process').spawn; // Here for testing

    options = options || {};
    const eventEmitter = new EventEmitter();
    const procs = [];

    function addProc(newProc) {
        if (Array.isArray(newProc)) return newProc.forEach(addProc);

        const proc = {
            exec: newProc.exec,
            name: newProc.name || newProc.exec,
            args: newProc.args || [],
            inx: procs.length+1,
            toString: () => `[${newProc.inx}] ${newProc.name}`,
        };

        proc.ready = () => !exports.terminating && !proc.started && !proc.done && !proc.terminated;
        proc.running = () => proc.started && !proc.done && !proc.terminated;
        proc.terminate = () => false;

        if (typeof (proc.exec) !== 'string')
            throw new Error(`Command for process ${proc.inx} (${proc.name}) is not a string/path`);

        procs.push(proc);
    }

    function spawnNext() {
        const next = procs.find(x => x.ready());
        if (!next) return;

        next.started = true;
        next.lastDataLine = '';
        exports.startedCount++;
        let hasSentData = false;
        let dataBuffer = '';

        eventEmitter.emit('processStarted', next);

        let process;
        try {
            process = spawn(next.exec, next.args, {stdio: 'pipe'});
            process.on('close', onClose);
            process.on('error', onError);
            process.stdout.on('data', onData);
            process.stderr.on('data', onData);
        } catch (e) {
            onData('Could not start - '+e.message+'\n');
            onClose(1);
        }

        setTimeout(() => {
            if (!hasSentData && !next.error && process.exitCode === null) {
                next.error = 'timed out waiting for response from '+next.exec;
                next.terminate();
            }
        }, startTimeout);

        setTimeout(() => {
            if (next.running()) {
                next.error = 'process timed out';
                next.terminate();
            }
        }, procTimeout);

        function onError(err) {
            onData(err);
            // onClose may or may not be called after onError
            // we'll wait a bit, and if it doesn't look like onClose has been called, we do it here
            setTimeout(() => {if (!next.done) onClose()}, 100);
        }

        function onClose(code) {
            if (code !== null)
                next.exitCode = code;
            if (next.done)
                return;

            next.done = true;

            if (dataBuffer) onData('\n');

            if (code === 0) {
                eventEmitter.emit('processSuccess', next);
            } else if (process && process.killed && !next.error) {
                eventEmitter.emit('processTerminated', next);
            } else {
                next.error = next.error || next.lastDataLine;
                eventEmitter.emit('processError', next, next.error);
            }
            eventEmitter.emit('processDone', next);

            if (next.error !== undefined)
                exports.errCount++;
            else if (next.terminated)
                exports.killedCount++;
            else if (next.done)
                exports.successCount++;

            checkForIdle();
        }

        function onData(chunk) {
            hasSentData = true;

            chunk = chunk.toString().split('\n').splice(-2);
            if (chunk.length === 0) return;

            dataBuffer += chunk[0];

            if (chunk.length === 2) {
                next.lastDataLine = dataBuffer;
                dataBuffer = chunk[1];
            }

            eventEmitter.emit('processData', next, chunk);
        }

        next.terminate = () => {
            if (next.running()) {
                process.kill();
                return next.terminated = true;
            }
        };

        return true;
    }

    function checkForIdle() {
        if (!exports.terminating && !spawnNext() && !procs.some(x => !x.done)) {
            if (exports.finalized) {
                terminate();
            } else {
                eventEmitter.emit('idle');
            }
        }
    }

    function terminate(reason) {
        exports.terminating = true;

        for (const proc of procs) {
            if (proc.running)
                proc.terminate();
        }

        eventEmitter.emit('terminating');

        setTimeout(function () {
            eventEmitter.emit('terminated', {
                terminatedReason: reason,
                startedCount: exports.startedCount,
                errCount: exports.errCount,
                killedCount: exports.killedCount,
                successCount: exports.successCount
            });
        }, 100);
    }

    function startSims() {
        let cpusAvail = exports.cpuCount;
        for (const proc of procs)
            if (proc.running()) cpusAvail--;

        for (let x of new Array(cpusAvail).keys())
            setTimeout(spawnNext, (x+1) * 50);
    }

    const exports = {
        cpuCount: options.cpuCount || concurrency,
        startedCount: 0,
        errCount: 0,
        killedCount: 0,
        successCount: 0,
        terminating: false,
        finalized: false,
        terminate,
        addProc: (...args) => {
            addProc(...args);
            startSims();
        },
        finalize: () => {
            exports.finalized = true;
            checkForIdle();
        },
        on: (...args) => eventEmitter.on(...args)
    };

    if (options.printStatus) require('./add-terminal-status')(exports);

    addProc(initialProcs);
    startSims();

    return exports
};
