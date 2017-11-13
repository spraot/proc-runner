#!/usr/bin/env node

"use strict" ;

const spawn = require('child_process').spawn;
const term = require('terminal-kit').terminal;
const log = require('./log');
const proc_count = 10;
const concurrency = 4;
term.grabInput();

const procs = [];
let i = 0;
while (procs.length<proc_count) {
    const len = Math.random()*60+1;
    i++;
    procs.push({name: 'process_'+i, proc_length: len});
}

function spawnNext() {
    const next = procs.find(x => !x.started && !x.done);
    if (!next) return;

    next.process = spawn('./child.js', [next.proc_length.toFixed(0)], {stdio: 'pipe'});
    next.started = true;

    next.lineNo = log.curLine();
    log(next.name+': Started\n');

    let lastStatus = '';
    function setStatus(status) {
    	term.saveCursor();

    	const startAt = next.name.length+2;
        term.move(startAt,next.lineNo-log.curLine());
        process.stdout.write(status.slice(0,term.width-startAt));
        term.eraseLineAfter();
    	term.restoreCursor();
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
    		setStatus('Failed: '+lastStatus)
    	}

        next.done = true;
        next.exitCode = code;
        if (!spawnNext(_=>0) && !procs.some(x => !x.done)) {
            log('\nAll processes done\n');
            terminate();
        }
    });

    return next.process;
}

function terminate() {	
    term.grabInput(false);
    setTimeout( function() { process.exit() ; } , 100 );
}

term.on('key', function(name, matches, data) {	
	if (matches.indexOf('CTRL_C') >= 0) {
		terminate();
	}
});

// Start calculations
log(`Running ${proc_count} subprocesses...\n\n`);

for (let x of new Array(concurrency))
    setTimeout(spawnNext,x*100);
