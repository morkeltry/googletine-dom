// Base Persona class - represents a single user identity with cookies and state

/**
 * Represents a single user persona with cookies, headers, and state
 * Can be extended by provider-specific implementations
 */
export class Persona {
	constructor(options = {}) {
		this.id = options.id || this.generateId();
		this.name = options.name || null;
		this.provider = options.provider || 'generic';
		this.createdAt = options.createdAt || Date.now();
		this.lastUsed = options.lastUsed || Date.now();
		this.requestCount = options.requestCount || 0;
		this.status = options.status || 'active'; // active, disabled, expired

		// Cookie storage (Map of cookie name -> { value, attributes, domain })
		this.cookies = new Map(options.cookies || []);

		// Custom headers for this persona
		this.headers = options.headers || {};

		// Provider-specific state
		this.state = options.state || {};
	}

	generateId() {
		return `persona-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Get cookies as a Cookie header string for a specific domain
	 * @param {string} domain - Domain to get cookies for (e.g., 'youtube.com')
	 * @returns {string} Cookie header value
	 */
	getCookieHeader(domain) {
		const domainCookies = [];

		for (const [key, cookie] of this.cookies.entries()) {
			// Check if cookie is valid for this domain
			if (this.isCookieValidForDomain(cookie, domain)) {
				domainCookies.push(`${cookie.name}=${cookie.value}`);
			}
		}

		return domainCookies.join('; ');
	}

	/**
	 * Check if a cookie is valid for a given domain
	 * @param {object} cookie - Cookie object
	 * @param {string} domain - Domain to check
	 * @returns {boolean}
	 */
	isCookieValidForDomain(cookie, domain) {
		if (!cookie.domain) {
			// No domain specified = cookie only valid for exact domain of request
			return true;
		}

		const cookieDomain = cookie.domain.startsWith('.')
			? cookie.domain.substring(1)
			: cookie.domain;

		// Check if domain matches or is a subdomain
		return domain === cookieDomain || domain.endsWith(`.${cookieDomain}`);
	}

	/**
	 * Update cookies from a response's Set-Cookie headers
	 * @param {Array|string} setCookieHeaders - Set-Cookie header(s) from response
	 * @param {string} domain - Domain these cookies are from
	 */
	updateCookies(setCookieHeaders, domain) {
		if (!setCookieHeaders) return;

		const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

		for (const header of headers) {
			const cookie = this.parseSetCookie(header);
			if (cookie && cookie.name) {
				// Store with domain info
				cookie.domain = this.extractDomainFromAttributes(cookie.attributes, domain);
				this.cookies.set(cookie.name, cookie);
			}
		}
	}

	/**
	 * Parse a Set-Cookie header string
	 * @param {string} header - Set-Cookie header value
	 * @returns {object|null} Parsed cookie object
	 */
	parseSetCookie(header) {
		if (!header) return null;

		const parts = header.split(';').map(s => s.trim());
		const [nameValue, ...attrs] = parts;

		if (!nameValue || !nameValue.includes('=')) return null;

		const [name, ...valueParts] = nameValue.split('=');
		const value = valueParts.join('=');

		const cookie = {
			name: name.trim(),
			value: value.trim(),
			attributes: []
		};

		// Parse attributes
		for (const attr of attrs) {
			const [attrName, attrValue] = attr.split('=');
			if (attrName) {
				if (attrName.toLowerCase() === 'domain') {
					cookie.domain = attrValue;
				} else if (attrName.toLowerCase() === 'expires' || attrName.toLowerCase() === 'max-age') {
					cookie.expires = attrValue;
				} else if (attrName.toLowerCase() === 'path') {
					cookie.path = attrValue;
				} else if (attrName.toLowerCase() === 'secure') {
					cookie.secure = true;
				} else if (attrName.toLowerCase() === 'httponly') {
					cookie.httpOnly = true;
				} else if (attrName.toLowerCase() === 'samesite') {
					cookie.sameSite = attrValue;
				} else {
					cookie.attributes.push(attr);
				}
			}
		}

		return cookie;
	}

	/**
	 * Extract domain from cookie attributes
	 * @param {Array} attributes - Cookie attributes
	 * @param {string} defaultDomain - Default domain from URL
	 * @returns {string} Domain for cookie
	 */
	extractDomainFromAttributes(attributes, defaultDomain) {
		for (const attr of attributes) {
			if (attr.toLowerCase().startsWith('domain=')) {
				return attr.substring(7);
			}
		}
		return defaultDomain;
	}

	/**
	 * Mark persona as used
	 */
	markUsed() {
		this.lastUsed = Date.now();
		this.requestCount++;
	}

	/**
	 * Check if persona is expired
	 * @param {number} maxAge - Maximum age in milliseconds (default: 24 hours)
	 * @returns {boolean}
	 */
	isExpired(maxAge = 86400000) {
		return (Date.now() - this.createdAt) > maxAge;
	}

	/**
	 * Get persona info (safe for logging/export)
	 * @returns {object}
	 */
	toJSON() {
		return {
			id: this.id,
			provider: this.provider,
			createdAt: this.createdAt,
			lastUsed: this.lastUsed,
			requestCount: this.requestCount,
			status: this.status,
			cookieCount: this.cookies.size,
			customHeaders: Object.keys(this.headers),
			stateKeys: Object.keys(this.state)
		};
	}

	/**
	 * Get detailed cookie info for debugging
	 * @returns {Array}
	 */
	getCookieInfo() {
		return Array.from(this.cookies.values()).map(cookie => ({
			name: cookie.name,
			value: cookie.value.substring(0, 50) + (cookie.value.length > 50 ? '...' : ''),
			domain: cookie.domain,
			secure: cookie.secure || false,
			httpOnly: cookie.httpOnly || false
		}));
	}
}

// Simple UUID generator (replace with uuid package in production)
function generateId() {
	return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
