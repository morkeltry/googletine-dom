// Test script for persona management

import { writeFileSync, appendFileSync } from 'fs';

const log = (msg) => {
	console.log(msg);
	appendFileSync('/code/googletine/test-results.log', `${msg}\n`);
};

const makeRequest = async (url, requestId) => {
	try {
		const response = await fetch('http://localhost:7070/request', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				url: url,
				payment: { success: true, transactionId: `test-${requestId}`, amount: 1000 }
			})
		});

		const text = await response.text();
		return { success: response.ok, length: text.length };
	} catch (err) {
		return { success: false, error: err.message };
	}
};

const getStats = async () => {
	try {
		const response = await fetch('http://localhost:7070/personas/stats');
		return await response.json();
	} catch (err) {
		return { error: err.message };
	}
};

const getPersonas = async () => {
	try {
		const response = await fetch('http://localhost:7070/personas');
		return await response.json();
	} catch (err) {
		return { error: err.message };
	}
};

const runTest = async () => {
	log('=== Starting Persona Management Test ===\n');

	const testUrl = 'https://www.youtube.com/results?search_query=test';
	const numRequests = 5;

	log(`Making ${numRequests} requests to YouTube...`);

	for (let i = 1; i <= numRequests; i++) {
		log(`\nRequest ${i}:`);
		const result = await makeRequest(testUrl, i);

		if (result.success) {
			log(`  ✓ Success (${result.length} bytes)`);
		} else {
			log(`  ✗ Failed: ${result.error}`);
		}

		// Check personas after this request
		const personas = await getPersonas();
		log(`  Active personas: ${personas.length}`);

		if (personas.length > 0) {
			personas.forEach(p => {
				log(`    - ${p.id.substring(0, 30)}... (requests: ${p.requestCount})`);
			});
		}

		await new Promise(r => setTimeout(r, 500));
	}

	log('\n=== Final Stats ===');
	const stats = await getStats();
	log(JSON.stringify(stats, null, 2));

	log('\n=== Test Complete ===');
};

runTest().catch(err => {
	log(`ERROR: ${err.message}`);
	console.error(err);
});
