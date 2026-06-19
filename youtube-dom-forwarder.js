#!/usr/bin/env node
// YouTube DOM Forwarder - Captures and forwards rendered YouTube pages
// This script handles consent flow and searches for terms, returning the rendered DOM

import puppeteer from 'puppeteer';

const SEARCH_TERMS = ['pigs', 'cats', 'dogs', 'llamas'];

// YouTube consent button selectors
const CONSENT_SELECTORS = [
    'button[aria-label*="Accept"]',
    'button[aria-label*="accept"]',
    'button:has-text("Accept")',
    'button:has-text("Accept & Continue")',
    'button:has-text("I agree")',
    'ytd-button-overlay',
    '#yDmbB',
];

// Helper function for delays
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Find and click the consent accept button
 */
async function clickConsentButton(page) {
    console.log('🔍 Looking for consent button...');

    // Wait a moment for the page to fully render
    await delay(2000);

    for (const selector of CONSENT_SELECTORS) {
        try {
            const button = await page.$(selector);

            if (button) {
                const isVisible = await button.isIntersectingViewport();
                if (isVisible) {
                    const text = await button.evaluate(el => el.textContent || '').trim();
                    console.log(`   Found button: "${text}" (${selector})`);

                    await button.scrollIntoView();
                    await delay(500);
                    await button.click();

                    // Wait for navigation or changes
                    try {
                        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 });
                    } catch (e) {
                        // AJAX-based consent, wait a bit longer
                        await delay(2000);
                    }

                    console.log('   ✅ Consent button clicked');
                    return true;
                }
            }
        } catch (e) {
            // Continue to next selector
        }
    }

    console.log('   ℹ️ No consent button found (might already be accepted)');
    return false;
}

/**
 * Wait for YouTube search results to load
 */
async function waitForSearchResults(page) {
    console.log('⏳ Waiting for search results to load...');

    // Wait for key YouTube search result elements
    try {
        await page.waitForSelector('ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer', {
            timeout: 10000
        });
        console.log('   ✅ Search results loaded');
    } catch (e) {
        console.log('   ⚠️ Timeout waiting for results, using fallback...');

        // Fallback: wait for any content
        await delay(3000);

        // Check if any yt-specific elements are present
        const hasContent = await page.evaluate(() => {
            return document.querySelector('ytd-video-renderer') ||
                   document.querySelector('ytd-grid-video-renderer') ||
                   document.querySelector('ytd-rich-item-renderer') ||
                   document.querySelector('ytd-thumbnail') ||
                   document.body.textContent.length > 1000;
        });

        if (hasContent) {
            console.log('   ✅ Content detected');
        } else {
            console.log('   ⚠️ Limited content detected');
        }
    }
}

/**
 * Capture the rendered DOM
 */
async function captureDOM(page) {
    console.log('📄 Capturing rendered DOM...');

    const dom = await page.evaluate(() => {
        return document.documentElement.outerHTML;
    });

    console.log(`   Captured ${dom.length} bytes of HTML`);
    return dom;
}

/**
 * Capture cookies from the page
 */
async function captureCookies(page) {
    const cookies = await page.cookies();
    console.log(`🍪 Captured ${cookies.length} cookies`);

    // Log key cookies
    const keyCookies = ['VISITOR_PRIVACY_METADATA', 'VISITOR_INFO1_LIVE', 'YSC', '__Secure-YEC', '__Secure-YENID', 'SOCS', 'CONSENT'];
    console.log('   Key cookies:');
    for (const name of keyCookies) {
        const cookie = cookies.find(c => c.name === name);
        if (cookie) {
            const value = cookie.value.substring(0, 30) + (cookie.value.length > 30 ? '...' : '');
            console.log(`     ${name}: ${value}`);
        }
    }

    return cookies;
}

/**
 * Process a single search term
 */
async function processSearchTerm(browser, searchTerm) {
    console.log(`\n🔎 Processing search term: "${searchTerm}"`);

    const page = await browser.newPage();

    try {
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        // Step 1: Navigate to YouTube homepage
        console.log('   1. Navigating to YouTube homepage...');
        await page.goto('https://www.youtube.com', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Step 2: Handle consent dialog
        console.log('   2. Checking for consent dialog...');
        await clickConsentButton(page);

        // Step 3: Navigate to search results
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerm)}`;
        console.log(`   3. Navigating to search: ${searchUrl}`);
        await page.goto(searchUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Step 4: Wait for content to load
        console.log('   4. Waiting for content to load...');
        await waitForSearchResults(page);

        // Step 5: Capture cookies and DOM
        const cookies = await captureCookies(page);
        const dom = await captureDOM(page);

        return {
            searchTerm,
            success: true,
            cookies,
            dom,
            domSize: dom.length,
            cookieCount: cookies.length
        };

    } catch (error) {
        console.error(`   ❌ Error processing "${searchTerm}": ${error.message}`);
        return {
            searchTerm,
            success: false,
            error: error.message
        };
    } finally {
        await page.close();
    }
}

/**
 * Main function
 */
async function main() {
    console.log('YouTube DOM Forwarder');
    console.log('====================\n');

    console.log('🚀 Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        defaultViewport: { width: 1920, height: 1080 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const results = [];

    try {
        for (const searchTerm of SEARCH_TERMS) {
            const result = await processSearchTerm(browser, searchTerm);
            results.push(result);

            // Small delay between requests
            await delay(1000);
        }

        console.log('\n📊 Results Summary:');
        console.log('==================');

        for (const result of results) {
            if (result.success) {
                console.log(`✅ ${result.searchTerm}:`);
                console.log(`   Cookies: ${result.cookieCount}`);
                console.log(`   DOM size: ${result.domSize} bytes`);
            } else {
                console.log(`❌ ${result.searchTerm}: ${result.error}`);
            }
        }

        // Return results as JSON for programmatic use
        return results;

    } finally {
        await browser.close();
        console.log('\n🏁 Browser closed');
    }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}

export { main };
