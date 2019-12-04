#!/usr/bin/env node

"use strict" ;

const EventEmitter = require('events');
const statusHandler = require('./status-handler');
const concurrency = require('os').cpus().length;

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
        this._retry = this._processRetryOpt(options.retry);
        this._procs = [];
        this._Proc = require('./make-proc-class')(options);
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
            _this.emit('processStarted', this);
        });
        proc.on('error', function (error) {
            _this.errCount++;
            _this.emit('processError', this, error);
        });
        proc.on('terminated', function () {
            _this.killedCount++;
            _this.emit('processTerminated', this);
        });
        proc.on('success', function () {
            _this.successCount++;
            _this.emit('processSuccess', this);
        });
        proc.on('done', function () {
            _this.doneCount++;
            _this.emit('processDone', this);
            if (this.error && _this._checkRetry(this)) this.retry();
            _this._checkForIdle();
        });
        proc.on('data', function (chunk) {
            _this.emit('processData', this, chunk);
        });

        return proc;
    }

    _spawnNext() {
        if (this.terminating || this.startedCount-this.doneCount >= this._cpuCount) return false;
        const next = this._procs.find(x => x.ready());
        if (next) {
            next.spawn();
            return true;
        } else {
            return null;
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
        if (!this.terminating && this.doneCount === this.startedCount && !this._spawnNext()) {
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

    _processRetryOpt(retry) {
        if (Number.isInteger(retry)) {
            retry = {
                maxTries: retry+1
            }
        } else if (retry && typeof retry.test === 'function') {
            retry = {
                matcher: retry.test.bind(retry)
            }
        }

        return retry;
    }

    _checkRetry(proc) {
        if (!this._retry) return false;

        const maxTries = proc.maxTries !== undefined ? proc.maxTries : this._retry.maxTries;
        return (!this._retry.matcher || this._retry.matcher(proc.error))
            && (!maxTries || proc.tries < maxTries);
    }
}