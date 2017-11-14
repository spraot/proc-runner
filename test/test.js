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
const runner = require('../run')(procs.slice(0,4), (err) => {
    if (err) {
        console.log('Process runner failed with error: '+err);
    } else {
        if (!runner.terminating)
            console.log('\nAll processes done');
        console.log(runner.errCount + ' processes failed');
        console.log(runner.killedCount + ' processes terminated');
        console.log(runner.doneCount + ' processes finished successfully');
    }
    process.exit();
});

setTimeout(() => console.log('\nWaiting for first batch of processes to finish...\n'), 5000);

setTimeout(() => {
    runner.addProc(procs.slice(4));
    runner.finalize();
}, 15000);