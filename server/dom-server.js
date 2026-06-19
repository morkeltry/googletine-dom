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
 * Find and click the consent accept button
 */
async function clickConsentButton(page) {
    for (const selector of CONSENT_SELECTORS) {
        try {
            const button = await page.$(selector);
            if (button) {
                const isVisible = await button.isIntersectingViewport();
                if (isVisible) {
                    await button.scrollIntoView();
                    await delay(500);
                    await button.click();
                    try {
                        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 });
                    } catch (e) {
                        await delay(2000);
                    }
                    return true;
                }
            }
        } catch (e) {
            // Continue to next selector
        }
    }
    return false;
}

/**
 * Initialize browser and handle consent once on startup
 */
async function initializeBrowser() {
    console.log('Initializing browser and handling consent...');

    browser = await puppeteer.launch({
        headless: 'new',
        defaultViewport: { width: 1920, height: 1080 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    // Navigate to YouTube homepage
    await page.goto('https://www.youtube.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
    });

    // Handle consent
    console.log('Handling consent dialog...');
    await clickConsentButton(page);
    await delay(2000);

    const cookies = await page.cookies();
    console.log(`Browser initialized with ${cookies.length} cookies`);
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
    await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
    });

    // Wait for JavaScript to finish processing
    // Wait until YouTube's initial data is loaded
    await page.waitForFunction(() => {
        return typeof window.ytInitialData !== 'undefined' || document.readyState === 'complete';
    }, { timeout: 10000 }).catch(() => {});

    // Additional wait for any remaining JS processing
    await delay(3000);

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
