#!/usr/bin/env node
// YouTube DOM Server - Serves rendered YouTube pages via DOM forwarding

import express from 'express';
import puppeteer from 'puppeteer';

const PORT = 60123;
const app = express();

app.use(express.json());

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
 * Strip all scripts from HTML
 */
function stripScripts(html) {
    return html
        .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, '')
        .replace(/<script\b[^>]*\/>/gi, '')
        .replace(/on\w+="[^"]*"/gi, '') // Remove inline event handlers
        .replace(/on\w+='[^']*'/gi, '');
}

/**
 * Navigate and wait for page to fully load (without clicking consent)
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
 * Initialize browser (without handling consent)
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
 * Capture the rendered DOM with scripts stripped
 */
async function captureDOMStripped() {
    const dom = await page.evaluate(() => document.documentElement.outerHTML);
    const stripped = stripScripts(dom);
    console.log(`DOM captured: ${dom.length} bytes -> ${stripped.length} bytes (stripped)`);
    return stripped;
}

/**
 * Navigate to a URL, wait for content, extract titles, and return stripped DOM
 */
async function navigateAndRender(url) {
    await navigateAndWait(url);

    // Extract and log video titles before serving
    console.log('\n=== VIDEO TITLES FOR REQUEST ===');
    const titles = await extractVideoTitles();
    titles.forEach((title, i) => {
        console.log(`${i + 1}. ${title}`);
    });
    console.log('==================================\n');

    return await captureDOMStripped();
}

// Request endpoint - returns rendered YouTube page with scripts stripped
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
