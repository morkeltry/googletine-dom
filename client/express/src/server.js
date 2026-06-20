// Express server setup for googletine client

import express from 'express';
import 'path';
import cookieParser from 'cookie-parser';
import forwardRequest from './forwardRequest.js';
import { constants } from '../constants.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as auth from '../../../shared/payments/authorization.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const server = express();
const { port } = constants;

server.set('port', process.env.GOOGLETINE_CLIENT_PORT || port);

// Disable automatic ETag generation for transparency
server.disable('etag');

// Middleware
server.use(express.json());
server.use(cookieParser());
server.use(express.urlencoded({ extended: true }));

// Serve static files for payment UI
server.use('/payment', express.static(join(__dirname, '../../public/payment')));

// Request logging
server.use((req, res, next) => {
	console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
	next();
});

// Main route: forward requests to remote node
server.get('/request', forwardRequest.get);

// Transparent route: paste URL directly after /request/
server.get('/request/*', (req, res) => {
	// Extract URL from path (everything after /request/)
	const urlPath = req.path.substring(9); // Remove '/request/'
	const decodedUrl = decodeURIComponent(urlPath);

	// Store original query to restore later
	const originalQuery = req.query;

	// Temporarily modify the request object to add URL parameter
	req.query = {
		url: decodedUrl,
		...originalQuery // Preserve any other query params like persona
	};

	// Call the forward request handler
	forwardRequest.get(req, res);

	// Restore original query (in case it's needed later, though unlikely for this request)
	req.query = originalQuery;
});

// Health check
server.get('/health', (req, res) => {
	res.send({ status: 'ok', timestamp: Date.now() });
});

// Info endpoint
server.get('/', (req, res) => {
	res.send({
		name: 'Googletine Client',
		version: '1.0.0',
		status: 'running',
		endpoints: {
			request: 'GET /request?url=<encoded-url> or GET /request/<url>',
			request_with_persona: 'GET /request/<url>?persona=<id>',
			health: 'GET /health',
			payment_auth: 'GET /payment/auth - Payment authorization modal',
			payment_authorize: 'POST /payment/authorize - Authorize payment',
			payment_status: 'GET /payment/status/:sessionId - Check payment status',
			payment_check: 'GET /payment/auth/check - Check authorization status'
		},
		examples: [
			'GET /request/https://youtube.com/watch?v=123',
			'GET /request/youtube.com/watch?v=123',
			'GET /request?url=https://youtube.com/watch?v=123&persona=abc123'
		]
	});
});

// ---- Payment Endpoints ----

// Serve payment authorization modal
server.get('/payment/auth', (req, res) => {
	res.sendFile(join(__dirname, '../../public/payment/index.html'));
});

// Payment authorization API
server.post('/payment/authorize', async (req, res) => {
	try {
		const { userId, amount } = req.body;

		if (!userId || !amount) {
			return res.status(400).json({
				success: false,
				error: 'userId and amount are required'
			});
		}

		// Validate and create authorization
		const result = auth.createAuthorization(userId, amount);

		if (result.success) {
			console.log(`[Payment] Created authorization for user ${userId}: ${amount} units`);
			res.json(result);
		} else {
			res.status(400).json(result);
		}
	} catch (error) {
		console.error('[Payment] Authorization error:', error.message);
		res.status(500).json({
			success: false,
			error: error.message
		});
	}
});

// Authorization status check
server.get('/payment/auth/check', (req, res) => {
	try {
		const userId = req.query.userId || req.cookies.userId;

		if (!userId) {
			return res.json({
				hasAuthorization: false,
				message: 'No user ID provided'
			});
		}

		const status = auth.getAuthorizationStatus(userId);
		res.json(status);
	} catch (error) {
		console.error('[Payment] Status check error:', error.message);
		res.status(500).json({
			success: false,
			error: error.message
		});
	}
});

// Payment status (for debugging)
server.get('/payment/status/:sessionId', (req, res) => {
	try {
		// This would check payment status by session ID
		// For now, return a mock response
		res.json({
			sessionId: req.params.sessionId,
			status: 'active',
			message: 'Payment session active'
		});
	} catch (error) {
		console.error('[Payment] Status error:', error.message);
		res.status(500).json({
			success: false,
			error: error.message
		});
	}
});

// Catch-all route: simpler alias for transparent URL access
// Allows localhost:6060/some.url as alias for localhost:6060/request/some.url
// Must be last so it doesn't intercept specific routes
server.get('/*', (req, res) => {
	// Extract URL from path (everything after /)
	const urlPath = req.path.substring(1); // Remove leading '/'
	const decodedUrl = decodeURIComponent(urlPath);

	// Temporarily modify the request object
	const originalQuery = req.query;
	req.query = {
		url: decodedUrl,
		...originalQuery
	};

	// Call the forward request handler
	forwardRequest.get(req, res);

	// Restore original query
	req.query = originalQuery;
});

export default server;
