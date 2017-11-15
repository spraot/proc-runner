#!/usr/bin/env node

const proc_count = 6;
const procs = [];
let i = 0;
while (procs.length<proc_count) {
    const len = Math.random()*20+10;
    i++;
    procs.push({
    	name: 'process_'+i,
    	exec: 'node',
    	args: ['./child.js', len.toFixed(0)]});
}

procs[1].args = undefined;

console.log(`Running ${procs.length} subprocesses...\n`);

const runner = require('../run')(procs.slice(0,4));

runner.on('terminated', (data) => {
    if (data.terminatedReason)
        console.log('\nBatch terminated: '+data.terminatedReason);
    else
        console.log('\nAll processes done');

    console.log(data.errCount + ' processes failed');
    console.log(data.killedCount + ' processes terminated');
    console.log(data.successCount + ' processes finished successfully');

    process.exit();
});

setTimeout(() => console.log('\nWaiting for first batch of processes to finish...\n'), 5000);

setTimeout(() => {
    runner.addProc(procs.slice(4));
    runner.finalize();
}, 15000);
