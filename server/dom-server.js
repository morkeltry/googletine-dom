#!/usr/bin/env node
// YouTube DOM Server - Serves rendered YouTube pages via DOM forwarding

import express from 'express';
import puppeteer from 'puppeteer';

const PORT = 60123;
const app = express();

app.use(express.json());

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

// Global browser and page instances
let browser;
let page;

/**
 * Get VISITOR_PRIVACY_METADATA cookie value
 */
function getPrivacyMetadata(cookies) {
    const cookie = cookies.find(c => c.name === 'VISITOR_PRIVACY_METADATA');
    return cookie ? cookie.value : null;
}

/**
 * Extract video titles from current page
 */
async function extractVideoTitles() {
    const titles = await page.evaluate(() => {
        const results = [];
        const titleElements = document.querySelectorAll('#video-title, h3, a#video-title');

        titleElements.forEach(el => {
            const title = el.textContent?.trim();
            if (title && title.length > 5 && !results.includes(title)) {
                results.push(title);
            }
        });

        return results.slice(0, 10);
    });

    return titles;
}

/**
 * Find and click the consent accept button
 */
async function clickConsentButton(page) {
    console.log('Looking for consent button...');

    for (const selector of CONSENT_SELECTORS) {
        try {
            const button = await page.$(selector);
            if (button) {
                const isVisible = await button.isIntersectingViewport();
                if (isVisible) {
                    const text = await button.evaluate(el => el.textContent || '').trim();
                    console.log(`Found button: "${text}" (${selector})`);

                    await button.scrollIntoView();
                    await delay(500);
                    await button.click();

                    try {
                        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 });
                        console.log('Navigation after click');
                    } catch (e) {
                        console.log('No navigation (AJAX consent)');
                        await delay(2000);
                    }

                    return true;
                }
            }
        } catch (e) {
            // Continue to next selector
        }
    }

    console.log('No consent button found');
    return false;
}

/**
 * Navigate and wait for page to fully load
 */
async function navigateAndWait(url) {
    console.log(`Navigating to: ${url}`);

    const cookies = await page.cookies();
    const privacyCookie = getPrivacyMetadata(cookies);
    console.log(`Before request - VISITOR_PRIVACY_METADATA: ${privacyCookie ? privacyCookie.substring(0, 30) + '...' : 'null'}`);

    await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
    });

    console.log('Waiting for JS to complete...');
    await page.waitForFunction(() => {
        return document.readyState === 'complete' &&
               typeof window.ytInitialData !== 'undefined';
    }, { timeout: 15000 }).catch(() => {});

    await delay(2000);
    console.log('Page loaded');

    const afterCookies = await page.cookies();
    const afterPrivacy = getPrivacyMetadata(afterCookies);
    console.log(`After request - VISITOR_PRIVACY_METADATA: ${afterPrivacy ? afterPrivacy.substring(0, 30) + '...' : 'null'}`);

    return afterCookies;
}

/**
 * Initialize browser and handle consent once on startup
 */
async function initializeBrowser() {
    console.log('=== INITIALIZING BROWSER ===\n');

    browser = await puppeteer.launch({
        headless: 'new',
        defaultViewport: { width: 1920, height: 1080 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    // Navigate to YouTube homepage
    await navigateAndWait('https://www.youtube.com');

    // Handle consent
    console.log('\nHandling consent dialog...');
    const clicked = await clickConsentButton(page);

    if (clicked) {
        await delay(3000);
    }

    // Wait for feed to render
    console.log('Waiting for feed to render...');
    await delay(3000);

    // Extract and show video titles
    console.log('\n=== HOMEPAGE VIDEO TITLES ===');
    const titles = await extractVideoTitles();
    titles.forEach((title, i) => {
        console.log(`${i + 1}. ${title}`);
    });
    console.log('============================\n');

    // Test search for cats
    console.log('=== TESTING SEARCH FOR "CATS" ===\n');
    await navigateAndWait('https://www.youtube.com/results?search_query=cats');

    await delay(2000);

    const searchTitles = await extractVideoTitles();
    console.log('\n=== SEARCH RESULTS VIDEO TITLES ===');
    searchTitles.forEach((title, i) => {
        console.log(`${i + 1}. ${title}`);
    });
    console.log('===================================\n');

    console.log('=== INITIALIZATION COMPLETE ===\n');
}

/**
 * Capture the rendered DOM
 */
async function captureDOM() {
    const dom = await page.evaluate(() => document.documentElement.outerHTML);
    return dom;
}

/**
 * Navigate to a URL and wait for content to load
 */
async function navigateAndRender(url) {
    const cookies = await navigateAndWait(url);
    return await captureDOM();
}

// Request endpoint - returns rendered YouTube page
app.get('/request', async (req, res) => {
    const url = req.query.url || 'https://www.youtube.com';
    console.log(`[${new Date().toISOString()}] Processing request for: ${url}`);

    try {
        const dom = await navigateAndRender(url);

        res.setHeader('Content-Type', 'text/html');
        res.send(dom);
        console.log(`[${new Date().toISOString()}] ✓ Success: ${dom.length} bytes`);

    } catch (error) {
        res.status(500).json({ error: error.message });
        console.log(`[${new Date().toISOString()}] ✗ Error: ${error.message}`);
    }
});

// Health check
app.get('/health', async (req, res) => {
    const browserStatus = browser ? 'running' : 'not initialized';
    res.json({
        status: 'ok',
        browser: browserStatus,
        timestamp: new Date().toISOString()
    });
});

// Start server
async function startServer() {
    await initializeBrowser();

    app.listen(PORT, () => {
        console.log(`YouTube DOM Server listening on port ${PORT}`);
        console.log(`GET  http://localhost:${PORT}/request?url=<youtube-url>`);
        console.log(`GET  http://localhost:${PORT}/health`);
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
