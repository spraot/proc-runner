#!/usr/bin/env node

"use strict" ;

const EventEmitter = require('events');
const concurrency = require('os').cpus().length;
const child_process = require('child_process');
const startTimeout = 5000;
const procTimeout = 2*60*1000;

module.exports = (...args) => new ProcRunner(...args);

class ProcRunner extends EventEmitter {
    constructor(options) {
        super();
        options = options || {};
        this.cpuCount = options.cpuCount || concurrency;
        this.startedCount = 0;
        this.errCount = 0;
        this.killedCount = 0;
        this.successCount = 0;
        this.doneCount = 0;
        this.procs = [];
        if (options.printStatus) require('./add-terminal-status')(this);
    }

    addProc(newProc) {
        if (Array.isArray(newProc)) return newProc.forEach(x => this.addProc(x));

        const proc = {
            exec: newProc.exec,
            name: newProc.name || newProc.exec,
            args: newProc.args || [],
            inx: this.procs.length,
            toString: () => `[${proc.inx+1}] ${proc.name}`,
        };

        proc.ready = () => !this.terminating && !proc.started && !proc.done && !proc.terminated;
        proc.running = () => proc.started && !proc.done && !proc.terminated;
        proc.terminate = () => false;

        if (typeof (proc.exec) !== 'string')
            throw new Error(`Command for process ${proc.inx} (${proc.name}) is not a string/path`);

        this.procs.push(proc);
        this.startSims();
    }

    spawnNext() {
        if (this.startedCount-this.doneCount >= this.cpuCount) return;
        const next = this.procs.find(x => x.ready());
        if (!next) return;

        next.started = true;
        next.lastDataLine = '';
        this.startedCount++;
        let hasSentData = false;
        let dataBuffer = '';

        this.emit('processStarted', next);

        let process;
        try {
            process = child_process.spawn(next.exec, next.args, {stdio: 'pipe'});
            process.on('close', onClose.bind(this));
            process.on('error', onError.bind(this));
            process.stdout.on('data', onData.bind(this));
            process.stderr.on('data', onData.bind(this));
        } catch (e) {
            onData.bind(this)('Could not start - ' + e.message + '\n');
            onClose.bind(this)(1);
            return false;
        }

        setTimeout(() => {
            if (!hasSentData && !next.error && process.exitCode === null) {
                next.error = 'timed out waiting for response from ' + next.exec;
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

            if (dataBuffer) onData.bind(this)('\n');

            if (code === 0) {
                this.successCount++;
                this.emit('processSuccess', next);
            } else if (process && process.killed && !next.error) {
                this.killedCount++;
                this.emit('processTerminated', next);
            } else {
                this.errCount++;
                next.error = next.error || next.lastDataLine;
                this.emit('processError', next, next.error);
            }
            this.doneCount++;
            this.emit('processDone', next);

            this.checkForIdle();
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

            this.emit('processData', next, chunk);
        }

        next.terminate = () => {
            if (next.running()) {
                process.kill();
                return next.terminated = true;
            }
        };

        return true;
    }

    startSims() {
        let cpuAvail = this.cpuCount;
        for (const proc of this.procs)
            if (proc.running()) cpuAvail--;

        for (let x of new Array(cpuAvail).keys())
            setTimeout(this.spawnNext.bind(this), (x + 1) * 50);
    }

    terminate(reason) {
        this.terminating = true;
        this.emit('terminating');

        for (const proc of this.procs) {
            if (proc.running)
                proc.terminate();
        }

        this.emit('terminated', reason);
    };

    checkForIdle() {
        if (!this.terminating && !this.spawnNext() && !this.procs.some(x => !x.done)) {
            if (this.finalized) {
                this.terminate();
            } else {
                this.emit('idle');
            }
        }
    }

    finalize() {
        this.finalized = true;
        this.checkForIdle();
    }
}

class Proc {
    constructor() {

    }
}
