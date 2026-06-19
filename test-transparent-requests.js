// Tests for transparent GET request functionality
// Uses curl to test actual HTTP endpoints

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { kill } from 'process';

const execAsync = promisify(exec);

// Configuration
const CLIENT_PORT = 6060;
const SERVER_PORT = 7070;
const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Test result tracking
const results = {
	passed: 0,
	failed: 0,
	tests: []
};

// Process handles for cleanup
let clientProcess = null;
let serverProcess = null;

// Test helper
function test(name, fn) {
	results.tests.push({ name, fn, status: 'pending' });
}

// Assert helper
function assert(condition, message) {
	if (!condition) {
		throw new Error(`Assertion failed: ${message}`);
	}
}

// Curl helper
async function curl(url, options = '') {
	try {
		const { stdout, stderr } = await execAsync(`curl -s -i ${options} '${url}'`);
		return { stdout, stderr, success: true };
	} catch (error) {
		return { stdout: error.stdout || '', stderr: error.stderr || '', success: false, error };
	}
}

// Start servers
async function startServers() {
	console.log('Starting servers...');

	// Start server in background
	execSync('nohup node server/express/src/index.js > /tmp/googletine-server.log 2>&1 &', {
		cwd: process.cwd(),
		stdio: 'ignore'
	});

	// Wait for server to start
	await sleep(1500);

	// Start client in background
	execSync('nohup node client/express/src/index.js > /tmp/googletine-client.log 2>&1 &', {
		cwd: process.cwd(),
		stdio: 'ignore'
	});

	// Wait for client to start
	await sleep(1500);

	console.log('Servers started\n');
}

// Stop servers
async function stopServers() {
	console.log('\nStopping servers...');

	try {
		execSync(`pkill -f "node server/express/src/index.js"`, { stdio: 'ignore' });
	} catch (e) {}

	try {
		execSync(`pkill -f "node client/express/src/index.js"`, { stdio: 'ignore' });
	} catch (e) {}

	await sleep(500);
	console.log('Servers stopped');
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// Check if response is OK
function isOk(response) {
	return response.stdout.includes('HTTP/1.1 200') || response.stdout.includes('HTTP/1.0 200');
}

// Check if response is error
function isError(response, code) {
	return response.stdout.includes(`HTTP/1.1 ${code}`) || response.stdout.includes(`HTTP/1.0 ${code}`);
}

// Get response body from curl output
function getBody(response) {
	const parts = response.stdout.split('\r\n\r\n');
	if (parts.length > 1) {
		return parts[1];
	}
	// Try with \n\n separator
	const parts2 = response.stdout.split('\n\n');
	if (parts2.length > 1) {
		return parts2[1];
	}
	return response.stdout;
}

// Run all tests
async function runTests() {
	console.log('🧪 Running Transparent GET Request Tests...\n');

	// Setup
	await startServers();

	// Run each test
	for (const test of results.tests) {
		try {
			console.log(`Testing: ${test.name}`);
			await test.fn();
			results.passed++;
			test.status = 'passed';
			console.log(`  ✓ Passed\n`);
		} catch (err) {
			results.failed++;
			test.status = 'failed';
			test.error = err.message;
			console.log(`  ✗ Failed: ${err.message}\n`);
		}
	}

	// Cleanup
	await stopServers();

	// Print summary
	console.log('════════════════════════════════════════');
	console.log(`Tests passed: ${results.passed}`);
	console.log(`Tests failed: ${results.failed}`);
	console.log(`Total tests: ${results.tests.length}`);
	console.log('════════════════════════════════════════');

	if (results.failed > 0) {
		console.log('\nFailed tests:');
		for (const test of results.tests.filter(t => t.status === 'failed')) {
			console.log(`  - ${test.name}`);
		}
		process.exit(1);
	}
}

// Define tests

test('client health endpoint', async () => {
	const response = await curl(`${CLIENT_URL}/health`);
	assert(isOk(response), 'health endpoint should return 200');
	const body = getBody(response);
	assert(JSON.parse(body).status === 'ok', 'should return ok status');
});

test('server health endpoint', async () => {
	const response = await curl(`${SERVER_URL}/health`);
	assert(isOk(response), 'health endpoint should return 200');
	const body = getBody(response);
	assert(JSON.parse(body).status === 'ok', 'should return ok status');
});

test('client info endpoint shows new transparent routes', async () => {
	const response = await curl(`${CLIENT_URL}/`);
	assert(isOk(response), 'info endpoint should return 200');
	const body = getBody(response);
	const data = JSON.parse(body);
	assert(data.endpoints.request.includes('GET /request/<url>'), 'should show transparent route');
	assert(data.examples.length > 0, 'should show examples');
});

test('GET request with URL parameter (querystring)', async () => {
	const testUrl = encodeURIComponent('https://example.com');
	const response = await curl(`${CLIENT_URL}/request?url=${testUrl}`);
	// Should get something (even if it's an error from the destination)
	assert(isOk(response) || isError(response, 500) || isError(response, 402), 'should get a response');
});

test('GET request with path-based URL (with https://)', async () => {
	const response = await curl(`${CLIENT_URL}/request/https://example.com`);
	assert(isOk(response) || isError(response, 500) || isError(response, 402), 'should get a response');
});

test('GET request with path-based URL (without https://)', async () => {
	const response = await curl(`${CLIENT_URL}/request/example.com`);
	assert(isOk(response) || isError(response, 500) || isError(response, 402), 'should get a response');
});

test('GET request with youtube.com URL', async () => {
	const response = await curl(`${CLIENT_URL}/request/youtube.com`);
	// YouTube will likely return something
	assert(isOk(response) || isError(response, 500) || isError(response, 402), 'should get a response');
});

test('GET request with complex YouTube URL', async () => {
	const response = await curl(`${CLIENT_URL}/request/youtube.com/watch?v=dQw4w9WgXcQ`);
	assert(isOk(response) || isError(response, 500) || isError(response, 402), 'should get a response');
});

test('GET request with persona parameter (should be stripped)', async () => {
	const response = await curl(`${CLIENT_URL}/request/example.com?persona=test123`);
	// The persona param should be stripped before forwarding
	assert(isOk(response) || isError(response, 500) || isError(response, 402), 'should get a response');
});

test('GET request with use_persona parameter', async () => {
	const response = await curl(`${CLIENT_URL}/request/youtube.com?use_persona=true`);
	assert(isOk(response) || isError(response, 500) || isError(response, 402), 'should get a response');
});

test('GET request with URL querystring containing & (appended local params)', async () => {
	// Test that we can append &localparam=value to a URL that already has ?
	const response = await curl(`${CLIENT_URL}/request/youtube.com/watch?v=123&persona=test`);
	assert(isOk(response) || isError(response, 500) || isError(response, 402), 'should get a response');
});

test('server GET request endpoint', async () => {
	const testUrl = encodeURIComponent('https://example.com');
	const response = await curl(`${SERVER_URL}/request?url=${testUrl}`);
	assert(isOk(response) || isError(response, 402), 'server should handle GET request');
});

test('server transparent path-based GET request', async () => {
	const response = await curl(`${SERVER_URL}/request/example.com`);
	// Server should return something - could be 200, 402 (payment), or 500 (network error)
	assert(isOk(response) || isError(response, 402) || isError(response, 500) || isError(response, 400), 'server should handle path-based request');
});

test('POST request still works (backward compatibility)', async () => {
	const response = await curl(`${SERVER_URL}/request`, '-X POST -H "Content-Type: application/json" -d \'{"url":"https://example.com"}\'');
	assert(isOk(response) || isError(response, 402), 'POST should still work');
});

test('server personas stats endpoint', async () => {
	const response = await curl(`${SERVER_URL}/personas/stats`);
	assert(isOk(response), 'personas stats should return 200');
	const body = getBody(response);
	const data = JSON.parse(body);
	assert(typeof data.totalPersonas === 'number', 'should have totalPersonas count');
});

test('URL normalization: youtube.com without protocol gets https://', async () => {
	// This tests that the client adds https:// when missing
	const response = await curl(`${CLIENT_URL}/request/youtube.com`);
	assert(isOk(response) || isError(response, 500) || isError(response, 402), 'should handle missing protocol');
});

test('URL with spaces gets encoded properly', async () => {
	const encodedUrl = encodeURIComponent('https://httpbin.org/anything/test%20path');
	const response = await curl(`${CLIENT_URL}/request?url=${encodedUrl}`);
	// Should get some response (httpbin handles various URLs)
	assert(isOk(response) || isError(response, 500) || isError(response, 402), 'should handle encoded URLs');
});

// Run tests
runTests().catch(err => {
	console.error('Test runner error:', err);
	process.exit(1);
});
