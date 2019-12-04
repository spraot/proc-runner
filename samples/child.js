#!/usr/bin/env node

const proc_length = parseInt(process.argv[2]);
let progress = 0.0;

const show_progress = () => {
    if (progress >= proc_length) {
    	console.log('\n');
        process.exit();
    }

	console.log('T='+progress.toFixed(2)+'s Progress='+(progress/proc_length*100).toFixed(0)+'%');

	if (Math.random()>0.997) {
		console.error('Some random error!');
		process.exit(1);
	}

	if (Math.random()>0.998) {
		console.error('Other error!');
		process.exit(1);
	}

    const interval = 10*(Math.random()*4+1);
	setTimeout(() => {
        progress += interval/1000;
	    show_progress();
    }, interval);
};

show_progress();
