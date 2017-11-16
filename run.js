#!/usr/bin/env node

"use strict" ;

const EventEmitter = require('events');
const concurrency = require('os').cpus().length;
const child_process = require('child_process');
const defaultStartTimeout = 5000;
const defaultTimeout = 2*60*1000;

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
        this.Proc = makeProcClass(options);
        if (options.printStatus) require('./add-terminal-status')(this);
    }

    addProc(newProcs) {
        const _this = this;
        if (!Array.isArray(newProcs)) newProcs = [newProcs];

        for (const newProc of newProcs) {
            // Add index and create Proc object:
            const proc = new this.Proc(newProc);

            // Add listeners:
            proc.on('started', function () {
                _this.startedCount++;
                _this.emit('processStarted', this)
            });
            proc.on('error', function (error) {
                _this.errCount++;
                _this.emit('processError', this, error)
            });
            proc.on('terminated', function () {
                _this.killedCount++;
                _this.emit('processTerminated', this)
            });
            proc.on('success', function () {
                _this.successCount++;
                _this.emit('processSuccess', this)
            });
            proc.on('done', function () {
                _this.doneCount++;
                _this.emit('processDone', this);
                _this.checkForIdle();
            });
            proc.on('data', function (chunk) {
                _this.emit('processData', this, chunk);
            });

            this.procs.push(proc);
        }
        this.startSims();
    }

    spawnNext() {
        if (this.terminating || this.startedCount-this.doneCount >= this.cpuCount) return;
        const next = this.procs.find(x => x.ready());
        if (next) {
            next.spawn();
            return true;
        }
    }

    startSims() {
        while (this.spawnNext()) {}
    }

    terminate(reason) {
        this.terminating = true;
        this.emit('terminating');

        for (const proc of this.procs)
            proc.terminate();

        // We need to delay this signal to be sure that our processes have stopped
        setTimeout(() => this.emit('terminated', reason), 100);
    };

    checkForIdle() {
        if (!this.terminating && !this.spawnNext() && this.doneCount === this.procs.length) {
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

function makeProcClass(options) {
    let inx = 0;

    class Proc extends EventEmitter {
        constructor(data) {
            super();

            // process setup:
            this.inx = inx++;
            this.exec = data.exec;
            this.name = data.name || data.exec;
            this.args = data.args || [];
            this.timeout = data.timeout || options.timeout || defaultTimeout;
            this.startTimeout = data.startTimeout || options.startTimeout || defaultStartTimeout;

            // initial values:
            this.lastDataLine = '';
            this.hasSentData = false;
            this.dataBuffer = '';

            if (typeof (this.exec) !== 'string')
                throw new Error(`Command for process ${this} is not a string/path`);
        }

        spawn() {
            this.started = true;

            try {
                this.process = child_process.spawn(this.exec, this.args, {stdio: 'pipe'});
                this.process.on('close', (...args) => this.onClose(...args));
                this.process.on('error', (...args) => this.onError(...args));
                this.process.stdout.on('data', (...args) => this.onData(...args));
                this.process.stderr.on('data', (...args) => this.onData(...args));
            } catch (e) {
                this.onData('Could not start - ' + e.message + '\n');
                this.onClose(1);
                return false;
            }

            setTimeout(() => {
                if (!this.hasSentData && !this.done) {
                    this.error = 'timed out waiting for response from ' + this.exec;
                    this.terminate();
                }
            }, this.startTimeout);

            setTimeout(() => {
                if (this.running()) {
                    this.error = 'process timed out';
                    this.terminate();
                }
            }, this.timeout);

            this.emit('started');
        }

        onError(err) {
            this.onData(err);
            this.onClose(null);
        }

        onClose(code) {
            if (code !== null)
                this.exitCode = code;
            if (this.done)
                return;

            this.done = true;

            if (this.dataBuffer) this.onData('\n');

            if (code === 0) {
                this.emit('success');
            } else if ((this.process && this.process.killed || this.terminated) && !this.error) {
                this.emit('terminated');
            } else {
                this.error = this.error || this.lastDataLine;
                this.emit('error', this.error);
            }
            this.emit('done');
            this.process = null;
        }

        onData(chunk) {
            this.hasSentData = true;

            chunk = chunk.toString().split('\n').splice(-2);
            if (chunk.length === 0) return;

            this.dataBuffer += chunk[0];

            if (chunk.length === 2) {
                this.lastDataLine = this.dataBuffer;
                this.dataBuffer = chunk[1];
            }

            this.emit('data', this, chunk);
        }

        toString() {
            return `[${this.inx + 1}] ${this.name}`;
        }

        ready() {
            return !this.started && !this.done && !this.terminated;
        }

        running() {
            return this.started && !this.done && !this.terminated;
        }

        terminate() {
            if (this.running()) {
                this.process.kill();
                return this.terminated = true;
            } else {
                return false;
            }
        }
    }

    return Proc;
}