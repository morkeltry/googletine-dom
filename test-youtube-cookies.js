// Test what cookies YouTube returns on a fresh request

// Test what cookies YouTube returns
console.log('Testing YouTube cookie response...');

fetch('https://www.youtube.com', {
	headers: {
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
	}
}).then(response => {
	console.log('Status:', response.status);
	console.log('\n=== Response Headers ===');
	response.headers.forEach((value, key) => {
		console.log(`${key}: ${value}`);
	});

	// Check for Set-Cookie headers
	const setCookieHeaders = response.headers.getSetCookie();
	if (setCookieHeaders && setCookieHeaders.length > 0) {
		console.log('\n=== Set-Cookie Headers ===');
		setCookieHeaders.forEach((cookie, index) => {
			console.log(`Cookie ${index + 1}:`);
			// Parse the cookie
			const parts = cookie.split(';')[0];
			const [name, value] = parts.split('=');
			console.log(`  Name: ${name}`);
			console.log(`  Value: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
		});
	} else {
		console.log('\nNo Set-Cookie headers found');
	}

	process.exit(0);
}).catch(err => {
	console.error('Error:', err.message);
	process.exit(1);
});
