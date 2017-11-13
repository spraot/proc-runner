#!/usr/bin/env node

const term = require('terminal-kit').terminal;

module.exports = log;
module.exports.curLine = () => curLine;
module.exports.curCol = () => curCol;

let curLine = 1;
let curCol = 1;
function log(txt, wrap) {
    if (wrap === undefined) wrap = true;
    if (!wrap) txt = txt.split('\n').map((x,i)=>x.slice(0,term.width - (i===0 ? curCol-1 : 0))).join('\n');

    const lines = txt.split('\n').map(x=>x.length);

    curCol += lines[0];
    const wrapCount = Math.ceil((curCol-1)/term.width)-1;
    curLine += wrapCount;
    curCol -= wrapCount*term.width;

    for (const line of lines.slice(1))
        curLine += Math.floor(line/term.width)+1;

    if (lines.length > 1) {
        curCol = 1;
        curCol += lines.slice(-1)[0];
    }

    process.stdout.write(txt);
}

const writeLoc = () => log(`Cursor location = ${curLine}:${curCol}\n`);