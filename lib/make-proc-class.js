
const EventEmitter = require('events');
const child_process = require('child_process');
const defaultStartTimeout = 0;
const defaultTimeout = 0;

module.exports = makeProcClass;

function makeProcClass(options) {
    let inx = 0;

    const _defaultTimeout = getFirstDefined(options.timeout, defaultTimeout);
    const _defaultStartTimeout = getFirstDefined(options.startTimeout, defaultStartTimeout);

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
            this._timeout = getFirstDefined(data.timeout, _defaultTimeout);
            this._startTimeout = getFirstDefined(data.startTimeout, _defaultStartTimeout);
            this._maxRetries = data.maxRetries;

            // initial values:
            this._reset();
            this.tries = 0;

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
            if (this.inx === undefined) this.inx = inx++;
            this.started = true;
            this.tries++;
            this.emit('started');

            try {
                this._process = child_process.spawn(this.exec, this.args, {stdio: 'pipe'});
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
                this._startTimeoutHandle = setTimeout(() => {
                    this.error = 'timed out waiting for response from ' + this.exec;
                    this.terminate();
                }, this._startTimeout);

            if (this._timeout)
                this._timeoutHandle = setTimeout(() => {
                    if (this.running()) {
                        this.error = 'process timed out';
                        this.terminate();
                    }
                }, this._timeout);
        }

        _onError(err) {
            // this._onData(err);
            this._onClose(null);
        }

        _onClose(code) {
            if (code !== null)
                this.exitCode = code;
            if (this.done)
                return;

            this.done = true;
            clearTimeout(this._startTimeoutHandle);
            clearTimeout(this._timeoutHandle);

            if (this._dataBuffer) this._onData('\n');

            if (code === 0) {
                this.emit('success');
            } else if ((this._process && this._process.killed || this.terminated) && !this.error) {
                this.emit('terminated');
            } else {
                this.error = this.error || this._lastErrorLine || this._lastNonEmptyDataLine;
                this.emit('error', this.error);
            }
            this.emit('done');
            this._process = null;
        }

        _onData(chunk) {
            this._hasSentData = true;
            clearTimeout(this._startTimeoutHandle);

            const lines = chunk.toString().split('\n');

            this._dataBuffer += lines.shift();

            while (lines.length > 0) {
                this._lastDataLine = this._dataBuffer;
                if (this._lastDataLine.trim()) {
                    this._lastNonEmptyDataLine = this._lastDataLine;

                    const s = this._lastNonEmptyDataLine.toUpperCase();
                    if (s.startsWith('[ERROR]')) {
                        this._lastErrorLine = this._lastNonEmptyDataLine.slice(7).trim();
                    }
                    if (s.startsWith('ERROR:')) {
                        this._lastErrorLine = this._lastNonEmptyDataLine.slice(6).trim();
                    }
                }

                this._dataBuffer = lines.shift();
            }

            this.emit('data', this, chunk);
        }

        toString() {
            return `[${this.inx + 1}-${this.tries}] ${this.name}`;
        }

        ready() {
            return !this.started && !this.done && !this.terminated;
        }

        retry() {
            this._reset();
        }

        _reset() {
            if (this.running()) {
                throw new Error(`Attempted to reset proc ${this.inx+1}, but it is already running`);
            } else {
                this.started = false;
                this.done = false;
                this.terminated = false;
                this.errorFromPreviousRun = this.error;
                delete this.error;

                this._lastDataLine = '';
                this._lastErrorLine = null;
                this._lastNonEmptyDataLine = '';
                this._hasSentData = false;
                this._dataBuffer = '';
            }
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
