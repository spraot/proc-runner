#!/usr/bin/env node

const proc_count = 1000;
console.log(`Running ${proc_count} subprocesses...\n`);

const runner = require('../lib/runner')({printStatus: true});
for (const i of [...Array(proc_count).keys()]) {
    runner.addProc({
        name: 'long running',
        exec: 'node',
        args: ['-e', "console.log('started'); rem = Math.random()*20; setInterval(() => {(rem=rem-0.5)>0 || console.log('done proc "+(i+1)+"') || process.exit(); console.log('Remaining: '+rem.toFixed(1)+'s')}, 500);"]
    });
}

runner.on('terminated', function(reason) {
    if (reason)
        console.log('\nBatch terminated: '+reason);
    else
        console.log('\nAll processes done');

    console.log(this.errCount + ' processes failed');
    console.log(this.killedCount + ' processes terminated');
    console.log(this.successCount + ' processes finished successfully');

    process.exit();
});

runner.finalize();