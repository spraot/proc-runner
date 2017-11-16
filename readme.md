# proc-runner

[![Node version](https://img.shields.io/npm/v/proc-runner.svg?style=flat)](https://www.npmjs.com/package/proc-runner)
[![Build](https://img.shields.io/travis/rachetfoot/proc-runner.svg)](https://travis-ci.org/rachetfoot/proc-runner)

Run child processes synchronously and print nice status to terminal. Designed to print and update status nicely inline with other console output. All console output is abstracted so you can easily set printStatus: false and implement your own logger (see status-handler.js for inspiration). 

![simple example](https://raw.githubusercontent.com/rachetfoot/proc-runner/master/samples/simple.gif "Simple Example")

## Usage

Get runner:

> const runner = require('proc-runner')({printStatus: true})

Add commands:

> runner.addProc({name: 'display_name', exec: 'node', args: ['-e', "process.exit(0)"]});

The argument to addProc can be an object or array of objects. Fields available for use are:

* exec: path to executable (required)
* name: display name
* args: arguments to pass to executable (array of strings)
* timeout: time out if process is not finished faster than this (ms) - set to 0 for no time out
* startTimeout: time out if process does not write to stdout or finish faster than this (ms) - set to 0 for no time out
* onStarted: function to call on started event for this process
* onDone: function to call on done event for this process
* onError: function to call on error for this process
* onTerminated: function to call on terminated event for this process
* onSuccess: function to call on success event for this process
* onData: function to call on data event for this process

Allow the runner to terminate itself when idle instead of emitting idle event:

> runner.finalize()

Listen for various events:

```javascript
runner.on('processStarted', proc => console.log(`${proc.name} started`));
runner.on('processData', (proc, chunk) => console.log(`${proc.name} output: ${chunk}`));
runner.on('processSuccess', proc => console.log(`${proc.name} successfully completed`));
runner.on('processError', (proc, error) => console.log(`${proc.name} error: ${error}`));
runner.on('processTerminated', proc => console.log(`${proc.name} terminated`));
runner.on('processDone', proc => console.log(`${proc.name} done (successful or otherwise)`));
runner.on('idle', () => console.log('all processes are done'));
runner.on('terminated', () => console.log('process runner terminated, stopping processes'));
``` 

## Examples

More complicated example showing error handling, processes timing out, changing concurrent process count, and waiting for current processes to complete before adding more: 

![other example](https://raw.githubusercontent.com/rachetfoot/proc-runner/master/samples/test.gif "Other Example")

Here's the code for simple example above, for more examples see the samples folder in this repository.

```javascript
const proc_count = 10;
console.log(`Running ${proc_count} subprocesses...\n`);

const runner = require('proc-runner')({printStatus: true});
for (const _ of new Array(proc_count))
    runner.addProc({
        name: 'long running',
        exec: 'node',
        args: ['-e', "console.log('started'); rem = Math.random()*20; setInterval(() => {console.log('remaining: '+(rem=rem-0.1).toFixed(1)+'s'); rem>0 || process.exit()}, 100);"]
    });

runner.on('terminated', function(reason) {
    if (reason)
        console.log('\nBatch terminated: '+reason);
    else
        console.log('\nAll processes done');

    console.log(this.errCount + ' processes failed');
    console.log(this.killedCount + ' processes terminated');
    console.log(this.successCount + ' processes finished successfully');

    process.exit();
});

runner.finalize();
```
## Todo

* Remove terminal-kit dependency or make optional, maybe move terminal output to separate package
* Add coverage badge
