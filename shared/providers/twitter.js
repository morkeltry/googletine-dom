// Twitter/X provider implementation
// Handles Twitter-specific cookie management and request preparation

import { Persona } from '../personas/Persona.js';
import { PersonaManager } from '../personas/PersonaManager.js';

/**
 * Twitter-specific Persona
 */
export class TwitterPersona extends Persona {
	constructor(options = {}) {
		super({
			provider: 'twitter',
			...options
		});

		// Twitter-specific state
		this.state = {
			authenticated: false,
			guestToken: null,
			csrfToken: null,
			...options.state
		};
	}

	/**
	 * Get headers specifically for Twitter requests
	 * @returns {object} Headers object
	 */
	getRequestHeaders() {
		const domain = 'twitter.com'; // or x.com
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
	 * Get Twitter-specific cookie info
	 * @returns {object} Twitter cookie status
	 */
	getTwitterCookieStatus() {
		return {
			auth_token: this.cookies.get('auth_token')?.value?.substring(0, 30) || null,
			twid: this.cookies.get('twid')?.value || null,
			ct0: this.cookies.get('ct0')?.value || null,
			guest_id: this.cookies.get('guest_id')?.value?.substring(0, 30) || null
		};
	}
}

/**
 * Twitter-specific PersonaManager
 */
export class TwitterPersonaManager extends PersonaManager {
	constructor(options = {}) {
		super({
			providerId: 'twitter',
			maxPersonas: options.maxPersonas || 5, // Twitter may be stricter
			rotationStrategy: options.rotationStrategy || 'round-robin',
			...options
		});

		this.cookieNames = [
			'auth_token',
			'twid',
			'ct0',
			'guest_id',
			'kdt',
			'twitter_sess'
		];
	}

	/**
	 * Create a new Twitter persona
	 * @param {object} options - Persona options
	 * @returns {TwitterPersona}
	 */
	createPersona(options = {}) {
		const persona = new TwitterPersona(options);

		this.personas.set(persona.id, persona);
		this.stats.totalPersonasCreated++;

		return persona;
	}

	/**
	 * Update a Twitter persona after a request
	 * @param {string} personaId - ID of persona to update
	 * @param {object} response - Response object
	 * @param {string} domain - Domain (default: twitter.com)
	 */
	updatePersona(personaId, response, domain = 'twitter.com') {
		const persona = this.personas.get(personaId);
		if (!persona) return;

		const setCookieHeaders = response.headers?.getSetCookie();
		if (setCookieHeaders) {
			persona.updateCookies(setCookieHeaders, domain);
		}

		persona.markUsed();
		this.stats.totalRequests++;
	}

	/**
	 * Get Twitter-specific statistics
	 * @returns {object}
	 */
	getTwitterStats() {
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
	 * Get detailed info about all personas
	 * @returns {Array}
	 */
	getDetailedPersonaInfo() {
		return this.getActivePersonas().map(persona => ({
			id: persona.id,
			createdAt: new Date(persona.createdAt).toISOString(),
			lastUsed: new Date(persona.lastUsed).toISOString(),
			requestCount: persona.requestCount,
			cookies: persona.getTwitterCookieStatus()
		}));
	}
}
