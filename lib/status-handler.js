const throttle = require('lodash.throttle');

module.exports = function(runner) {
    const term_ctrl = require('./terminal-handler')();

    const statusLines = new Map();

    function setStatus(proc, status) {
        if (statusLines[proc]) {
            statusLines[proc](`${proc}: ${status}`);
        }
    }

    runner.on('processStarted', proc => {
        statusLines[proc] = term_ctrl.createStatusLine();
        setStatus(proc, 'Started');
    });
    runner.on('processData', throttle(proc => setStatus(proc, proc._lastDataLine), 200));
    runner.on('processSuccess', proc => setStatus(proc, 'Done!'));
    runner.on('processTerminated', proc => setStatus(proc, 'Terminated'));
    runner.on('processError', (proc, error) => setStatus(proc, 'Failed: ' + error));

    term_ctrl.onCtrlC(() => runner.terminate('Ctrl-C pressed, stopping all processes...'));
    runner.prependListener('terminated', () => term_ctrl.restore());
};
