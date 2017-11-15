
const assert = require('assert');
const mockSpawn = require('mock-spawn');

const procs = [...(new Array(4).keys())].map(i => ({name: 'process_'+(i+1), exec: 'node', args: [i]}));

describe('runner', function() {

    let mySpawn, ProcRunner;

    beforeEach(() => {
        mySpawn = mockSpawn();
        mySpawn.setDefault(mySpawn.simple(0));
        require('child_process').spawn = mySpawn;
        ProcRunner = require('../run');
    });

    describe('basic example', function() {
        it('should call subprocesses and emit events correctly', function(done) {
            const runner = ProcRunner(procs);
            let doneCount = 0;
            let successCount = 0;
            runner.on('processDone', () => {doneCount++});
            runner.on('processSuccess', () => {successCount++});
            runner.on('terminated', (data) => {
                assert.equal(data.successCount, procs.length);
                assert.equal(mySpawn.calls.length, procs.length);
                assert.equal(doneCount, procs.length);
                assert.equal(successCount, procs.length);
                assert.equal(mySpawn.calls[0].command, procs[0].exec);
                done();
            });
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

            const runner = ProcRunner(procs);

            let errorCount = 0;
            let doneCount = 0;
            let successCount = 0;
            runner.on('processError', (_, err) => {
                errorCount++;
                if (_.inx === 3)
                    assert.equal(err, 'Could not start - '+errMsg, 'process '+_.inx);
                else
                    assert.equal(err, errMsg, 'process '+_.inx);
            });
            runner.on('processDone', () => {doneCount++});
            runner.on('processSuccess', () => {successCount++});
            runner.on('terminated', (data) => {
                assert.equal(data.successCount, procs.length-3);
                assert.equal(mySpawn.calls.length, procs.length);
                assert.equal(doneCount, procs.length);
                assert.equal(errorCount, 3);
                assert.equal(successCount, procs.length-3);
                done();
            });
            runner.finalize();
        });

        it('should handle calling errors correctly', function(done) {
            // Set first exec to undefined:
            const badproc = Object.assign({},procs[0],{exec: undefined});

            assert.throws(() => ProcRunner(badproc));

            done();
        });
    });
});
