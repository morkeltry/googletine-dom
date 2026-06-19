// Express server setup for googletine server

import express from 'express';
import 'path';
import cookieParser from 'cookie-parser';
import acceptPageRequest, { getStats, getPersonas, loadPersonasFromDatabase } from './acceptPageRequest.js';
import { openSession, getSession } from './openSession.js';
import { constants } from '../constants.js';

const server = express();
const { port } = constants;

server.set('port', process.env.GOOGLETINE_SERVER_PORT || port);

// Disable automatic ETag generation for transparency
server.disable('etag');

// Middleware
server.use(express.json());
server.use(cookieParser());
server.use(express.urlencoded({ extended: true }));

// Request logging
server.use((req, res, next) => {
	console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
	next();
});

// Routes
server.post('/request', acceptPageRequest.post);
server.get('/request', acceptPageRequest.get);

// Transparent route: paste URL directly after /request/
server.get('/request/*', (req, res) => {
	// Extract URL from path (everything after /request/)
	const urlPath = req.path.substring(9); // Remove '/request/'
	const decodedUrl = decodeURIComponent(urlPath);

	// Mock request object with URL in query and preserved headers
	const mockReq = {
		query: {
			url: decodedUrl,
			...req.query // Preserve any other query params like persona
		},
		headers: req.headers // Explicitly preserve headers
	};

	acceptPageRequest.get(mockReq, res);
});
server.get('/session', openSession.get);
server.get('/session/:sessionId', (req, res) => {
	const session = getSession(req.params.sessionId);
	if (session) {
		res.json(session);
	} else {
		res.status(404).send({ error: 'Session not found' });
	}
});

// Persona management endpoints
server.get('/personas/stats', getStats.get);
server.get('/personas', getPersonas.get);
server.post('/personas/reload', (req, res) => {
	loadPersonasFromDatabase();
	res.json({ message: 'Personas reloaded from database', timestamp: Date.now() });
});

// Health check
server.get('/health', (req, res) => {
	res.send({
		status: 'ok',
		timestamp: Date.now(),
		endpoints: {
			request: 'POST /request with JSON body {url, payment, personaId}',
			request_get: 'GET /request?url=<url> or GET /request/<url>',
			request_get_with_persona: 'GET /request/<url>?persona=<id>',
			session: 'GET /session',
			personas: 'GET /personas, GET /personas/stats'
		}
	});
});

export default server;
