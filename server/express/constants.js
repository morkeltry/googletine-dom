// Server constants for googletine

const constants = {
	// Available service modules
	availableModules: [
		'youtube-dl',
		'custom-headers',
		'cookie-injection'
	],

	// Site cookies for loginwall bypass
	siteCookies: {
		medium: {
			cookie: 'accessToken=1234abc; userId=1234'
		},
		twitter: {
			cookie: 'auth_token=xyz; ct0=abc'
		}
	},

	// Server configuration
	port: process.env.GOOGLETINE_SERVER_PORT || 7070,

	// Pricing configuration (can be overridden)
	basePrice: 1000,
	pricePerUrlChar: 10
};

// Add default entry for modules
constants.availableModules.forEach(mod => {
	constants.availableModules[mod] = { some: 'config-data' };
});

export { constants };
