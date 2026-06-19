// YouTube Consent Flow Automation
// This script automates clicking "Accept & Continue" on YouTube homepage with no cookies
// and captures what happens (cookies, screenshots, network activity)

import puppeteer from 'puppeteer';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'output');

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
	mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('YouTube Consent Flow Automation');
console.log('============================\n');

// Function to take screenshot
async function takeScreenshot(page, name, description) {
	const filename = `${name}.png`;
	const filepath = join(OUTPUT_DIR, filename);
	await page.screenshot({ path: filepath, fullPage: true });
	console.log(`📸 Screenshot saved: ${filename} - ${description}`);
	return filepath;
}

// Function to get all cookies
async function captureCookies(page, stepName) {
	const cookies = await page.cookies();
	const cookieFile = join(OUTPUT_DIR, `${stepName}-cookies.json`);
	writeFileSync(cookieFile, JSON.stringify(cookies, null, 2));
	console.log(`🍪 Cookies captured: ${cookies.length} cookies -> ${stepName}-cookies.json`);

	// Log key cookies
	const keyCookies = ['CONSENT', 'VISITOR_INFO1_LIVE', 'YSC', '__Secure-YEC', '__Secure-YENID', 'VISITOR_PRIVACY_METADATA'];
	console.log('   Key cookies:');
	keyCookies.forEach(name => {
		const cookie = cookies.find(c => c.name === name);
		if (cookie) {
			const value = cookie.value.substring(0, 30) + (cookie.value.length > 30 ? '...' : '');
			console.log(`     ${name}: ${value}`);
		} else {
			console.log(`     ${name}: (not set)`);
		}
	});

	return cookies;
}

// Function to get page URL
function getCurrentUrl(page) {
	return page.url();
}

// Function to log network requests
async function setupNetworkCapture(page) {
	const networkLog = join(OUTPUT_DIR, 'network-requests.json');
	const requests = [];

	await page.on('response', async (response) => {
		const request = {
			url: response.url(),
			status: response.status(),
			headers: response.headers(),
			timestamp: Date.now()
		};
		requests.push(request);
	});

	// Save network requests periodically
	setInterval(() => {
		if (requests.length > 0) {
			writeFileSync(networkLog, JSON.stringify(requests, null, 2));
		}
	}, 1000);

	return requests;
}

// Function to find and click accept buttons
async function findAndClickAcceptButton(page) {
	console.log('🔍 Looking for "Accept" or "Accept & Continue" buttons...');

	// Wait for page to load
	await page.waitForLoad({ waitUntil: 'domcontentloaded' });
	await takeScreenshot(page, '01-initial-load', 'Initial page load');

	// Common selectors for YouTube consent/accept buttons
	const selectors = [
		// YouTube specific
		'ytd-button-overlay',
		'button[aria-label*="Accept"]',
		'button[aria-label*="accept"]',
		'button:has-text("Accept")',
		'button:has-text("Accept & Continue")',
		'button:has-text("I agree")',
		'a:has-text("Accept")',
		'#yDmbB', // Specific YouTube button ID
		'.yt-core-attributed-string',
		// Generic consent buttons
		'button:has-text("Accept all")',
		'button:has-text("Accept recommended")',
		// Cookie consent overlays
	'.consent-b-button',
		'[data-consent-text]'
	];

	for (const selector of selectors) {
		try {
			console.log(`   Trying selector: ${selector}`);
			const button = await page.$(selector);

			if (button) {
				const isVisible = await button.isIntersectingViewport();
				const text = await button.evaluate(el => el.textContent || el.innerText || '').trim();

				console.log(`   Found button! Selector: ${selector}`);
				console.log(`   Text: "${text}"`);
				console.log(`   Visible: ${isVisible}`);

				if (isVisible) {
					// Scroll button into view
					await button.scrollIntoView();
					await page.waitForTimeout(500);

					// Take screenshot before clicking
					await takeScreenshot(page, '02-before-click', 'Before clicking accept button');

					// Click the button
					console.log('   Clicking button...');
					await button.click();

					// Wait for navigation or changes
					try {
						await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 });
						console.log('   ✅ Page navigated after click');
					} catch (e) {
						console.log('   ⚠️ No navigation detected (might be AJAX-based)');
					}

					// Wait a bit for any AJAX updates
					await page.waitForTimeout(2000);

					// Take screenshot after clicking
					await takeScreenshot(page, '03-after-click', 'After clicking accept button');

					return true;
				}
			}
		} catch (e) {
			// Continue to next selector
		}
	}

	console.log('❌ No "Accept" button found');
	return false;
}

// Function to look for overlay dialogs
async function checkForOverlays(page) {
	console.log('\n🔍 Checking for overlay dialogs...');

	// Common YouTube overlay selectors
	const overlaySelectors = [
		'.yt-consent-dialog',
		'[role="dialog"]',
		'.consent-b-overlay',
		'#dialog',
		'.ytd-consent-overlay',
		'.yt-popup-overlay'
	];

	for (const selector of overlaySelectors) {
		try {
			const element = await page.$(selector);
			if (element) {
				const isVisible = await element.isIntersectingViewport();
				console.log(`   Found overlay: ${selector} (visible: ${isVisible})`);

				if (isVisible) {
					const text = await element.evaluate(el => el.textContent || el.innerText || '').trim();
					const classes = await element.evaluate(el => el.className || '');

					console.log(`   Text: "${text.substring(0, 100)}"`);
					console.log(`   Classes: "${classes}"`);

					await takeScreenshot(page, `overlay-${selector.replace(/[^a-z0-9]/g, '_')}`, `Overlay found: ${selector}`);
				}
			}
		} catch (e) {
			// Continue
		}
	}
}

// Function to check for cookie banners
async function checkForCookieBanners(page) {
	console.log('\n🔍 Checking for cookie banners...');

	const bannerSelectors = [
		'.cve-cookie-banners',
		'.cookie-banner',
		'[data-cookie-banner]',
		'.ytd-cookie-banner'
	];

	for (const selector of bannerSelectors) {
		try {
			const element = await page.$(selector);
			if (element) {
				const isVisible = await element.isIntersectingViewport();
				console.log(`   Found cookie banner: ${selector} (visible: ${isVisible})`);

				if (isVisible) {
					const text = await element.evaluate(el => el.textContent || el.innerText || '').trim();
					console.log(`   Text: "${text.substring(0, 100)}..."`);

					await takeScreenshot(page, `banner-${selector.replace(/[^a-z0-9]/g, '_')}`, `Cookie banner: ${selector}`);
				}
			}
		} catch (e) {
			// Continue
		}
	}
}

// Function to get page title and URL after changes
async function captureFinalState(page) {
	console.log('\n📊 Capturing final state...');

	const title = await page.title();
	const url = page.url();
	const cookies = await page.cookies();

	console.log(`   Page Title: "${title}"`);
	console.log(`   Final URL: ${url}`);
	console.log(`   Total Cookies: ${cookies.length}`);

	// Save final state
	const finalState = {
		title,
		url,
		cookies: cookies,
		timestamp: new Date().toISOString()
	};

	const stateFile = join(OUTPUT_DIR, 'final-state.json');
	writeFileSync(stateFile, JSON.stringify(finalState, null, 2));
	console.log(`   Final state saved: final-state.json`);

	return finalState;
}

// Main automation function
async function automateConsentFlow() {
	const browser = await puppeteer.launch({
		headless: false, // Show the browser so you can watch
		defaultViewport: null,
		args: ['--start-maximized', '--disable-blink-features=1']
	});

	console.log('🌐 Launching browser...');

	try {
		const page = await browser.newPage();

		// Set up user agent to look like a real browser
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

		// Clear all cookies and cache
		await page.deleteCookie();
		await page.evaluate(() => {
			if ('clearSiteData' in window) {
				window.clearSiteData();
			}
			if ('indexedDB' in window) {
				indexedDB.deleteDatabase();
			}
		});

		console.log('🧹 Cleared all cookies and cache\n');
		console.log('📍 Navigating to YouTube.com...\n');

		// Navigate to YouTube with no cookies
		const response = await page.goto('https://www.youtube.com', {
			waitUntil: 'domcontentloaded',
			timeout: 30000
		});

		console.log(`   Status: ${response.status()}`);

		// Capture initial state
		await takeScreenshot(page, '00-youtube-loaded', 'YouTube loaded (no cookies)');
		await captureCookies(page, '01-initial');
		const initialUrl = getCurrentUrl(page);
		console.log(`   Initial URL: ${initialUrl}\n`);

		// Check for overlays and banners
		await checkForOverlays(page);
		await checkForCookieBanners(page);

		// Try to find and click accept button
		const clicked = await findAndClickAcceptButton(page);

		// Capture final state
		if (clicked) {
			await captureFinalState(page);
			console.log('\n✅ Accept flow completed successfully');
		} else {
			console.log('\n⚠️ No accept button was found - might already be accepted or different flow');
			await captureFinalState(page);
		}

		// Keep browser open for manual inspection
		console.log('\n🔍 Browser staying open for manual inspection (press Ctrl+C to exit)...');
		console.log('   Output directory: consent-automation/output/');

		// Wait for user to close browser
		await new Promise(() => {}); // Keep running until killed

	} catch (error) {
		console.error('❌ Error:', error.message);
	} finally {
		await browser.close();
		console.log('\n🏁 Browser closed');
	}
}

// Run the automation
console.log('Starting consent flow automation...\n');
automateConsentFlow().catch(err => {
	console.error('Fatal error:', err);
	process.exit(1);
});
