#!/usr/bin/env node

const proc_count = 10;
const procs = [];
let i = 0;
while (procs.length<proc_count) {
    const len = Math.random()*3+2;
    i++;
    procs.push({
    	name: 'process_'+i,
    	exec: 'node',
    	args: ['./child.js', len.toFixed(0)]});
}

procs[1].args = undefined;

console.log(`Running ${procs.length} subprocesses...\n`);

const runner = require('../lib/runner')({printStatus: true, startTimeout: 1000, retry: /.*random.*/});
runner.addProc(procs.splice(0,4));

runner.on('terminated', function(reason) {
    if (reason)
        console.log('\nBatch terminated: '+reason);
    else
        console.log('\nAll processes done');

    console.log(`${this.successCount} of ${runner._procs.length} processes finished successfully in ${runner.startedCount} attempts`);
    console.log(this.killedCount + ' attempts terminated');
    console.log(this.errCount + ' attempts failed');

    setTimeout(() => process.exit(), 100);
});

runner.on('processStarted', function(proc) {
    if (proc.inx === 3 && (!proc.tries || proc.tries === 1)) {
        console.log('\nWaiting for first batch of processes to finish before adding more...\n')
    }
});

runner.once('idle', () => {
    runner.cpuCount = 2;
    runner.addProc(procs.splice(0));
    runner.finalize();
});
