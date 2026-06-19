// PersonaManager - manages a pool of user personas

import { Persona } from './Persona.js';

/**
 * Manages a pool of personas for request routing
 * Base class that can be extended by provider-specific implementations
 */
export class PersonaManager {
	constructor(options = {}) {
		this.providerId = options.providerId || 'generic';
		this.maxPersonas = options.maxPersonas || 10;
		this.maxPersonaAge = options.maxPersonaAge || 86400000; // 24 hours
		this.rotationStrategy = options.rotationStrategy || 'round-robin'; // round-robin, random, least-recently-used

		// Persona storage
		this.personas = new Map();
		this.currentPersonaIndex = 0;

		// Statistics
		this.stats = {
			totalRequests: 0,
			totalPersonasCreated: 0,
			rotationCount: 0
		};
	}

	/**
	 * Get or create a persona for a request
	 * @param {object} options - Options for persona selection
	 * @returns {Promise<Persona>}
	 */
	async getPersona(options = {}) {
		// Filter active personas
		const activePersonas = this.getActivePersonas();

		if (activePersonas.length === 0) {
			// No active personas, create a new one
			return await this.createPersona(options);
		}

		// Select persona based on rotation strategy
		const persona = this.selectPersona(activePersonas, options);
		this.stats.rotationCount++;

		return persona;
	}

	/**
	 * Select a persona based on rotation strategy
	 * @param {Array} personas - Active personas to choose from
	 * @param {object} options - Selection options
	 * @returns {Persona}
	 */
	selectPersona(personas, options = {}) {
		switch (this.rotationStrategy) {
			case 'random':
				return personas[Math.floor(Math.random() * personas.length)];

			case 'least-recently-used':
				return personas.reduce((oldest, current) =>
					current.lastUsed < oldest.lastUsed ? current : oldest
				);

			case 'round-robin':
			default:
				const persona = personas[this.currentPersonaIndex % personas.length];
				this.currentPersonaIndex++;
				return persona;
		}
	}

	/**
	 * Create a new persona
	 * @param {object} options - Persona creation options
	 * @returns {Persona}
	 */
	createPersona(options = {}) {
		// Enforce max personas limit
		if (this.personas.size >= this.maxPersonas) {
			this.cleanupExpiredPersonas();
		}

		if (this.personas.size >= this.maxPersonas) {
			// Still at max, remove oldest
			this.removeOldestPersona();
		}

		const persona = new Persona({
			provider: this.providerId,
			...options
		});

		this.personas.set(persona.id, persona);
		this.stats.totalPersonasCreated++;

		return persona;
	}

	/**
	 * Update a persona after a request
	 * @param {string} personaId - ID of persona to update
	 * @param {object} response - Response object with cookies
	 * @param {string} domain - Domain the request was made to
	 */
	updatePersona(personaId, response, domain) {
		const persona = this.personas.get(personaId);
		if (!persona) return;

		// Update cookies from Set-Cookie headers
		const setCookieHeaders = response.headers?.getSetCookie();
		if (setCookieHeaders) {
			persona.updateCookies(setCookieHeaders, domain);
		}

		// Mark as used
		persona.markUsed();

		this.stats.totalRequests++;
	}

	/**
	 * Get active (non-expired) personas
	 * @returns {Array}
	 */
	getActivePersonas() {
		const now = Date.now();
		const active = [];

		for (const persona of this.personas.values()) {
			if (persona.status === 'active' && !persona.isExpired(this.maxPersonaAge)) {
				active.push(persona);
			}
		}

		return active;
	}

	/**
	 * Remove expired personas
	 */
	cleanupExpiredPersonas() {
		const now = Date.now();
		const expired = [];

		for (const [id, persona] of this.personas.entries()) {
			if (persona.isExpired(this.maxPersonaAge) || persona.status !== 'active') {
				expired.push(id);
			}
		}

		for (const id of expired) {
			this.personas.delete(id);
		}

		return expired.length;
	}

	/**
	 * Remove the oldest persona
	 */
	removeOldestPersona() {
		let oldestId = null;
		let oldestTime = Infinity;

		for (const [id, persona] of this.personas.entries()) {
			if (persona.createdAt < oldestTime) {
				oldestTime = persona.createdAt;
				oldestId = id;
			}
		}

		if (oldestId) {
			this.personas.delete(oldestId);
		}
	}

	/**
	 * Get persona by ID
	 * @param {string} id - Persona ID
	 * @returns {Persona|null}
	 */
	getPersonaById(id) {
		return this.personas.get(id) || null;
	}

	/**
	 * Get all personas
	 * @returns {Array}
	 */
	getAllPersonas() {
		return Array.from(this.personas.values());
	}

	/**
	 * Get manager statistics
	 * @returns {object}
	 */
	getStats() {
		return {
			...this.stats,
			activePersonas: this.getActivePersonas().length,
			totalPersonas: this.personas.size,
			provider: this.providerId
		};
	}

	/**
	 * Get all personas
	 * @returns {Array}
	 */
	getAllPersonas() {
		return Array.from(this.personas.values());
	}

	/**
	 * Reset the manager (clear all personas)
	 */
	reset() {
		this.personas.clear();
		this.currentPersonaIndex = 0;
		this.stats = {
			totalRequests: 0,
			totalPersonasCreated: 0,
			rotationCount: 0
		};
	}
}
