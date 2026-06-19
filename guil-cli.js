#!/usr/bin/env node
// Googletine CLI - Persona management interface

import { YouTubePersona, YouTubePersonaManager } from './shared/providers/youtube.js';
import { TwitterPersona, TwitterPersonaManager } from './shared/providers/twitter.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Persistent storage for personas (in server/data directory)
const STORAGE_FILE = join(__dirname, 'server/data', '.googletine-db.json');

// Server configuration
const SERVER_URL = process.env.GOOGLETINE_SERVER_URL || 'http://localhost:7070';

// Verbosity configuration storage
const CONFIG_FILE = join(__dirname, '.googletine-config.json');

// Load or create config
const loadConfig = () => {
	if (existsSync(CONFIG_FILE)) {
		try {
			return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
		} catch (err) {
			console.error('Error loading config:', err.message);
		}
	}
	return { verbosity: 'titles' };
};

// Save config
const saveConfig = (config) => {
	writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
};

// Get current verbosity
const getVerbosity = () => {
	const config = loadConfig();
	return config.verbosity || 'titles';
};

// Load personas from storage
const loadPersonas = () => {
	if (existsSync(STORAGE_FILE)) {
		try {
			const data = JSON.parse(readFileSync(STORAGE_FILE, 'utf8'));
			return data.personas || [];
		} catch (err) {
			console.error('Error loading storage:', err.message);
			return [];
		}
	}
	return [];
};

// Save personas to storage
const savePersonas = (personas) => {
	const data = { personas, version: 1, lastSaved: Date.now() };
	writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
};

// Create a manager from stored personas
const createManagerFromStorage = (provider) => {
	const personas = loadPersonas();
	const providerPersonas = personas.filter(p => p.provider === provider);

	let manager;
	switch (provider) {
		case 'youtube':
			manager = new YouTubePersonaManager();
			break;
		case 'twitter':
			manager = new TwitterPersonaManager();
			break;
		default:
			console.error(`Unknown provider: ${provider}`);
			return null;
	}

	// Reconstruct personas from storage
	for (const personaData of providerPersonas) {
		let persona;
		switch (provider) {
			case 'youtube':
				persona = new YouTubePersona(personaData);
				break;
			case 'twitter':
				persona = new TwitterPersona(personaData);
				break;
			default:
				persona = new YouTubePersona(personaData);
		}
		manager.personas.set(persona.id, persona);
	}

	return manager;
};

// Save a manager's personas to storage
const saveManagerPersonas = (manager) => {
	const allPersonas = loadPersonas();
	const provider = manager.providerId;
	const filteredPersonas = allPersonas.filter(p => p.provider !== provider);

	for (const persona of manager.personas.values()) {
		filteredPersonas.push({
			id: persona.id,
			provider: persona.provider,
			name: persona.name,
			createdAt: persona.createdAt,
			lastUsed: persona.lastUsed,
			requestCount: persona.requestCount,
			status: persona.status,
			cookies: Array.from(persona.cookies.entries()),
			state: persona.state
		});
	}

	savePersonas(filteredPersonas);
};

// Create a new persona by making a search request
const createPersona = async (provider, searchTerm, name) => {
	const manager = createManagerFromStorage(provider);
	if (!manager) {
		console.error(`Failed to get manager for provider: ${provider}`);
		return false;
	}

	console.log(`Creating ${provider} persona for search: "${searchTerm}"`);

	try {
		const persona = await manager.createPersona({ name: name || searchTerm });

		let searchUrl;
		switch (provider) {
			case 'youtube':
				searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerm)}`;
				break;
			case 'twitter':
				searchUrl = `https://twitter.com/search?q=${encodeURIComponent(searchTerm)}`;
				break;
			default:
				console.error(`No search URL configured for provider: ${provider}`);
				return false;
		}

		console.log(`Fetching: ${searchUrl}`);
		const headers = persona.getRequestHeaders();
		const response = await fetch(searchUrl, { headers });

		if (!response.ok) {
			console.error(`Search failed: ${response.status} ${response.statusText}`);
			return false;
		}

		manager.updatePersona(persona.id, response, new URL(searchUrl).hostname);
		saveManagerPersonas(manager);

		console.log(`\n✓ Persona created successfully!`);
		console.log(`  ID: ${persona.id}`);
		console.log(`  Name: ${name || searchTerm}`);
		console.log(`  Provider: ${provider}`);
		console.log(`  Cookies received: ${persona.cookies.size}`);

		if (provider === 'youtube') {
			const cookieStatus = persona.getYouTubeCookieStatus();
			console.log(`  Key cookies:`);
			for (const [key, value] of Object.entries(cookieStatus)) {
				if (value) {
					const display = typeof value === 'string' ? value.substring(0, 30) + '...' : value;
					console.log(`    ${key}: ${display}`);
				}
			}
		}

		// Reload server to pick up new persona
		await reloadServerPersonas();

		return true;
	} catch (err) {
		console.error(`Error creating persona: ${err.message}`);
		return false;
	}
};

// Reload server's persona database
const reloadServerPersonas = async () => {
	try {
		console.log('Reloading server personas...');
		const response = await fetch(`${SERVER_URL}/personas/reload`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		});

		if (response.ok) {
			const result = await response.json();
			console.log(`✓ ${result.message}`);
		} else {
			console.log(`Note: Server may not be running (got ${response.status})`);
		}
	} catch (err) {
		console.log(`Note: Server may not be running (${err.message})`);
	}
};

// List all personas or a specific one
const listPersonas = (provider, personaId) => {
	const personas = loadPersonas();

	if (provider) {
		const providerPersonas = personas.filter(p => p.provider === provider);

		if (personaId) {
			const persona = providerPersonas.find(p => p.id === personaId);
			if (!persona) {
				console.error(`Persona not found: ${personaId}`);
				return;
			}

			console.log(`\nPersona Details:`);
			console.log(`  ID: ${persona.id}`);
			console.log(`  Provider: ${persona.provider}`);
			console.log(`  Name: ${persona.name || 'unnamed'}`);
			console.log(`  Status: ${persona.status}`);
			console.log(`  Created: ${new Date(persona.createdAt).toISOString()}`);
			console.log(`  Last Used: ${new Date(persona.lastUsed).toISOString()}`);
			console.log(`  Requests: ${persona.requestCount}`);
			console.log(`  Cookies: ${persona.cookies.length}`);

			if (persona.cookies.length > 0) {
				console.log(`\n  Cookies:`);
				for (const [key, cookie] of persona.cookies) {
					const value = cookie[1].value.substring(0, 40) + (cookie[1].value.length > 40 ? '...' : '');
					console.log(`    ${cookie[0]}: ${value}`);
				}
			}
		} else {
			if (providerPersonas.length === 0) {
				console.log(`No personas found for provider: ${provider}`);
				return;
			}

			console.log(`\nPersonas for ${provider} (${providerPersonas.length} total):\n`);

			for (const persona of providerPersonas) {
				console.log(`  ${persona.id}`);
				console.log(`    Name: ${persona.name || 'unnamed'}`);
				console.log(`    Status: ${persona.status}`);
				console.log(`    Created: ${new Date(persona.createdAt).toISOString()}`);
				console.log(`    Requests: ${persona.requestCount}`);
				console.log(`    Cookies: ${persona.cookies.length}`);
				console.log('');
			}
		}
	} else {
		const providers = [...new Set(personas.map(p => p.provider))];

		if (providers.length === 0) {
			console.log('No personas found.');
			return;
		}

		console.log(`\nAll Providers (${providers.length} total):\n`);

		for (const prov of providers) {
			const provPersonas = personas.filter(p => p.provider === prov);
			console.log(`  ${prov}:`);
			console.log(`    Total Personas: ${provPersonas.length}`);
			const totalRequests = provPersonas.reduce((sum, p) => sum + (p.requestCount || 0), 0);
			console.log(`    Total Requests: ${totalRequests}`);
			console.log('');
		}
	}
};

// Delete a persona
const deletePersona = async (provider, personaId) => {
	const allPersonas = loadPersonas();
	const personaIndex = allPersonas.findIndex(p => p.provider === provider && p.id === personaId);

	if (personaIndex === -1) {
		console.error(`Persona not found: ${personaId}`);
		return;
	}

	allPersonas.splice(personaIndex, 1);
	savePersonas(allPersonas);

	console.log(`✓ Deleted persona: ${personaId}`);

	// Reload server to pick up deletion
	await reloadServerPersonas();
};

// Show stats
const showStats = (provider) => {
	const personas = loadPersonas();

	if (provider) {
		const providerPersonas = personas.filter(p => p.provider === provider);

		console.log(`\nStats for ${provider}:`);
		console.log(`  Total Personas: ${providerPersonas.length}`);
		console.log(`  Active Personas: ${providerPersonas.filter(p => p.status === 'active').length}`);
		console.log(`  Total Requests: ${providerPersonas.reduce((sum, p) => sum + (p.requestCount || 0), 0)}`);

		if (providerPersonas.length > 0) {
			console.log(`\n  Cookie Coverage:`);
			const cookieNames = ['CONSENT', 'VISITOR_INFO1_LIVE', 'YSC', '__Secure-YEC', '__Secure-YENID'];
			for (const name of cookieNames) {
				const count = providerPersonas.filter(p =>
					p.cookies.some(([key]) => key === name)
				).length;
				console.log(`    ${name}: ${count}/${providerPersonas.length}`);
			}
		}
	} else {
		const providers = [...new Set(personas.map(p => p.provider))];

		console.log(`\nOverall Stats:`);
		console.log(`  Total Personas: ${personas.length}`);
		console.log(`  Providers: ${providers.length}`);

		for (const prov of providers) {
			const provPersonas = personas.filter(p => p.provider === prov);
			console.log(`\n  ${prov}:`);
			console.log(`    Personas: ${provPersonas.length}`);
			console.log(`    Requests: ${provPersonas.reduce((sum, p) => sum + (p.requestCount || 0), 0)}`);
		}
	}
};

// Extract video titles from YouTube HTML
const extractYouTubeTitles = (html) => {
	const titles = [];
	const ytDataMatch = html.match(/var ytInitialData = ({.+?});<\/script>/);

	if (!ytDataMatch) return titles;

	try {
		const ytData = JSON.parse(ytDataMatch[1]);
		const contents = ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;

		if (!contents) return titles;

		const findTitles = (obj, depth = 0) => {
			if (depth > 10) return;
			if (Array.isArray(obj)) {
				for (const item of obj) {
					findTitles(item, depth + 1);
				}
			} else if (obj && typeof obj === 'object') {
				if (obj.title?.runs) {
					for (const run of obj.title.runs) {
						if (run.text && typeof run.text === 'string' && run.text.length > 10) {
							if (!titles.includes(run.text)) {
								titles.push(run.text);
							}
						}
					}
				}
				for (const value of Object.values(obj)) {
					findTitles(value, depth + 1);
				}
			}
		};

		findTitles(contents);
	} catch (e) {
		// Silently fail
	}

	return titles;
};

// Make a request using a specific persona via the running server
const makeRequest = async (provider, personaId, searchTerm) => {
	const personas = loadPersonas();
	const persona = personas.find(p => p.provider === provider && p.id === personaId);

	if (!persona) {
		console.error(`Persona not found: ${personaId}`);
		console.error(`Use 'list ${provider}' to see available personas`);
		return false;
	}

	const verbosity = getVerbosity();
	console.log(`Making ${provider} request using persona: ${persona.name || persona.id}`);
	console.log(`Search term: "${searchTerm}"`);
	console.log(`Verbosity: ${verbosity}`);
	console.log(`Connecting to server: ${SERVER_URL}\n`);

	try {
		let searchUrl;
		switch (provider) {
			case 'youtube':
				searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerm)}`;
				break;
			case 'twitter':
				searchUrl = `https://twitter.com/search?q=${encodeURIComponent(searchTerm)}`;
				break;
			default:
				console.error(`No search URL configured for provider: ${provider}`);
				return false;
		}

		const response = await fetch(`${SERVER_URL}/request`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				url: searchUrl,
				payment: { success: true, transactionId: `cli-${Date.now()}`, amount: 1000 },
				personaId: personaId
			})
		});

		if (!response.ok) {
			if (response.status === 402) {
				console.error(`Payment required (402) - server may not be running or payment validation failed`);
				return false;
			}
			console.error(`Request failed: ${response.status} ${response.statusText}`);
			return false;
		}

		const text = await response.text();

		switch (verbosity) {
			case 'titles':
				console.log(`\n📺 Video Titles:`);
				const titles = extractYouTubeTitles(text);
				if (titles.length === 0) {
					console.log('  No titles found');
				} else {
					titles.slice(0, 20).forEach((title, i) => {
						console.log(`  ${i + 1}. ${title}`);
					});
					if (titles.length > 20) {
						console.log(`  ... and ${titles.length - 20} more`);
					}
				}
				break;

			case 'html':
				console.log(`\n📄 HTML Response (${text.length} bytes):`);
				console.log(text.substring(0, 2000));
				if (text.length > 2000) {
					console.log(`\n... (${text.length - 2000} more bytes)`);
				}
				break;

			case 'full':
				console.log(`\n📄 Full HTML Response (${text.length} bytes):`);
				console.log(text);
				break;

			case 'stats':
				console.log(`\n📊 Response Statistics:`);
				console.log(`  Size: ${text.length} bytes`);
				console.log(`  Lines: ${text.split('\n').length}`);
				const titlesCount = extractYouTubeTitles(text).length;
				console.log(`  Titles found: ${titlesCount}`);
				console.log(`  Preview: ${text.substring(0, 100)}...`);
				break;

			case 'json':
				const ytDataMatch = text.match(/var ytInitialData = ({.+?});<\/script>/);
				if (ytDataMatch) {
					try {
						const ytData = JSON.parse(ytDataMatch[1]);
						console.log(`\n📋 YouTube Data (JSON):`);
						console.log(JSON.stringify(ytData, null, 2).substring(0, 3000));
						if (JSON.stringify(ytData).length > 3000) {
							console.log(`\n... (truncated)`);
						}
					} catch (e) {
						console.log('Could not parse YouTube data');
					}
				} else {
					console.log('No structured data found in response');
				}
				break;

			default:
				console.log(`Unknown verbosity: ${verbosity}`);
				return false;
		}

		persona.lastUsed = Date.now();
		persona.requestCount = (persona.requestCount || 0) + 1;
		saveManagerPersonas(createManagerFromStorage(provider));

		console.log(`\n✓ Request completed successfully`);
		console.log(`  Response size: ${text.length} bytes`);
		console.log(`  Persona ${persona.name || persona.id} now has ${persona.requestCount} requests`);

		return true;

	} catch (err) {
		console.error(`Error making request: ${err.message}`);
		if (err.message.includes('ECONNREFUSED')) {
			console.error(`\nIs the server running? Start it with: npm run start-server`);
		}
		return false;
	}
};

// Show or change configuration
const configCommand = (key, value) => {
	const config = loadConfig();

	if (!key) {
		console.log('\n📋 Current Configuration:\n');
		console.log(`  verbosity: ${config.verbosity}`);
		console.log(`  server: ${SERVER_URL}`);
		console.log('\nVerbosity levels:');
		console.log('  - titles   : Show video titles (default)');
		console.log('  - html     : Show HTML preview (2KB)');
		console.log('  - full     : Show full HTML response');
		console.log('  - stats    : Show response statistics');
		console.log('  - json     : Show structured YouTube data');
		console.log('\nUsage: npm run persona -- config <key> <value>');
		console.log('Example: npm run persona -- config verbosity json');
		return;
	}

	if (key === 'verbosity') {
		const validLevels = ['titles', 'html', 'full', 'stats', 'json'];
		if (!value || !validLevels.includes(value)) {
			console.error(`Invalid verbosity level: ${value || '(empty)'}`);
			console.error(`Valid levels: ${validLevels.join(', ')}`);
			return;
		}
		config.verbosity = value;
		saveConfig(config);
		console.log(`✓ Verbosity set to: ${value}`);
	} else {
		console.error(`Unknown config key: ${key}`);
		console.error(`Supported keys: verbosity`);
	}
};

// Show help
const showHelp = () => {
	console.log(`
Googletine CLI - Persona Management & Request Proxy

Commands:
  create <provider> <search-term> [name]
      Create a new persona by searching for the given term
      Provider: youtube, twitter
      Name: optional, defaults to search term

  list [provider] [persona-id]
      List personas. If provider is given, lists personas for that provider.
      If persona-id is also given, shows details for that specific persona.

  request <provider> <persona-id> <search-term>
      Make a search request using a specific persona via the running server.
      Requires: npm run start-server (or server must be running)

  config [key] [value]
      View or change configuration.
      Keys: verbosity (titles|html|full|stats|json)
      Example: npm run persona -- config verbosity json

  delete <provider> <persona-id>
      Delete a specific persona

  stats [provider]
      Show statistics. If provider is given, shows stats for that provider only.

  help
      Show this help message

Verbosity Levels (for request command):
  titles   - Show video titles (default)
  html     - Show HTML preview (2KB)
  full     - Show full HTML response
  stats    - Show response statistics
  json     - Show structured YouTube data

Examples:
  npm run persona -- create youtube "pigs" "Pig Research"
  npm run persona -- list youtube
  npm run persona -- request youtube persona-123 "funny cats"
  npm run persona -- config verbosity json
  npm run persona -- delete youtube persona-1234567890-abc
  npm run persona -- stats youtube
`);
};

// Main CLI handler
const main = async () => {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		showHelp();
		return;
	}

	const command = args[0].toLowerCase();

	switch (command) {
		case 'create':
			if (args.length < 3) {
				console.error('Usage: create <provider> <search-term> [name]');
				return;
			}
			await createPersona(args[1], args[2], args[3]);
			break;

		case 'list':
			listPersonas(args[1], args[2]);
			break;

		case 'request':
			if (args.length < 4) {
				console.error('Usage: request <provider> <persona-id> <search-term>');
				return;
			}
			await makeRequest(args[1], args[2], args[3]);
			break;

		case 'config':
			configCommand(args[1], args[2]);
			break;

		case 'delete':
			if (args.length < 3) {
				console.error('Usage: delete <provider> <persona-id>');
				return;
			}
			await deletePersona(args[1], args[2]);
			break;

		case 'stats':
			showStats(args[1]);
			break;

		case 'help':
		case '--help':
		case '-h':
			showHelp();
			break;

		default:
			console.error(`Unknown command: ${command}`);
			showHelp();
	}
};

main().catch(err => {
	console.error('Error:', err);
	process.exit(1);
});
