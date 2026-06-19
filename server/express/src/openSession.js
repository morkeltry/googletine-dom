// Session management for googletine server
// Simplified from original - no blockchain validation

// In-memory session storage
// TODO: Add proper session persistence (Redis, database, etc.)
const sessions = {};

// Generate a simple session ID (placeholder for uuid)
const generateSessionId = () => {
	return `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Create a new session for a client
const newSession = async (params = {}) => {
	const sessionId = generateSessionId();

	const session = {
		sessionId,
		createdAt: Date.now(),
		clientId: params.clientId || null,
		requestedModules: params.modules || []
	};

	sessions[sessionId] = session;

	console.log(`New session created: ${sessionId}`);

	return { session, params };
};

// Get existing session
const getSession = (sessionId) => {
	return sessions[sessionId] || null;
};

// Clean up old sessions (call periodically)
const cleanupSessions = (maxAge = 3600000) => { // 1 hour default
	const now = Date.now();
	let cleaned = 0;

	for (const [sessionId, session] of Object.entries(sessions)) {
		if (now - session.createdAt > maxAge) {
			delete sessions[sessionId];
			cleaned++;
		}
	}

	console.log(`Cleaned up ${cleaned} old sessions`);
	return cleaned;
};

// Session endpoint handlers
const openSession = {
	get: async (req, res) => {
		try {
			const { params } = req;
			const result = await newSession(params);

			res.type('application/json');
			res.status(200);
			res.send(result);
		} catch (err) {
			console.error('ERROR creating session:', err);
			res.status(500).send({ error: 'Failed to create session' });
		}
	}
};

export { openSession, getSession, cleanupSessions, sessions };
