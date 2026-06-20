// Server startup for googletine
// Now using live-algo server as the main server

import { exec } from 'child_process';
import server from '../../live-algo-server.js';

const port = server.get('port');
const delay = 500;
let triesRemaining = 2;
let nextTry;

const tryToListen = () => {
	if (triesRemaining--)
		server.listen(port, () => {
			console.log('Googletine server running on port', port);
			triesRemaining = 0;
		})
			.on('error', e => {
				if (e.code === 'EADDRINUSE') {
					console.log(e.message);
					if (triesRemaining)
						console.log(`Trying again in ${delay}ms`);
					else {
						exec(`netstat -tulp |grep ${port} |grep node`, (error, stdout, stderr) => {
							stdout = stdout.match(/(\d+)(?:\/node)/)[1];
							console.log('Maybe try:');
							console.log(`  kill -9 ${stdout}`);
						});
					}
				} else {
					console.log(e);
					console.log(e.code);
					console.log(e.message);
				}
			});
};

// Try once
tryToListen();
// Try again after delay
nextTry = setTimeout(() => {
	nextTry = null;
	tryToListen();
});

process.on('SIGHUP', () => {
	console.log("Shutting down...");
	process.exit();
});
