#!/usr/bin/env node

const spawn = require('child_process').spawn;
const term = require('terminal-kit').terminal;
const proc_count = 10;
const concurrency = 4;

const procs = [];
while (procs.length<proc_count) {
    const len = Math.random()*10;
    procs.push({name: 'process_length_'+len.toFixed(0), proc_length: len});
}

function spawnNext() {
    const next = procs.find(x => !x.started && !x.done);
    if (!next) return;

    next.process = spawn('./child.js', [next.proc_length.toFixed(0)], {stdio: 'pipe'});
    next.started = true;

    term.on('terminal', (name, data) => {
	    next.lineNo = data.y;
	    console.log(next.name);
	    console.log(next.name+' progress is on line no. '+next.lineNo);
    })
    //term.requestCursorLocation();

    let lastStatus = '';
    function setStatus(status) {
        console.log(next.name+': '+status);
    	//term.saveCursor();
        //term.moveTo(next.name.length+1,next.lineNo);
        //console.log(': '+status);
        //term.eraseLineAfter();
    	//term.restoreCursor();
    	lastStatus = status;
    }

    let output = '';
    next.process.stdout.on('data', (chunk) => {
    	chunk = chunk.toString().split('\n').splice(-2);
    	if (chunk.length === 0) return;

    	output += chunk[0];

    	if (chunk.length === 2) {
    		setStatus(output);
	    	output = chunk[1];
	    }	    
    });

    next.process.on('close', function (code) {
    	if (code===0) {
    		setStatus('Done!');
    	} else {
    		setStatus('Failed with error code '+code+' and message: '+lastStatus)
    	}

        next.done = true;
        next.exitCode = code;
        if (!spawnNext() && !procs.some(x => !x.done)) {
            console.log();
            console.log('All processes done')
            process.exit();
        }
    });

    return next.process;
}

console.log(`Running ${proc_count} subprocesses...`);
console.log();

for (let x of Array(concurrency))
	spawnNext();