#!/usr/bin/env node

"use strict" ;

const EventEmitter = require('events');
const spawn = require('child_process').spawn;
const concurrency = require('os').cpus().length;
const startTimeout = 5000;
const procTimeout = 2*60*1000;

module.exports = function(initialProcs, options) {
    options = options || {};
    const term_ctrl = require('./log')();
    const eventEmitter = new EventEmitter();
    const procs = [];

    function addProc(newProc) {
        if (Array.isArray(newProc)) return newProc.forEach(addProc);

        const proc = {
            exec: newProc.exec,
            name: newProc.name || newProc.exec,
            args: newProc.args || [],
            inx: procs.length+1
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
        exports.startedCount++;
        let lastStatus = '';
        let stdoutBuffer = '';

        const statusLine = term_ctrl.createStatusLine();
        setStatus('Started');
        eventEmitter.emit('processStarted', next);

        let process;
        try {
            process = spawn(next.exec, next.args, {stdio: 'pipe'});
            process.on('close', onClose);
            process.on('error', onError);
            process.stdout.on('data', onData);
        } catch (e) {
            next.done = true;
            onError(e);
            onClose(1);
        }

        setTimeout(() => {
            if (lastStatus === 'Started') {
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

        function setStatus(status) {
            lastStatus = status;
            statusLine(`[${next.inx}] ${next.name}: ${status}`);
        }

        function onError(err) {
            setStatus('Could not start - '+err.message);
        }

        function onClose(code) {
            next.done = true;
            next.exitCode = code;

            if (code === 0) {
                setStatus('Done!');
                eventEmitter.emit('processDone', next);
            } else if (process.killed && !next.error) {
                setStatus('Terminated');
                eventEmitter.emit('processTerminated', next);
            } else {
                next.error = next.error || lastStatus;
                setStatus('Failed: ' + next.error);
                eventEmitter.emit('processError', next, next.error);
            }

            if (next.error !== undefined)
                exports.errCount++;
            else if (next.terminated)
                exports.killedCount++;
            else if (next.done)
                exports.doneCount++;

            if (!exports.terminating && !spawnNext() && !procs.some(x => !x.done)) {
                eventEmitter.emit('idle', next);
                if (exports.finalized) {
                    terminate();
                }
            }
        }

        function onData(chunk) {
            chunk = chunk.toString().split('\n').splice(-2);
            if (chunk.length === 0) return;

            stdoutBuffer += chunk[0];

            if (chunk.length === 2) {
                setStatus(stdoutBuffer);
                stdoutBuffer = chunk[1];
            }
        }

        next.terminate = () => {
            if (next.running()) {
                process.kill();
                return next.terminated = true;
            }
        };

        return true;
    }

    function terminate(reason) {
        exports.terminating = true;

        for (const proc of procs) {
            if (proc.running)
                proc.terminate();
        }

        term_ctrl.restore();

        setTimeout(function () {
            eventEmitter.emit('terminated', {
                terminatedReason: reason,
                startedCount: exports.startedCount,
                errCount: exports.errCount,
                killedCount: exports.killedCount,
                doneCount: exports.doneCount
            });
        }, 100);
    }

    term_ctrl.onCtrlC(() => terminate('Ctrl-C pressed, stopping all processes...'));

    function startSims() {
        let cpusAvail = exports.cpuCount;
        for (const proc of procs)
            if (proc.running()) cpusAvail--;

        for (let x of new Array(cpusAvail).keys())
            setTimeout(spawnNext, x * 100);
    }

    const exports = {
        cpuCount: options.cpuCount || concurrency,
        startedCount: 0,
        errCount: 0,
        killedCount: 0,
        doneCount: 0,
        terminating: false,
        finalized: false,
        terminate,
        addProc: (...args) => {
            addProc(...args);
            startSims();
        },
        finalize: () => exports.finalized = true,
        on: (...args) => eventEmitter.on(...args)
    };

    addProc(initialProcs);
    startSims();

    return exports
};
