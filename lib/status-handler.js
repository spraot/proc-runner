const throttle = require('lodash.throttle');

module.exports = function(runner) {
    const term_ctrl = require('./terminal-handler')();

    const statusLines = new Map();

    function setStatus(proc, status) {
        if (statusLines[proc]) {
            statusLines[proc](`${proc}: ${status}`);
        }
    }

    const throttledDataFn = throttle(proc => setStatus(proc, proc._lastDataLine), 50);
    runner.on('processStarted', proc => {
        statusLines[proc] = term_ctrl.createStatusLine();
        setStatus(proc, 'Started');
    });
    runner.on('processData', throttledDataFn);
    runner.on('processSuccess', proc => setStatus(proc, 'Done!'));
    runner.on('processTerminated', proc => setStatus(proc, 'Terminated'));
    runner.on('processError', (proc, error) => setStatus(proc, 'Failed: ' + error));
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
