#!/usr/bin/env node

const proc_count = 10;
const procs = [];
let i = 0;
while (procs.length<proc_count) {
    const len = Math.random()*60+1;
    i++;
    procs.push({
    	name: 'process_'+i, 
    	exec: './child.js', 
    	args: [len.toFixed(0)]});
}

require('./run')(procs, () => process.exit());