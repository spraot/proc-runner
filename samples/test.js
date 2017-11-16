#!/usr/bin/env node

const proc_count = 20;
const procs = [];
let i = 0;
while (procs.length<proc_count) {
    const len = Math.random()*2+4;
    i++;
    procs.push({
    	name: 'process_'+i,
    	exec: 'node',
    	args: ['./child.js', len.toFixed(0)]});
}

procs[1].args = undefined;

console.log(`Running ${procs.length} subprocesses...\n`);

const runner = require('../lib/runner')({printStatus: true});
runner.addProc(procs.slice(0,4));

runner.on('terminated', function(reason) {
    if (reason)
        console.log('\nBatch terminated: '+reason);
    else
        console.log('\nAll processes done');

    console.log(this.errCount + ' processes failed');
    console.log(this.killedCount + ' processes terminated');
    console.log(this.successCount + ' processes finished successfully');

    setTimeout(() => process.exit(), 100);
});

runner.on('processStarted', function(proc) {
    if (proc.inx === 3) {
        console.log('\nWaiting for first batch of processes to finish before adding more...\n')
    }
});

runner.once('idle', () => {
    runner._cpuCount = 2;
    runner.addProc(procs.slice(4));
    runner.finalize();
});
