
const assert = require('assert');
const mockSpawn = require('mock-spawn');

const procs = [...(new Array(4).keys())].map(i => ({name: 'process_'+(i+1), exec: 'node', args: [i]}));

describe('runner', function() {

    let mySpawn, procRunner;

    beforeEach(() => {
        mySpawn = mockSpawn();
        mySpawn.setDefault(mySpawn.simple(0));
        require('child_process').spawn = mySpawn;
        procRunner = require('../run');
    });

    it('should call subprocesses and emit events correctly', function(done) {
        const runner = procRunner();

        let doneCount = 0;
        let successCount = 0;
        runner.on('processDone', () => {doneCount++});
        runner.on('processSuccess', () => {successCount++});
        runner.on('terminated', function() {
            assert.equal(mySpawn.calls.length, procs.length);
            assert.equal(this.successCount, procs.length);
            assert.equal(doneCount, procs.length);
            assert.equal(successCount, procs.length);
            assert.equal(mySpawn.calls[0].command, procs[0].exec);
            done();
        });

        runner.addProc(procs);
        runner.finalize();
    });

    it('should terminate processes correctly', function(done) {
        mySpawn.sequence.add(function (cb) {
            setTimeout(() => cb(1), 100000);
        });
        mySpawn.sequence.add(function (cb) {
            setTimeout(() => cb(0), 100000);
        });
        mySpawn.setSignals({SIGTERM: true});

        const runner = procRunner();
        let errorCount = 0;
        let doneCount = 0;
        let successCount = 0;
        let terminatedCount = 0;
        runner.on('processDone', () => {doneCount++});
        runner.on('processError', () => {errorCount++});
        runner.on('processTerminated', () => {terminatedCount++});
        runner.on('processSuccess', () => {successCount++});
        runner.on('terminated', function() {
            assert.equal(mySpawn.calls.length, procs.length);
            assert.equal(doneCount, procs.length);
            assert.equal(successCount, procs.length-2);
            assert.equal(terminatedCount, 2);
            assert.equal(errorCount, 0);
            assert.equal(mySpawn.calls[0].command, procs[0].exec);
            done();
        });
        setTimeout(() => runner.terminate(), 100);

        runner.addProc(procs);
        runner.finalize();
    });

    it('should call handle subprocess errors correctly', function(done) {
        const errMsg = 'an error message';
        mySpawn.sequence.add(function (cb) {
            this.stdout.write(errMsg+'\n');
            setTimeout(() => cb(1), 100);
        });
        mySpawn.sequence.add(function (cb) {
            this.stdout.write(errMsg);
            setTimeout(() => cb(1), 100);
        });
        mySpawn.sequence.add({throws:new Error(errMsg)});

        const runner = procRunner();

        let errorCount = 0;
        let doneCount = 0;
        let successCount = 0;
        runner.on('processError', (_, err) => {
            errorCount++;
            if (_.inx === 2)
                assert.equal(err, 'Could not start - '+errMsg, 'process '+_.inx);
            else
                assert.equal(err, errMsg, 'process '+_.inx);
        });
        runner.on('processDone', () => {doneCount++});
        runner.on('processSuccess', () => {successCount++});
        runner.on('terminated', function() {
            assert.equal(this.successCount, procs.length-3);
            assert.equal(mySpawn.calls.length, procs.length);
            assert.equal(doneCount, procs.length);
            assert.equal(errorCount, 3);
            assert.equal(successCount, procs.length-3);
            done();
        });

        runner.addProc(procs);
        runner.finalize();
    });

    it('should handle calling errors correctly', function(done) {
        // Set first exec to undefined:
        const badproc = Object.assign({},procs[0],{exec: undefined});

        const runner = procRunner();
        assert.throws(() => runner.addProc(badproc));

        done();
    });

    it('should handle timeouts correctly', function(done) {
        const runner = procRunner();

        mySpawn.setSignals({SIGTERM: true});
        mySpawn.sequence.add(function (cb) {
            setTimeout(() => cb(0), 1000);
        });
        mySpawn.sequence.add(function (cb) {
            setTimeout(() => cb(0), 1000);
        });

        let errorCount = 0;
        runner.on('processError', (_, err) => {
            errorCount++;

            if (_.inx === 0)
                assert.equal(err, 'process timed out');
            else if (_.inx === 1)
                assert.equal(err, 'timed out waiting for response from '+procs[0].exec);
        });
        runner.on('terminated', function() {
            assert.equal(errorCount, 2);
            done();
        });

        runner.addProc(Object.assign({},procs[0],{timeout: 100}));
        runner.addProc(Object.assign({},procs[0],{startTimeout: 100}));
        runner.finalize();
    });
});
