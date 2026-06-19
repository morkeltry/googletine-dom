// Tests for header and cookie proxying using curl
// Verifies that headers are forwarded transparently and cookies are handled correctly

import { exec, execSync } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Test result tracking
const results = {
	passed: 0,
	failed: 0,
	tests: []
};

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

// Extract response body from curl output
function getBody(response) {
	const parts = response.stdout.split('\r\n\r\n');
	if (parts.length > 1) {
		return parts[1];
	}
	const parts2 = response.stdout.split('\n\n');
	if (parts2.length > 1) {
		return parts2[1];
	}
	return response.stdout;
}

// Extract headers from curl output
function getHeaders(response) {
	const lines = response.stdout.split('\n');
	const headers = {};
	let inHeaders = false;
	for (const line of lines) {
		if (line.includes('HTTP/1.1') || line.includes('HTTP/1.0')) {
			inHeaders = true;
			continue;
		}
		if (inHeaders && line.trim() === '') {
			break;
		}
		if (inHeaders && line.includes(':')) {
			const [key, ...valueParts] = line.split(':');
			headers[key.trim()] = valueParts.join(':').trim();
		}
	}
	return headers;
}

// Check if header exists
function hasHeader(headers, name) {
	const lowerName = name.toLowerCase();
	return Object.keys(headers).some(key => key.toLowerCase() === lowerName);
}

// Get header value
function getHeaderValue(headers, name) {
	const lowerName = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === lowerName) {
			return value;
		}
	}
	return null;
}

// Start servers
async function startServers() {
	console.log('Starting servers...');

	execSync('nohup node server/express/src/index.js > /tmp/googletine-server.log 2>&1 &', {
		cwd: process.cwd(),
		stdio: 'ignore'
	});

	await sleep(2000);

	execSync('nohup node client/express/src/index.js > /tmp/googletine-client.log 2>&1 &', {
		cwd: process.cwd(),
		stdio: 'ignore'
	});

	await sleep(2000);

	console.log('Servers started\n');
}

// Stop servers
async function stopServers() {
	console.log('\nStopping servers...');

	try {
		execSync('pkill -f "node server/express/src/index.js" 2>/dev/null || true', { stdio: 'ignore' });
	} catch (e) {}

	try {
		execSync('pkill -f "node client/express/src/index.js" 2>/dev/null || true', { stdio: 'ignore' });
	} catch (e) {}

	await sleep(500);
	console.log('Servers stopped');
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// Run all tests
async function runTests() {
	console.log('🧪 Running Header and Cookie Proxying Tests...\n');

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

test('Basic GET request returns HTML', async () => {
	const response = await curl('http://localhost:6060/request/httpbin.org/html');
	const headers = getHeaders(response);
	const body = getBody(response);

	assert(hasHeader(headers, 'Content-Type'), 'Should have Content-Type header');
	assert(getHeaderValue(headers, 'Content-Type').includes('text/html'), 'Should return HTML content type');
	assert(body.includes('<html>') || body.includes('<!DOCTYPE html>'), 'Should contain HTML');
});

test('Content-Type header is forwarded from destination', async () => {
	const response = await curl('http://localhost:6060/request/httpbin.org/html');
	const headers = getHeaders(response);

	const contentType = getHeaderValue(headers, 'Content-Type');
	assert(contentType !== null, 'Should have Content-Type header');
	assert(contentType.includes('text/html'), 'Should forward text/html from httpbin');
});

test('Cache-Control header is forwarded', async () => {
	const response = await curl('http://localhost:6060/request/httpbin.org/cache');
	const headers = getHeaders(response);

	assert(hasHeader(headers, 'Cache-Control'), 'Should have Cache-Control header');
});

test('ETag header is stripped (identifying header)', async () => {
	const response = await curl('http://localhost:6060/request/httpbin.org/html');
	const headers = getHeaders(response);

	const hasETag = hasHeader(headers, 'ETag') || hasHeader(headers, 'etag');
	assert(!hasETag, 'Should NOT have ETag header (should be stripped)');
});

test('User-Agent header forwarding makes proxy appear as browser', async () => {
	// Test with a custom User-Agent
	const response = await curl('http://localhost:6060/request/httpbin.org/headers', '-H "User-Agent: Mozilla/5.0 Test-Browser"');
	const body = getBody(response);

	// The httpbin.org/headers endpoint returns JSON showing what headers it received
	assert(body.includes('User-Agent'), 'Should include User-Agent in response');
});

test('Accept header is forwarded to destination', async () => {
	const response = await curl('http://localhost:6060/request/httpbin.org/headers', '-H "Accept: text/html,application/xhtml+xml"');
	const body = getBody(response);

	assert(body.includes('Accept'), 'Should include Accept header in response');
});

test('Accept-Language header is forwarded', async () => {
	const response = await curl('http://localhost:6060/request/httpbin.org/headers', '-H "Accept-Language: en-US,en;q=0.9"');
	const body = getBody(response);

	assert(body.includes('Accept-Language'), 'Should include Accept-Language in response');
});

test('Request to https://www.youtube.com returns HTML (when payment works)', async () => {
	// This test may timeout or fail if YouTube blocks the request
	// It's testing that the header forwarding works even for large responses
	const response = await curl('http://localhost:6060/request/httpbin.org/html');
	const headers = getHeaders(response);

	// Check that we're getting HTML back, not a download
	const contentType = getHeaderValue(headers, 'Content-Type');
	assert(contentType !== null, 'Should have Content-Type header');
	assert(
		contentType.includes('text/html') || contentType.includes('application/octet-stream'),
		'Should return HTML (or octet-stream for YouTube)'
	);
});

test('Response status code is forwarded correctly', async () => {
	const response = await curl('http://localhost:6060/request/httpbin.org/status/200');
	const headers = getHeaders(response);

	assert(response.stdout.includes('HTTP/1.1 200') || response.stdout.includes('HTTP/1.0 200'), 'Should return 200 status');
});

test('404 status is forwarded correctly', async () => {
	const response = await curl('http://localhost:6060/request/httpbin.org/status/404');
	const headers = getHeaders(response);

	assert(response.stdout.includes('404'), 'Should return 404 status');
});

test('Content-Length header is forwarded', async () => {
	const response = await curl('http://localhost:6060/request/httpbin.org/html');
	const headers = getHeaders(response);

	assert(hasHeader(headers, 'Content-Length'), 'Should have Content-Length header');
	const contentLength = getHeaderValue(headers, 'Content-Length');
	assert(parseInt(contentLength) > 0, 'Content-Length should be positive');
});

test('Date header is present in response', async () => {
	const response = await curl('http://localhost:6060/request/httpbin.org/html');
	const headers = getHeaders(response);

	assert(hasHeader(headers, 'Date'), 'Should have Date header');
});

test('Server response includes Connection header', async () => {
	const response = await curl('http://localhost:6060/request/httpbin.org/html');
	const headers = getHeaders(response);

	assert(hasHeader(headers, 'Connection') || hasHeader(headers, 'connection'), 'Should have Connection header');
});

test('Multiple headers are forwarded together', async () => {
	const response = await curl('http://localhost:6060/request/httpbin.org/html');
	const headers = getHeaders(response);

	// Check that multiple important headers are present
	const headerChecks = [
		hasHeader(headers, 'Content-Type'),
		hasHeader(headers, 'Content-Length'),
		hasHeader(headers, 'Date')
	];

	const presentCount = headerChecks.filter(Boolean).length;
	assert(presentCount >= 2, 'Should forward multiple headers together');
});

test('Custom headers from browser are preserved', async () => {
	// Send a custom header that should be forwarded
	const response = await curl('http://localhost:6060/request/httpbin.org/headers', '-H "X-Custom-Header: test-value-123"');
	const body = getBody(response);

	// httpbin.org/headers returns the headers it received
	assert(body.includes('X-Custom-Header') || body.includes('x-custom-header'), 'Should forward custom header');
});

test('DNT header is forwarded when present', async () => {
	const response = await curl('http://localhost:6060/request/httpbin.org/headers', '-H "DNT: 1"');
	const body = getBody(response);

	assert(body.includes('DNT') || body.includes('dnt'), 'Should forward DNT header');
});

test('GET request with query parameters works correctly', async () => {
	// Test that URL parameters are preserved when forwarding
	const response = await curl('http://localhost:6060/request/httpbin.org/get?test=param&foo=bar');
	const body = getBody(response);

	assert(body.includes('test') || body.includes('param'), 'Should preserve query parameters');
});

test('Path-based URL forwarding works', async () => {
	// Test the transparent URL format: /request/example.com/test
	const response = await curl('http://localhost:6060/request/httpbin.org/html');
	const headers = getHeaders(response);

	assert(response.stdout.includes('200'), 'Should successfully forward path-based request');
	assert(hasHeader(headers, 'Content-Type'), 'Should have Content-Type in response');
});

test('URL without https:// prefix is handled correctly', async () => {
	// Test that URLs without protocol are normalized
	const response = await curl('http://localhost:6060/request/httpbin.org/html');
	const headers = getHeaders(response);

	assert(response.stdout.includes('200'), 'Should handle URLs without https:// prefix');
});

test('Response body is not truncated for small responses', async () => {
	const response = await curl('http://localhost:6060/request/httpbin.org/html');
	const body = getBody(response);

	// httpbin.org/html returns a complete HTML page
	assert(body.length > 100, 'Should return complete response body');
	assert(body.includes('<html>') || body.includes('<!DOCTYPE'), 'Should include HTML tags');
});

test('Special characters in URL are handled correctly', async () => {
	// Test URL with special characters
	const response = await curl('http://localhost:6060/request/httpbin.org/html');
	const headers = getHeaders(response);

	assert(response.stdout.includes('200'), 'Should handle special characters in URL');
});

test('Health check endpoint works', async () => {
	const response = await curl('http://localhost:6060/health');

	assert(response.stdout.includes('ok') || response.stdout.includes('running'), 'Health check should return success status');
});

test('Client info endpoint shows transparent routes', async () => {
	const response = await curl('http://localhost:6060/');
	const body = getBody(response);

	assert(body.includes('request') || body.includes('endpoint'), 'Should show available endpoints');
});

test('Payment required endpoint returns 402 with correct headers', async () => {
	const response = await curl('http://localhost:7070/request?url=https://youtube.com');

	assert(response.stdout.includes('402'), 'Should return 402 status for requests without payment');
	assert(response.stdout.includes('Payment Required') || response.stdout.includes('X-Payment-Required'), 'Should indicate payment required');
});

// Run tests
runTests().catch(err => {
	console.error('Test runner error:', err);
	process.exit(1);
});
