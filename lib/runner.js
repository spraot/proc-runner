#!/usr/bin/env node

"use strict" ;

const EventEmitter = require('events');
const concurrency = require('os').cpus().length;
const child_process = require('child_process');
const statusHandler = require('./status-handler');
const defaultStartTimeout = 0;
const defaultTimeout = 0;

module.exports = (...args) => new ProcRunner(...args);

class ProcRunner extends EventEmitter {
    constructor(options) {
        super();
        options = options || {};
        this._cpuCount = options.cpuCount || concurrency - 1;
        this.startedCount = 0;
        this.errCount = 0;
        this.killedCount = 0;
        this.successCount = 0;
        this.doneCount = 0;
        this._procs = [];
        this._Proc = makeProcClass(options);
        if (options.printStatus) statusHandler(this);

        this.addProc = this.add; // deprecated alias
    }

    get cpuCount() {
        return this._cpuCount;
    }

    set cpuCount(cpuCount) {
        this._cpuCount = Math.min(Math.max(0, cpuCount), concurrency);
        this._startSims();
    }

    add(newProcs) {
        if (!Array.isArray(newProcs)) newProcs = [newProcs];

        for (const newProc of newProcs) {
            this._procs.push(this._processProc(newProc));
        }
        this._startSims();
    }

    prepend(newProcs) {
        if (!Array.isArray(newProcs))
            newProcs = [newProcs];
        else
            newProcs = newProcs.slice();

        newProcs = newProcs.map((newProc) => this._processProc(newProc));
        this._procs.unshift(...newProcs);

        this._startSims();
    }

    _processProc(newProc) {
        const _this = this;

        // Add index and create Proc object:
        const proc = new this._Proc(newProc);

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
            _this._checkForIdle();
        });
        proc.on('data', function (chunk) {
            _this.emit('processData', this, chunk);
        });

        return proc;
    }

    _spawnNext() {
        if (this.terminating || this.startedCount-this.doneCount >= this._cpuCount) return;
        const next = this._procs.find(x => x.ready());
        if (next) {
            next.spawn();
            return true;
        }
    }

    _startSims() {
        while (this._spawnNext()) {}
    }

    terminate(reason) {
        this.terminating = true;
        this.emit('terminating');

        for (const proc of this._procs)
            proc.terminate();

        // We need to delay this signal to be sure that our processes have stopped
        setTimeout(() => this.emit('terminated', reason), 100);
    };

    _checkForIdle() {
        if (!this.terminating && !this._spawnNext() && this.doneCount === this._procs.length) {
            if (this.finalized) {
                this.terminate();
            } else {
                this.emit('idle');
            }
        }
    }

    finalize() {
        this.finalized = true;
        this._checkForIdle();
    }
}

function makeProcClass(options) {
    let inx = 0;

    function getFirstDefined(...args) {
        for (const x of args) {
            if (x !== undefined)
                return x;
        }
    }

    class Proc extends EventEmitter {
        constructor(data) {
            super();

            // process setup:
            this.exec = data.exec;
            this.name = data.name || data.exec;
            this.args = data.args || [];
            this._timeout = getFirstDefined(data.timeout, options.timeout, defaultTimeout);
            this._startTimeout = getFirstDefined(data.startTimeout, options.startTimeout, defaultStartTimeout);

            // initial values:
            this._lastDataLine = '';
            this._lastNonEmptyDataLine = '';
            this._hasSentData = false;
            this._dataBuffer = '';

            if (typeof (this.exec) !== 'string')
                throw new Error(`Command for process ${this} is not a string/path`);

            if (data.onStarted) this.on('started', data.onStarted);
            if (data.onDone) this.on('done', data.onDone);
            if (data.onError) this.on('error', data.onError);
            if (data.onTerminated) this.on('terminated', data.onTerminated);
            if (data.onSuccess) this.on('success', data.onSuccess);
            if (data.onData) this.on('data', data.onData);
        }

        spawn() {
            this.started = true;
            this.inx = inx++;
            this.emit('started');

            try {
                this._process = child_process.spawn(this.exec, this.args, {stdio: 'pipe'});
                this._process.on('close', (...args) => this._onClose(...args));
                this._process.on('exit', (...args) => this._onClose(...args));
                this._process.on('error', (...args) => this._onError(...args));
                this._process.stdout.on('data', (...args) => this._onData(...args));
                this._process.stderr.on('data', (...args) => this._onData(...args));
            } catch (e) {
                this._onData('Could not start - ' + e.message + '\n');
                this._onClose(1);
                return false;
            }

            if (this._startTimeout)
                setTimeout(() => {
                    if (!this._hasSentData && !this.done) {
                        this.error = 'timed out waiting for response from ' + this.exec;
                        this.terminate();
                    }
                }, this._startTimeout);

            if (this._timeout)
                setTimeout(() => {
                    if (this.running()) {
                        this.error = 'process timed out';
                        this.terminate();
                    }
                }, this._timeout);
        }

        _onError(err) {
            this._onData(err);
            this._onClose(null);
        }

        _onClose(code) {
            if (code !== null)
                this.exitCode = code;
            if (this.done)
                return;

            this.done = true;

            if (this._dataBuffer) this._onData('\n');

            if (code === 0) {
                this.emit('success');
            } else if ((this._process && this._process.killed || this.terminated) && !this.error) {
                this.emit('terminated');
            } else {
                this.error = this.error || this._lastNonEmptyDataLine;
                this.emit('error', this.error);
            }
            this.emit('done');
            this._process = null;
        }

        _onData(chunk) {
            this._hasSentData = true;

            const lines = chunk.toString().split('\n');

            this._dataBuffer += lines.shift();

            while (lines.length > 0) {
                this._lastDataLine = this._dataBuffer;
                if (this._lastDataLine.trim()) {
                    this._lastNonEmptyDataLine = this._lastDataLine;
                }

                this._dataBuffer = lines.shift();
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
                this._process.kill();
                return this.terminated = true;
            } else {
                return false;
            }
        }
    }

    return Proc;
}
