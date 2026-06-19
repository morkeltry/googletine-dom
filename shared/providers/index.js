// Provider exports
// Central export point for all provider implementations

export {
	Persona,
	PersonaManager
} from '../personas/Persona.js';

export {
	YouTubePersona,
	YouTubePersonaManager
} from './youtube.js';

export {
	TwitterPersona,
	TwitterPersonaManager
} from './twitter.js';

/**
 * Create a persona manager for a specific provider
 * @param {string} provider - Provider name ('youtube', 'twitter', etc.)
 * @param {object} options - Manager options
 * @returns {PersonaManager}
 */
export async function createPersonaManager(provider, options = {}) {
	switch (provider.toLowerCase()) {
		case 'youtube':
		case 'www.youtube.com':
			const { YouTubePersonaManager } = await import('./youtube.js');
			return new YouTubePersonaManager(options);

		case 'twitter':
		case 'x.com':
			const { TwitterPersonaManager } = await import('./twitter.js');
			return new TwitterPersonaManager(options);

		default:
			const { PersonaManager } = await import('../personas/Persona.js');
			return new PersonaManager({ providerId: provider, ...options });
	}
}
