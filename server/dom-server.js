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
 * Wait for YouTube search results to load
 */
async function waitForSearchResults(page) {
    try {
        await page.waitForSelector('ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer', {
            timeout: 10000
        });
    } catch (e) {
        await delay(3000);
    }
}

/**
 * Capture the rendered DOM and cookies
 */
async function capturePage(page) {
    const dom = await page.evaluate(() => document.documentElement.outerHTML);
    const cookies = await page.cookies();
    return { dom, cookies };
}

/**
 * Process a YouTube request
 */
async function processYouTubeRequest(searchTerm) {
    const browser = await puppeteer.launch({
        headless: 'new',
        defaultViewport: { width: 1920, height: 1080 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        // Navigate to YouTube homepage
        await page.goto('https://www.youtube.com', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Handle consent
        await clickConsentButton(page);
        await delay(2000);

        // Navigate to search results
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerm)}`;
        await page.goto(searchUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Wait for content
        await waitForSearchResults(page);

        // Capture DOM and cookies
        const { dom, cookies } = await capturePage(page);

        await browser.close();
        return { success: true, dom, cookies, searchTerm };

    } catch (error) {
        await browser.close();
        return { success: false, error: error.message, searchTerm };
    }
}

// Request endpoint
app.post('/request', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'Missing url in request body' });
    }

    // Extract search term from YouTube URL
    const urlObj = new URL(url);
    const searchParams = new URLSearchParams(urlObj.search);
    const searchTerm = searchParams.get('search_query');

    if (!searchTerm) {
        return res.status(400).json({ error: 'Missing search_query parameter in URL' });
    }

    console.log(`[${new Date().toISOString()}] Processing request for: "${searchTerm}"`);

    try {
        const result = await processYouTubeRequest(searchTerm);

        if (result.success) {
            res.setHeader('Content-Type', 'text/html');
            res.send(result.dom);
            console.log(`[${new Date().toISOString()}] ✓ Success: ${result.dom.length} bytes, ${result.cookies.length} cookies`);
        } else {
            res.status(500).json({ error: result.error });
            console.log(`[${new Date().toISOString()}] ✗ Failed: ${result.error}`);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
        console.log(`[${new Date().toISOString()}] ✗ Error: ${error.message}`);
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`YouTube DOM Server listening on port ${PORT}`);
    console.log(`POST http://localhost:${PORT}/request`);
    console.log(`GET  http://localhost:${PORT}/health`);
});
