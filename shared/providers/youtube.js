// YouTube provider implementation
// Handles YouTube-specific cookie management and request preparation

import { Persona } from '../personas/Persona.js';
import { PersonaManager } from '../personas/PersonaManager.js';
import { initializeYouTubePersonaWithConsent } from './youtube-consent-handler.js';

/**
 * YouTube-specific Persona with YouTube cookie handling
 */
export class YouTubePersona extends Persona {
	constructor(options = {}) {
		super({
			provider: 'youtube',
			...options
		});

		// YouTube-specific state
		this.state = {
			privacyMetadata: null,
			visitorId: null,
			sessionId: null,
			...options.state
		};
	}

	/**
	 * Get headers specifically for YouTube requests
	 * @returns {object} Headers object
	 */
	getRequestHeaders() {
		const domain = 'www.youtube.com';
		const cookieHeader = this.getCookieHeader(domain);

		return {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
			'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
			'Accept-Language': 'en-US,en;q=0.5',
			'Accept-Encoding': 'gzip, deflate, br',
			'DNT': '1',
			'Connection': 'keep-alive',
			'Upgrade-Insecure-Requests': '1',
			'Sec-Fetch-Dest': 'document',
			'Sec-Fetch-Mode': 'navigate',
			'Sec-Fetch-Site': 'none',
			'Sec-Fetch-User': '?1',
			...(cookieHeader && { 'Cookie': cookieHeader })
		};
	}

	/**
	 * Update YouTube-specific state from cookies
	 */
	updateYouTubeState() {
		// Extract VISITOR_PRIVACY_METADATA (replaces CONSENT as of 2026)
		const privacyCookie = this.cookies.get('VISITOR_PRIVACY_METADATA');
		this.state.privacyMetadata = privacyCookie?.value || null;

		// Extract VISITOR_INFO1_LIVE
		const visitorCookie = this.cookies.get('VISITOR_INFO1_LIVE');
		this.state.visitorId = visitorCookie?.value || null;

		// Extract __Secure-YENID (session identifier)
		const yenidCookie = this.cookies.get('__Secure-YENID');
		this.state.sessionId = yenidCookie?.value || null;
	}

	/**
	 * Get YouTube-specific cookie info
	 * @returns {object} YouTube cookie status
	 */
	getYouTubeCookieStatus() {
		return {
			VISITOR_PRIVACY_METADATA: this.cookies.get('VISITOR_PRIVACY_METADATA')?.value || null,
			VISITOR_INFO1_LIVE: this.cookies.get('VISITOR_INFO1_LIVE')?.value || null,
			YSC: this.cookies.get('YSC')?.value || null,
			__Secure_YEC: this.cookies.get('__Secure-YEC')?.value || null,
			__Secure_YENID: this.cookies.get('__Secure-YENID')?.value || null
		};
	}
}

/**
 * YouTube-specific PersonaManager
 */
export class YouTubePersonaManager extends PersonaManager {
	constructor(options = {}) {
		super({
			providerId: 'youtube',
			maxPersonas: options.maxPersonas || 10,
			rotationStrategy: options.rotationStrategy || 'round-robin',
			...options
		});

		// YouTube-specific settings
		this.cookieNames = [
			'VISITOR_PRIVACY_METADATA',
			'VISITOR_INFO1_LIVE',
			'YSC',
			'__Secure-YEC',
			'__Secure-YENID',
			'PREF',
			'SID',
			'HSID',
			'SSID',
			'APISID',
			'SAPISID'
		];
	}

	/**
	 * Create a new YouTube persona with initial setup
	 * This makes an initial request to YouTube to accept terms and get proper cookies
	 * @param {object} options - Persona options
	 * @returns {Promise<YouTubePersona>}
	 */
	async createPersona(options = {}) {
		const persona = new YouTubePersona(options);

		this.personas.set(persona.id, persona);
		this.stats.totalPersonasCreated++;

		// Make initial request to YouTube to accept terms and get proper cookies
		// YouTube will set VISITOR_PRIVACY_METADATA and other cookies
		await this.initializePersona(persona);

		return persona;
	}

	/**
	 * Initialize a persona by making a request to YouTube to accept terms and get cookies
	 * Uses simple fetch for now (consent handler integration pending)
	 * @param {YouTubePersona} persona - The persona to initialize
	 */
	async initializePersona(persona) {
		try {
			console.log(`Initializing persona ${persona.id} - accepting YouTube terms...`);

			// Simple fetch to get cookies (consent handler integration pending optimization)
			const youtubeUrl = 'https://www.youtube.com';
			const headers = persona.getRequestHeaders();

			const response = await fetch(youtubeUrl, { headers });

			if (response.ok) {
				// Update persona with cookies from the response
				const setCookieHeaders = response.headers?.getSetCookie();
				if (setCookieHeaders) {
					persona.updateCookies(setCookieHeaders, 'www.youtube.com');
				}

				// Update YouTube-specific state
				persona.updateYouTubeState();

				console.log(`Persona ${persona.id} initialized with ${persona.cookies.size} cookies`);
			} else {
				console.warn(`Failed to initialize persona ${persona.id}: ${response.status}`);
			}

		} catch (error) {
			console.error(`Error initializing persona ${persona.id}:`, error.message);
		}
	}

	/**
	 * Update a YouTube persona after a request
	 * @param {string} personaId - ID of persona to update
	 * @param {object} response - Response object
	 * @param {string} domain - Domain (default: www.youtube.com)
	 */
	updatePersona(personaId, response, domain = 'www.youtube.com') {
		const persona = this.personas.get(personaId);
		if (!persona) return;

		// Update cookies from response
		const setCookieHeaders = response.headers?.getSetCookie();
		if (setCookieHeaders) {
			persona.updateCookies(setCookieHeaders, domain);
		}

		// Update YouTube-specific state
		persona.updateYouTubeState();

		// Mark as used
		persona.markUsed();

		this.stats.totalRequests++;
	}

	/**
	 * Get YouTube-specific statistics
	 * @returns {object}
	 */
	getYouTubeStats() {
		const personas = this.getActivePersonas();
		const cookieStats = {};

		for (const name of this.cookieNames) {
			const count = personas.filter(p => p.cookies.has(name)).length;
			cookieStats[name] = count;
		}

		return {
			...this.getStats(),
			cookieCoverage: cookieStats,
			averageCookiesPerPersona: personas.length > 0
				? personas.reduce((sum, p) => sum + p.cookies.size, 0) / personas.length
				: 0
		};
	}

	/**
	 * Get detailed info about all personas for debugging
	 * @returns {Array}
	 */
	getDetailedPersonaInfo() {
		return this.getActivePersonas().map(persona => ({
			id: persona.id,
			createdAt: new Date(persona.createdAt).toISOString(),
			lastUsed: new Date(persona.lastUsed).toISOString(),
			requestCount: persona.requestCount,
			cookies: persona.getYouTubeCookieStatus()
		}));
	}
}
