#!/usr/bin/env node

const term = require('terminal-kit').terminal;

module.exports = function() {
    log.curLine = () => curLine;
    log.curCol = () => curCol;

    let curLine = 1;
    let curCol = 1;

    function log(txt, wrap) {
        if (wrap === undefined) wrap = true;
        if (!wrap) txt = txt.split('\n').map((x, i) => x.slice(0, term.width - (i === 0 ? curCol - 1 : 0))).join('\n');

        const lines = txt.split('\n').map(x => x.length);

        curCol += lines[0];
        const wrapCount = Math.max(0, Math.ceil((curCol-1) / term.width) - 1);
        curLine += wrapCount;
        curCol -= wrapCount * term.width;

        for (const line of lines.slice(1))
            curLine += Math.floor(line / term.width) + 1;

        if (lines.length > 1) {
            curCol = 1;
            curCol += lines.slice(-1)[0];
        }

        process.stdout.write(txt);
    }

    log.writeLoc = () => log(`Cursor location = ${curLine}:${curCol}\n`);

    return log;
};

// const log = module.exports();
// log.writeLoc();
// log('\ntest\n');
// log.writeLoc();
// log('Note: The message goes through JSON serialization and parsing. The resulting message might not be the same as what is originally sent. See notes in the JSON.stringify() specification.\n');
// log.writeLoc();
// log('Note: The message goes through JSON serialization and parsing. The resulting message might not be the same as what is originally sent. See notes in the JSON.stringify() specification.\n', false);
// log.writeLoc();
// log('\n\ntest\n\n');
// log.writeLoc();
// log('Note: The message goes through JSON serialization and parsin\n');
// log.writeLoc();
// log('Note: The message goes through JSON serialization and parsing\n');
// log.writeLoc();
// log('Note: The message goes through JSON serialization and parsings\n');
// log.writeLoc();
// log('Note: The message goes through JSON serialization and parsingNote: The message goes through JSON serialization and parsin\n');
// log.writeLoc();
// log('Note: The message goes through JSON serialization and parsingNote: The message goes through JSON serialization and parsing\n');
// log.writeLoc();
// log('Note: The message goes through JSON serialization and parsingNote: The message goes through JSON serialization and parsings\n');
// log.writeLoc();