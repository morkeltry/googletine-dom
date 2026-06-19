// Main request handler for googletine server
// Handles payment verification and request fulfillment with persona management

import { requestPayment, receivePayment } from '../../../shared/payments/stub.js';
import { createPaymentRequestHeaders, parsePaymentHeaders } from '../../../shared/payments/headers.js';
import { YouTubePersona, YouTubePersonaManager } from '../../../shared/providers/youtube.js';
import { constants } from '../constants.js';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { siteCookies } = constants;

// Initialize YouTube persona manager
const youtubeManager = new YouTubePersonaManager({
	maxPersonas: 10,
	rotationStrategy: 'round-robin'
});

// Load personas from database
const loadPersonasFromDatabase = () => {
	const dbPath = join(__dirname, '../../data', '.googletine-db.json');
	if (existsSync(dbPath)) {
		try {
			// Clear existing personas before loading
			youtubeManager.personas.clear();

			const data = JSON.parse(readFileSync(dbPath, 'utf8'));
			const personas = data.personas || [];
			const youtubePersonas = personas.filter(p => p.provider === 'youtube');

			for (const personaData of youtubePersonas) {
				const persona = new YouTubePersona(personaData);
				youtubeManager.personas.set(persona.id, persona);
			}

			console.log(`Loaded ${youtubePersonas.length} YouTube personas from database`);
		} catch (err) {
			console.error('Error loading personas from database:', err.message);
		}
	} else {
		// If database doesn't exist, clear personas
		youtubeManager.personas.clear();
		console.log('Database not found, cleared personas');
	}
};

// Load personas on startup
loadPersonasFromDatabase();

// Save personas to database
const savePersonasToDatabase = () => {
	const dbPath = join(__dirname, '../../data', '.googletine-db.json');
	const dataDir = join(__dirname, '../../data');

	// Ensure data directory exists
	if (!existsSync(dataDir)) {
		mkdirSync(dataDir, { recursive: true });
	}

	try {
		const personas = Array.from(youtubeManager.personas.values()).map(persona => ({
			id: persona.id,
			name: persona.name,
			provider: persona.provider,
			createdAt: persona.createdAt,
			lastUsed: persona.lastUsed,
			requestCount: persona.requestCount,
			status: persona.status,
			state: persona.state,
			cookies: Array.from(persona.cookies.entries()),
			headers: persona.headers
		}));

		const data = {
			personas,
			lastUpdated: Date.now()
		};

		writeFileSync(dbPath, JSON.stringify(data, null, 2));
		console.log(`Saved ${personas.length} personas to database`);
	} catch (err) {
		console.error('Error saving personas to database:', err.message);
	}
};

// Modify response (placeholder for future functionality)
const modifyResponse = (response) => {
	return response;
};

// Headers to strip from response (identifying headers)
const STRIP_RESPONSE_HEADERS = ['etag', 'x-etag', 'if-match', 'if-none-match'];

/**
 * Parse and modify a Set-Cookie header value
 * Changes domain to localhost and removes Secure flag for HTTP serving
 * @param {string} cookieString - The Set-Cookie header value
 * @returns {object} Parsed cookie with name, value, and attributes
 */
const parseSetCookie = (cookieString) => {
	if (!cookieString) return null;

	// Split into name-value and attributes
	const parts = cookieString.split(';').map(s => s.trim());
	const [nameValue, ...rawAttrs] = parts;

	if (!nameValue || !nameValue.includes('=')) {
		return null;
	}

	const [name, ...valueParts] = nameValue.split('=');
	const value = valueParts.join('=');

	const cookie = {
		name: name.trim(),
		value: value.trim(),
		attrs: [] // Store original attribute strings to preserve capitalization
	};

	// Parse attributes - store original strings to preserve exact capitalization
	for (const attr of rawAttrs) {
		if (!attr) continue;

		const attrLower = attr.toLowerCase();
		if (attrLower === 'secure') {
			// Skip Secure attribute (will be removed for HTTP)
			continue;
		} else {
			// Store attribute string as-is to preserve capitalization
			cookie.attrs.push(attr.trim());
		}
	}

	return cookie;
};

/**
 * Rebuild a Set-Cookie header value from parsed cookie
 * Applies modifications: changes domain to localhost, removes Secure flag
 * @param {object} cookie - Parsed cookie object
 * @returns {string} Modified Set-Cookie header value
 */
const rebuildSetCookie = (cookie) => {
	let parts = [`${cookie.name}=${cookie.value}`];

	// Add all attributes back with original capitalization
	for (const attr of cookie.attrs) {
		// Check if this is a domain attribute and modify it
		const attrLower = attr.toLowerCase();
		if (attrLower.startsWith('domain=')) {
			// Change domain to localhost, preserve the rest
			parts.push('domain=localhost');
		} else {
			// Keep original attribute with exact capitalization
			parts.push(attr);
		}
	}

	return parts.join('; ');
};

/**
 * Modify a cookie for localhost forwarding
 * Changes domain to localhost and removes Secure flag
 * @param {string} cookieString - Original Set-Cookie header value
 * @returns {string} Modified Set-Cookie header value
 */
const modifyCookieForLocalhost = (cookieString) => {
	const cookie = parseSetCookie(cookieString);
	if (!cookie) return cookieString;

	// parseSetCookie() already drops the Secure flag, and rebuildSetCookie()
	// already rewrites any domain= attribute to localhost. (attrs is an array of
	// attribute strings, not a Map — calling .set()/.delete() here used to throw.)
	return rebuildSetCookie(cookie);
};

// Forward headers from fetch response to client response, stripping identifying headers
const forwardResponseHeaders = (fetchResponse, clientResponse) => {
	// Handle Set-Cookie separately to properly forward all cookies
	const setCookies = fetchResponse.headers.getSetCookie();
	console.log('=== COOKIE FORWARDING START ===');
	console.log('YouTube sent', setCookies ? setCookies.length : 0, 'Set-Cookie headers');

	if (setCookies && setCookies.length > 0) {
		// Modify all cookies and collect in array
		const modifiedCookies = [];
		for (const cookie of setCookies) {
			const parsed = parseSetCookie(cookie);
			if (parsed && parsed.value) {
				const modified = modifyCookieForLocalhost(cookie);
				modifiedCookies.push(modified);
				console.log('Modified cookie:', parsed.name);
				console.log('  Original:  ', cookie.substring(0, 100) + (cookie.length > 100 ? '...' : ''));
				console.log('  Modified:  ', modified.substring(0, 100) + (modified.length > 100 ? '...' : ''));
			} else {
				console.log('Skipping invalid cookie:', cookie.substring(0, 50));
			}
		}

		// Set all cookies as separate headers using array
		if (modifiedCookies.length > 0) {
			clientResponse.setHeader('Set-Cookie', modifiedCookies);
			console.log('=== SETTING COOKIES TO BROWSER ===');
			for (let i = 0; i < modifiedCookies.length; i++) {
				console.log(`Cookie ${i + 1}/${modifiedCookies.length}:`, modifiedCookies[i]);
			}
			console.log(`Total cookies being sent: ${modifiedCookies.length}`);
		} else {
			console.log('No valid cookies to send');
		}
	} else {
		console.log('No Set-Cookie headers from YouTube');
	}
	console.log('=== COOKIE FORWARDING END ===');

	// Forward all other headers except identifying ones
	fetchResponse.headers.forEach((value, key) => {
		const lowerKey = key.toLowerCase();
		if (!STRIP_RESPONSE_HEADERS.includes(lowerKey) && lowerKey !== 'set-cookie') {
			clientResponse.setHeader(key, value);
		}
	});

	// Log EXACT headers being sent to browser
	console.log('=== EXACT HEADERS BEING SENT TO BROWSER ===');
	console.log('Status:', clientResponse.statusCode);
	const headersSent = clientResponse.getHeaders();
	for (const [key, value] of Object.entries(headersSent)) {
		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) {
				console.log(`  ${key}:`, value[i]);
			}
		} else {
			console.log(`  ${key}:`, value);
		}
	}
	console.log('=== END EXACT HEADERS ===');
};

// Extract browser headers that were forwarded from the client
const getForwardedBrowserHeaders = (incomingHeaders) => {
	const headers = {};

	// Headers that should be forwarded from the browser to influence the response
	const browserHeadersToExtract = [
		'accept',
		'accept-language',
		'accept-encoding',
		'user-agent',
		'dnt',
		'sec-fetch-dest',
		'sec-fetch-mode',
		'sec-fetch-site',
		'sec-fetch-user'
	];

	for (const headerName of browserHeadersToExtract) {
		const value = incomingHeaders[headerName];
		if (value) {
			// Capitalize first letter of each word for HTTP header format
			const formattedName = headerName.split('-').map(word =>
				word.charAt(0).toUpperCase() + word.slice(1)
			).join('-');
			headers[formattedName] = value;
		}
	}

	return headers;
};

// Generate Apache-style 402 Payment Required page
const generate402Page = (url, paymentReq) => {
	const amount = paymentReq.amount || 0;
	const currency = paymentReq.currency || 'MPP';
	const timestamp = paymentReq.timestamp ? new Date(paymentReq.timestamp).toISOString() : new Date().toISOString();

	return `<!DOCTYPE html>
<html>
<head>
	<title>402 Payment Required</title>
	<style>
		body {
			font-family: Arial, sans-serif;
			background-color: #f5f5f5;
			margin: 0;
			padding: 40px;
			display: flex;
			justify-content: center;
			align-items: center;
			min-height: 100vh;
		}
		.container {
			background: white;
			max-width: 700px;
			padding: 40px;
			border-radius: 8px;
			box-shadow: 0 2px 10px rgba(0,0,0,0.1);
		}
		h1 {
			color: #d32f2f;
			font-size: 36px;
			margin: 0 0 20px 0;
			border-bottom: 2px solid #d32f2f;
			padding-bottom: 10px;
		}
		.error-code {
			font-size: 72px;
			color: #d32f2f;
			font-weight: bold;
			margin: 0 0 10px 0;
		}
		.error-title {
			font-size: 24px;
			color: #333;
			margin: 0 0 30px 0;
		}
		.section {
			margin: 30px 0;
			padding: 20px;
			background: #f9f9f9;
			border-left: 4px solid #d32f2f;
		}
		.section h2 {
			margin-top: 0;
			color: #333;
			font-size: 18px;
		}
		.payment-details {
			background: #fff3cd;
			border-left-color: #ffc107;
		}
		dl {
			margin: 10px 0;
		}
		dt {
			font-weight: bold;
			color: #555;
			margin-top: 10px;
		}
		dd {
			margin-left: 0;
			color: #333;
			font-family: monospace;
			background: white;
			padding: 8px 12px;
			border-radius: 4px;
			margin-top: 5px;
		}
		.url-display {
			word-break: break-all;
			color: #666;
		}
		.machine-readable {
			font-family: monospace;
			font-size: 12px;
			background: #263238;
			color: #aed581;
			padding: 15px;
			border-radius: 4px;
			overflow-x: auto;
		}
		.note {
			font-size: 14px;
			color: #666;
			font-style: italic;
		}
		.arrow {
			font-size: 24px;
			color: #d32f2f;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="error-code">402</div>
		<h1 class="error-title">Payment Required</h1>

		<div class="section">
			<h2>What does this mean?</h2>
			<p>The content you requested requires payment to access. This server uses a micropayment system to process requests and deliver content.</p>
			<p class="note">HTTP Status Code 402 (Payment Required) - The request cannot be completed until payment is made.</p>
		</div>

		<div class="section payment-details">
			<h2>💳 Payment Required</h2>
			<dl>
				<dt>Amount Due:</dt>
				<dd>${amount} ${currency}</dd>

				<dt>Session ID:</dt>
				<dd>${paymentReq.sessionId || 'N/A'}</dd>

				<dt>Request Timestamp:</dt>
				<dd>${timestamp}</dd>

				<dt>Requested URL:</dt>
				<dd class="url-display">${url}</dd>
			</dl>
		</div>

		<div class="section">
			<h2>🔧 Machine-Readable Format</h2>
			<p>Your client can extract payment details from the following HTTP header:</p>
			<div class="machine-readable">
				X-Payment-Required: ${JSON.stringify(paymentReq, null, 2)}
			</div>
			<p style="margin-top: 15px;">
				<span class="arrow">→</span>
				<strong>To proceed:</strong> Make the payment and retry your request with the payment details in the <code>X-Payment</code> header.
			</p>
		</div>

		<div class="section">
			<h2>📖 How to Complete Payment</h2>
			<ol>
				<li>Extract the payment request from the <code>X-Payment-Required</code> header</li>
				<li>Process the payment using your payment client</li>
				<li>Retry the original request with payment details in <code>X-Payment</code> header</li>
			</ol>
		</div>
	</div>
</body>
</html>`;
};

// Generate 402 page for invalid payment
const generate402InvalidPage = (url, error) => {
	return `<!DOCTYPE html>
<html>
<head>
	<title>402 Payment Invalid</title>
	<style>
		body {
			font-family: Arial, sans-serif;
			background-color: #f5f5f5;
			margin: 0;
			padding: 40px;
			display: flex;
			justify-content: center;
			align-items: center;
			min-height: 100vh;
		}
		.container {
			background: white;
			max-width: 700px;
			padding: 40px;
			border-radius: 8px;
			box-shadow: 0 2px 10px rgba(0,0,0,0.1);
		}
		h1 {
			color: #f57c00;
			font-size: 36px;
			margin: 0 0 20px 0;
			border-bottom: 2px solid #f57c00;
			padding-bottom: 10px;
		}
		.error-code {
			font-size: 72px;
			color: #f57c00;
			font-weight: bold;
			margin: 0 0 10px 0;
		}
		.error-title {
			font-size: 24px;
			color: #333;
			margin: 0 0 30px 0;
		}
		.section {
			margin: 30px 0;
			padding: 20px;
			background: #fff3cd;
			border-left: 4px solid #f57c00;
		}
		.section h2 {
			margin-top: 0;
			color: #333;
			font-size: 18px;
		}
		.error-display {
			background: #ffebee;
			border-left-color: #d32f2f;
		}
		dl {
			margin: 10px 0;
		}
		dt {
			font-weight: bold;
			color: #555;
			margin-top: 10px;
		}
		dd {
			margin-left: 0;
			color: #333;
			font-family: monospace;
			background: white;
			padding: 8px 12px;
			border-radius: 4px;
			margin-top: 5px;
		}
		.url-display {
			word-break: break-all;
			color: #666;
		}
		code {
			background: #f5f5f5;
			padding: 2px 6px;
			border-radius: 3px;
			font-size: 14px;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="error-code">402</div>
		<h1 class="error-title">Payment Invalid</h1>

		<div class="section error-display">
			<h2>❌ Payment Validation Failed</h2>
			<dl>
				<dt>Error:</dt>
				<dd>${error}</dd>

				<dt>Requested URL:</dt>
				<dd class="url-display">${url}</dd>
			</dl>
		</div>

		<div class="section">
			<h2>What does this mean?</h2>
			<p>The payment you provided could not be validated. This could mean:</p>
			<ul>
				<li>The payment has already been used</li>
				<li>The payment was not found in the payment system</li>
				<li>The payment structure is invalid</li>
				<li>The payment amount is insufficient</li>
			</ul>
		</div>

		<div class="section">
			<h2>🔧 How to Fix</h2>
			<ol>
				<li>Verify your payment was processed successfully</li>
				<li>Check that you're sending the correct payment transaction ID</li>
				<li>Ensure the payment hasn't been used for another request</li>
				<li>Try making a new payment and retry the request</li>
			</ol>
		</div>
	</div>
</body>
</html>`;
};

// Generate fetch modifiers for cookie injection
const getFetchModifier = (url, persona) => {
	if (url.indexOf('medium.com') > -1) {
		return {
			headers: {
				cookie: siteCookies.medium.cookie
			}
		};
	}

	if (url.indexOf('twitter.com') > -1 || url.indexOf('x.com') > -1) {
		return {
			headers: {
				cookie: siteCookies.twitter.cookie
			}
		};
	}

	// For YouTube, use persona headers
	if (url.indexOf('youtube.com') > -1 && persona) {
		return {
			headers: persona.getRequestHeaders()
		};
	}

	return {};
};

// Process request and handle payment flow
const processRequest = async (req, res) => {
	const { url, payment, personaId } = req.body || {};
	const sessionId = req.headers['x-session-id'] || null;

	console.log(`Processing request for URL: ${url}`);

	if (!url) {
		res.status(400).send({ error: 'URL is required' });
		return;
	}

	// Step 1: Check if payment is provided
	if (!payment) {
		// No payment? Return 402 with payment request
		console.log('No payment provided - requesting payment');
		const paymentReq = requestPayment(url, sessionId);
		const headers = createPaymentRequestHeaders(paymentReq);

		// Set status and headers
		res.status(402);
		Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));

		// Generate Apache-style 402 HTML page
		const htmlPage = generate402Page(url, paymentReq);
		res.setHeader('Content-Type', 'text/html');
		res.send(htmlPage);
		return;
	}

	// Step 2: Validate payment
	console.log('Payment provided, validating...');
	const paymentResult = await receivePayment(payment);

	if (!paymentResult.valid) {
		console.log('Payment validation failed:', paymentResult.error);
		res.status(402);
		res.setHeader('Content-Type', 'text/html');
		res.send(generate402InvalidPage(url, paymentResult.error));
		return;
	}

	// Step 3: Payment valid - determine provider and get persona
	console.log('Payment valid - fetching URL:', url);

	try {
		const urlObj = new URL(url);
		const provider = urlObj.hostname;

		// Get or create appropriate persona
		let persona;
		let headers = {};

		if (provider.includes('youtube.com')) {
			// If personaId is provided, get that specific persona
			if (personaId) {
				persona = youtubeManager.getPersonaById(personaId);
				if (!persona) {
					console.error(`Persona not found: ${personaId}`);
					res.status(404).send({ error: 'Persona not found' });
					return;
				}
			} else {
				// No personaId, get any available persona
				persona = await youtubeManager.getPersona();
			}

				// Save personas to database after creating a new one
				savePersonasToDatabase();
			console.log(`Using YouTube persona: ${persona.id} (request #${persona.requestCount + 1})`);

			// Start with forwarded browser headers (if available)
			headers = getForwardedBrowserHeaders(req.headers);

			// Override with persona cookies (this is the key - replace browser cookies with persona cookies)
			const personaHeaders = persona.getRequestHeaders();
			if (personaHeaders.Cookie) {
				headers.Cookie = personaHeaders.Cookie;
			}
		} else {
			// For other providers, use basic headers
			headers = {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.5',
				'DNT': '1',
				'Connection': 'keep-alive'
			};
		}

		// Add custom cookie injection if configured
		const fetchModifier = getFetchModifier(url, persona);
		headers = { ...headers, ...fetchModifier.headers };

		// Disable compression to avoid decompression issues with streaming
		// This allows us to stream responses more reliably
		headers['Accept-Encoding'] = 'identity';

		// Fetch the URL with persona headers
		const fullResponse = await fetch(url, { headers }).then(modifyResponse);

		// Update persona with response cookies
		if (persona) {
			youtubeManager.updatePersona(persona.id, fullResponse, provider);

				// Save personas to database after any updates
				savePersonasToDatabase();

			// Log persona status
			const cookieStatus = persona.getYouTubeCookieStatus();
			console.log('Persona cookie status:', {
				VISITOR_PRIVACY_METADATA: cookieStatus.VISITOR_PRIVACY_METADATA,
				VISITOR_INFO1_LIVE: cookieStatus.VISITOR_INFO1_LIVE,
				YSC: cookieStatus.YSC,
				totalCookies: persona.cookies.size
			});
		}

		// Stream response to client
		// Forward response headers (including properly formatted Set-Cookie headers)
		forwardResponseHeaders(fullResponse, res);

		// Set response status
		res.status(fullResponse.status);

		// Stream the response body directly
		if (fullResponse.body) {
			for await (const chunk of fullResponse.body) {
				res.write(chunk);
			}
			res.end();
		} else {
			// Fallback to arrayBuffer if body is not available
			const arrayBuffer = await fullResponse.arrayBuffer();
			res.send(Buffer.from(arrayBuffer));
		}

	} catch (err) {
		console.error('ERROR fetching URL:', err);
		res.status(500).send({ error: 'Failed to fetch URL' });
	}
};

// Local parameters that should be stripped before proxying
const LOCAL_PARAMS = ['persona', 'use_persona'];

// Strip local parameters from URL querystring
const stripLocalParams = (url) => {
	try {
		const urlObj = new URL(url);
		LOCAL_PARAMS.forEach(param => {
			urlObj.searchParams.delete(param);
		});
		return urlObj.toString();
	} catch (e) {
		return url;
	}
};

// Extract and normalize URL from various formats
const extractUrl = (req) => {
	// Try query parameter first
	let url = req.query.url;

	// If no url param, reconstruct from full path
	if (!url && req.path.startsWith('/request/')) {
		// Remove /request/ prefix and decode
		const pathPart = req.path.substring(9);
		url = decodeURIComponent(pathPart);

		// Handle both with and without protocol
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			url = 'https://' + url;
		}
	}

	return url;
};

// GET endpoint handler for transparent URL access
const get = async (req, res) => {
	try {
		const url = extractUrl(req);

		if (!url) {
			res.status(400).send({ error: 'URL parameter is required' });
			return;
		}

		console.log(`GET request for URL: ${url}`);

		// Extract local parameters
		const personaId = req.query.persona;
		const usePersonaParam = req.query.use_persona === 'true';

		// Strip local params from URL before proxying
		const cleanUrl = stripLocalParams(url);
		if (cleanUrl !== url) {
			console.log(`Stripped local params from URL: ${url} -> ${cleanUrl}`);
		}

		// Create request body similar to POST format
		const reqBody = {
			url: cleanUrl,
			personaId: personaId || undefined
			// No payment - will trigger 402 payment required page
		};

		// Mock request object with body
		const mockReq = {
			body: reqBody,
			headers: req.headers
		};

		await processRequest(mockReq, res);
	} catch (err) {
		console.error('ERROR in acceptPageRequest.get:', err);
		res.status(500).send({ error: 'Internal server error' });
	}
};

// Endpoint handler
const acceptPageRequest = {
	post: async (req, res) => {
		try {
			await processRequest(req, res);
		} catch (err) {
			console.error('ERROR in acceptPageRequest:', err);
			res.status(500).send({ error: 'Internal server error' });
		}
	},
	get
};

// Management endpoints for debugging/admin
const getStats = {
	get: async (req, res) => {
		const stats = youtubeManager.getYouTubeStats();
		res.json(stats);
	}
};

const getPersonas = {
	get: async (req, res) => {
		const personas = youtubeManager.getDetailedPersonaInfo();
		res.json(personas);
	}
};

export default acceptPageRequest;
export { getStats, getPersonas, youtubeManager, loadPersonasFromDatabase, LOCAL_PARAMS };
