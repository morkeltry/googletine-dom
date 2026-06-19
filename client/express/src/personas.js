// Main request forwarder for googletine client
// Forwards browser requests to remote nodes and handles payment

import { doPayment } from '../../../shared/payments/stub.js';
import { isPaymentRequired, parsePaymentRequestHeaders, createPaymentHeaders } from '../../../shared/payments/headers.js';
import { YouTubePersona } from '../../../shared/providers/youtube.js';
import { constants } from '../constants.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { googletineNodes } = constants;

// Get preferred remote node (simple round-robin for now)
let currentNodeIndex = 0;
const getRemoteNode = () => {
	const node = googletineNodes[currentNodeIndex];
	currentNodeIndex = (currentNodeIndex + 1) % googletineNodes.length;
	return node;
};

// YouTube persona management
let youtubePersonas = [];
let lastYouTubePersonaIndex = 0;
const PERSONA_DB = join(__dirname, '../../server/data', '.googletine-db.json');

// Load YouTube personas from database
const loadYouTubePersonas = () => {
	if (existsSync(PERSONA_DB)) {
		try {
			const data = JSON.parse(readFileSync(PERSONA_DB, 'utf8'));
			const personas = data.personas || [];
			const youtube = personas.filter(p => p.provider === 'youtube');

			// Reconstruct YouTubePersona objects
			youtubePersonas = youtube.map(personaData => new YouTubePersona(personaData));

			console.log(`Loaded ${youtubePersonas.length} YouTube personas for rotation`);
		} catch (err) {
			console.error('Error loading personas:', err.message);
			youtubePersonas = [];
		}
	} else {
		console.log('No persona database found, using none');
		youtubePersonas = [];
	}
};

// Get next YouTube persona (round-robin)
const getNextYouTubePersona = () => {
	if (youtubePersonas.length === 0) {
		console.log('No YouTube personas available, request will use server-default persona');
		return null;
	}

	// Move to next persona (round-robin)
	lastYouTubePersonaIndex = (lastYouTubePersonaIndex + 1) % youtubePersonas.length;
	const persona = youtubePersonas[lastYouTubePersonaIndex];

	console.log(`Using YouTube persona ${lastYouTubePersonaIndex + 1}/${youtubePersonas.length}: ${persona.name || persona.id}`);
	return persona;
};

// Check if URL is for YouTube
const isYouTubeUrl = (url) => {
	return url.includes('youtube.com') || url.includes('youtu.be');
};

// Load personas on startup
loadYouTubePersonas();

// Export functions for use in forwardRequest.js
export { loadYouTubePersonas, getNextYouTubePersona, isYouTubeUrl };
