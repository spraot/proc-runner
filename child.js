#!/usr/bin/env node

const proc_length = parseInt(process.argv[2]);
let progress = 0;

const show_progress = () => {
	progress++;

	console.log('Progress='+(progress/proc_length*100).toFixed(0)+'%');

	if (Math.random()>0.98) {
		console.log('Some random error!')
		process.exit(1);
	}

	if (progress >= proc_length)
		process.exit();

	setTimeout(show_progress, Math.random()*2000);
};

show_progress();