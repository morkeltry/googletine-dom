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
async function processYouTubeRequest() {
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

        // Capture DOM and cookies
        const { dom, cookies } = await capturePage(page);

        await browser.close();
        return { success: true, dom, cookies };

    } catch (error) {
        await browser.close();
        return { success: false, error: error.message };
    }
}

// Request endpoint - returns YouTube homepage
app.get('/request', async (req, res) => {
    console.log(`[${new Date().toISOString()}] Processing request`);

    try {
        const result = await processYouTubeRequest();

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
    console.log(`GET  http://localhost:${PORT}/request`);
    console.log(`GET  http://localhost:${PORT}/health`);
});
