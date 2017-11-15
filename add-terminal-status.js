
module.exports = function(runner) {
    const term_ctrl = require('./log')();

    const statusLines = new Map();

    function setStatus(proc, status) {
        if (statusLines[proc]) {
            statusLines[proc](`${proc}: ${status}`);
        }
    }

    runner.on('processStarted', proc => {
        statusLines[proc] = term_ctrl.createStatusLine();
        statusLines[proc].buffer = '';
        setStatus(proc, 'Started');
    });
    runner.on('processData', proc => setStatus(proc, proc.lastDataLine));
    runner.on('processSuccess', proc => setStatus(proc, 'Done!'));
    runner.on('processTerminated', proc => setStatus(proc, 'Terminated'));
    runner.on('processError', (proc, error) => setStatus(proc, 'Failed: ' + error));

    term_ctrl.onCtrlC(() => runner.terminate('Ctrl-C pressed, stopping all processes...'));
    runner.prependListener('terminated', () => term_ctrl.restore());
};
