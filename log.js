#!/usr/bin/env node

const term = require('terminal-kit').terminal;

function hook_stdout(callback) {
    let old_write = process.stdout.write;

    process.stdout.write = (function (write) {
        return function (string, encoding, fd) {
            write.apply(process.stdout, arguments);
            callback(string, encoding, fd)
        }
    })(process.stdout.write);

    return () => process.stdout.write = old_write;
}

module.exports = function() {
    term.grabInput();
    const unhook = hook_stdout(count_lines);

    let curLine = 1;
    let curCol = 1;
    let cursorMoved = false;

    function count_lines(txt) {
        if (cursorMoved) return;

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
    }

    const exports = {};
    exports.curLine = () => curLine;
    exports.curCol = () => curCol;
    exports.restore = () => {
        term.grabInput(false);
        unhook();
    };
    exports.logTruncated = txt => {
        console.log(txt.split('\n').map((x, i) => x.slice(0, term.width - (i === 0 ? curCol - 1 : 0))).join('\n'));
    };

    exports.createStatusLine = (initialTxt) => {
        if (curCol !== 1) console.log();
        const lineNo = curLine;
        console.log();
        const updateStatus = (txt) => {
            // Get status text
            if (txt === undefined && updateStatus.toString)
                txt = updateStatus;
            else
                updateStatus.toString = () => txt;

            txt = txt.toString().replace(/\n/g,'');

            // Move cursor
            cursorMoved = true;
            term.saveCursor();
            term.previousLine(curLine - lineNo);

            // Set text (truncate to console width)
            process.stdout.write(txt.slice(0, term.width));
            term.eraseLineAfter();

            // Move cursor back
            term.restoreCursor();
            cursorMoved = false;
        };
        if (initialTxt) updateStatus(initialTxt);

        term.on('resize', () => updateStatus(updateStatus));

        return updateStatus;
    };

    exports.onCtrlC = (callback) => {
        term.on('key', function (name, matches, data) {
            if (matches.indexOf('CTRL_C') >= 0) {
                callback();
            }
        });
    };

    return exports;
};
