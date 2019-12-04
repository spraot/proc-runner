const throttle = require('lodash.throttle');
const termHandler = require('./terminal-handler');

module.exports = function(runner) {
    const term_ctrl = termHandler();
    const isTTY = process.stdout.isTTY;

    const statusLines = new Map();

    const setStatus = !isTTY ?
        (proc, status) => console.log(`${proc}: ${status}`) :
        (proc, status, isFinal) => {
            if (statusLines[proc]) {
                statusLines[proc](`${proc}: ${status}`);
            }
            if (isFinal) {
                statusLines[proc] = undefined;
            }
        };

    const throttledDataFn = throttle(proc => setStatus(proc, proc._lastNonEmptyDataLine), isTTY ? 50 : 5000);
    runner.on('processStarted', proc => {
        if (isTTY) statusLines[proc] = term_ctrl.createStatusLine();
        setStatus(proc, 'Started');
    });
    runner.on('processSuccess', proc => setStatus(proc, 'Done!', true));
    runner.on('processTerminated', proc => setStatus(proc, 'Terminated', true));
    runner.on('processError', (proc, error) => setStatus(proc, 'Failed: ' + error, true));

    runner.on('processData', throttledDataFn);
    runner.on('processDone', () => throttledDataFn.cancel());

    term_ctrl.onCtrlC(() => runner.terminate('Ctrl-C pressed, stopping all processes...'));
    runner.prependListener('terminated', () => term_ctrl.restore());

    term_ctrl.onKey('CTRL_UP', () => {
        runner.cpuCount = runner.cpuCount + 1;
        console.log('Concurrent processes: '+runner.cpuCount);
    });
    term_ctrl.onKey('CTRL_DOWN', () => {
        runner.cpuCount = runner.cpuCount - 1;
        console.log('Concurrent processes: '+runner.cpuCount);
    });
    console.log('Press Ctrl-Up or Ctrl-Down to change the number of concurrent processes')
};
