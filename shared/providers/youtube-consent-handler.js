// YouTube Consent Handler - Automates clicking through YouTube's consent dialog
import puppeteer from 'puppeteer';

/**
 * Find and click YouTube's consent dialog
 * @param {import('puppeteer').Page} page - Puppeteer page
 * @returns {Promise<{success: boolean, found: boolean, details: string}>}
 */
export async function handleYouTubeConsent(page) {
	console.log('🔍 Checking for YouTube consent dialog...');

	try {
		// Wait for page to load
		await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
		await new Promise(resolve => setTimeout(resolve, 2000));

		// First, try to find the tp-yt-paper-dialog element
		const dialogFound = await page.evaluate(() => {
			const dialog = document.querySelector('tp-yt-paper-dialog');
			if (!dialog) return { found: false };

			// Check if it's visible
			const styles = window.getComputedStyle(dialog);
			const isVisible = styles.display !== 'none' && styles.visibility !== 'hidden' && styles.opacity !== '0';

			// Get some identifying details
			const ariaHidden = dialog.getAttribute('aria-hidden');
			const className = dialog.className || '';
			const id = dialog.id || '';

			return {
				found: true,
				isVisible,
				ariaHidden,
				className,
				id
			};
		});

		if (!dialogFound.found) {
			console.log('✅ No tp-yt-paper-dialog found - consent may already be accepted');
			return { success: true, found: false, details: 'No dialog found' };
		}

		console.log(`📋 Consent dialog found: ${JSON.stringify(dialogFound)}`);

		if (!dialogFound.isVisible) {
			console.log('⚠️ Dialog found but not visible');
			return { success: false, found: true, details: 'Dialog not visible' };
		}

		// Try to find and click the Accept button using multiple strategies
		const strategies = [
			// Strategy 1: Button with aria-label containing "Accept" (case-insensitive)
			async () => {
				const button = await page.evaluateHandle(() => {
					const buttons = Array.from(document.querySelectorAll('button'));
					return buttons.find(btn => {
						const ariaLabel = btn.getAttribute('aria-label') || '';
						return ariaLabel.toLowerCase().includes('accept');
					});
				});
				if (button && await button.isIntersectingViewport()) {
					const text = await button.evaluate(el => {
						const span = el.querySelector('span');
						return span ? span.textContent?.trim() : el.textContent?.trim() || '';
					});
					console.log(`   Found button via aria-label: "${text}"`);
					await button.click();
					return true;
				}
				return false;
			},

			// Strategy 2: Button containing "Accept all" or "accept all" text
			async () => {
				const button = await page.evaluateHandle(() => {
					const buttons = Array.from(document.querySelectorAll('button'));
					return buttons.find(btn => {
						const text = (btn.textContent || '').toLowerCase();
						return text.includes('accept all') || text.includes('accept');
					});
				});
				if (button && await button.isIntersectingViewport()) {
					const text = await button.evaluate(el => el.textContent?.trim() || '');
					console.log(`   Found button via text search: "${text}"`);
					await button.click();
					return true;
				}
				return false;
			},

			// Strategy 3: Search within tp-yt-paper-dialog specifically
			async () => {
				const clicked = await page.evaluate(() => {
					const dialog = document.querySelector('tp-yt-paper-dialog');
					if (!dialog) return false;

					const buttons = dialog.querySelectorAll('button');
					for (const btn of buttons) {
						const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
						const text = (btn.textContent || '').toLowerCase();

						if (ariaLabel.includes('accept') || text.includes('accept')) {
							btn.click();
							return true;
						}
					}
					return false;
				});

				if (clicked) {
					console.log(`   Found button within dialog`);
					return true;
				}
				return false;
			}
		];

		let clicked = false;
		for (let i = 0; i < strategies.length; i++) {
			try {
				console.log(`   Trying strategy ${i + 1}...`);
				clicked = await strategies[i]();
				if (clicked) {
					console.log(`   ✅ Clicked Accept button using strategy ${i + 1}`);
					break;
				}
			} catch (e) {
				console.log(`   Strategy ${i + 1} failed: ${e.message}`);
			}
		}

		if (!clicked) {
			console.log('❌ Could not find or click Accept button');
			return { success: false, found: true, details: 'Button not found or not clickable' };
		}

		// Wait for the dialog to disappear or page to update
		await new Promise(resolve => setTimeout(resolve, 3000));

		// Verify dialog is gone
		const dialogGone = await page.evaluate(() => {
			const dialog = document.querySelector('tp-yt-paper-dialog');
			if (!dialog) return true;

			const styles = window.getComputedStyle(dialog);
			return styles.display === 'none' || styles.visibility === 'hidden' || styles.opacity === '0';
		});

		if (dialogGone) {
			console.log('✅ Consent dialog disappeared after clicking');
			return { success: true, found: true, details: 'Consent accepted' };
		} else {
			console.log('⚠️ Dialog still present after clicking');
			return { success: false, found: true, details: 'Dialog still present' };
		}

	} catch (error) {
		console.error(`❌ Error handling consent: ${error.message}`);
		return { success: false, found: false, details: `Error: ${error.message}` };
	}
}

/**
 * Initialize a YouTube persona with proper consent handling
 * @param {string} url - YouTube URL to navigate to
 * @returns {Promise<{cookies: Array, success: boolean, consentResult: object}>}
 */
export async function initializeYouTubePersonaWithConsent(url = 'https://www.youtube.com') {
	console.log('🌐 Launching headless browser for consent handling...');

	const browser = await puppeteer.launch({
		headless: 'new',
		defaultViewport: { width: 1920, height: 1080 },
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});

	try {
		const page = await browser.newPage();

		// Set realistic user agent
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

		// Clear cookies
		await page.deleteCookie();

		console.log(`📍 Navigating to ${url}...`);
		const response = await page.goto(url, {
			waitUntil: 'domcontentloaded',
			timeout: 30000
		});

		console.log(`   Status: ${response.status()}`);

		// Handle consent dialog
		const consentResult = await handleYouTubeConsent(page);

		// Wait a bit for cookies to be set
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Capture all cookies
		const cookies = await page.cookies();

		console.log(`🍪 Captured ${cookies.length} cookies`);

		// Log key cookies
		const keyCookies = ['VISITOR_PRIVACY_METADATA', 'VISITOR_INFO1_LIVE', 'YSC', '__Secure-YEC', '__Secure-YENID', 'PREF'];
		console.log('   Key cookies:');
		keyCookies.forEach(name => {
			const cookie = cookies.find(c => c.name === name);
			if (cookie) {
				const value = cookie.value.substring(0, 30) + (cookie.value.length > 30 ? '...' : '');
				console.log(`     ✓ ${name}: ${value}`);
			} else {
				console.log(`     ✗ ${name}: (not set)`);
			}
		});

		await browser.close();

		return {
			cookies,
			success: true,
			consentResult
		};

	} catch (error) {
		console.error(`❌ Error: ${error.message}`);
		await browser.close();
		return {
			cookies: [],
			success: false,
			consentResult: { success: false, found: false, details: error.message }
		};
	}
}
