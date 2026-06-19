#!/usr/bin/env node
// YouTube DOM Server - Serves rendered YouTube pages via DOM forwarding

import express from 'express';
import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const PORT = 60123;
const app = express();

app.use(express.json());

// Create output directory for saved HTML
const OUTPUT_DIR = join(process.cwd(), 'output');
try {
    mkdirSync(OUTPUT_DIR, { recursive: true });
} catch (e) {
    // Directory already exists
}

// Helper function for delays
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Global browser and page instances
let browser;
let page;

// Configuration
const FIX_LINKS = true; // Replace relative YouTube links with absolute URLs

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
 * Capture the rendered DOM, remove consent elements, fix links, and save to file
 */
async function captureAndSaveDOM(v, q) {
    const dom = await page.evaluate(() => {
        return document.documentElement.outerHTML;
    });

    // Inject inline JS to remove consent elements after page load and every 30 seconds
    const cleanupScript = `
    <script>
    (function() {
        function removeConsentElements() {
            const backdrop = document.querySelector('tp-yt-iron-overlay-backdrop');
            if (backdrop) backdrop.remove();

            const lightbox = document.querySelector('ytd-consent-bump-v2-lightbox');
            if (lightbox) lightbox.remove();

            console.log('Removed consent elements');
        }

        // Run immediately
        removeConsentElements();

        // Run every 30 seconds
        setInterval(removeConsentElements, 30000);
    })();
    </script>
    `;

    console.log(`DOM captured: ${dom.length} bytes`);

    // Fix relative YouTube links to absolute URLs
    let processedDom = dom;
    if (FIX_LINKS) {
        processedDom = processedDom.replace(/href="\/watch\?v=([^"]+)"/gi, 'href="https://www.youtube.com/watch?v=$1"');
        processedDom = processedDom.replace(/href="\/shorts\/([^"]+)"/gi, 'href="https://www.youtube.com/shorts/$1"');
        console.log(`Fixed YouTube links to absolute URLs`);
    }

    // Inject inline JS to remove consent elements after page load and every 30 seconds
    const cleanupScript = `
    <script>
    (function() {
        function removeConsentElements() {
            const backdrop = document.querySelector('tp-yt-iron-overlay-backdrop');
            if (backdrop) backdrop.remove();

            const lightbox = document.querySelector('ytd-consent-bump-v2-lightbox');
            if (lightbox) lightbox.remove();

            console.log('Removed consent elements');
        }

        // Run immediately
        removeConsentElements();

        // Run every 30 seconds
        setInterval(removeConsentElements, 30000);
    })();
    </script>
    `;

    // Insert the script before closing body tag
    processedDom = processedDom.replace('</body>', cleanupScript + '</body>');

    // Save to file for later analysis
    const filename = `${v}-${q}-${Date.now()}.html`;
    const filepath = join(OUTPUT_DIR, filename);
    writeFileSync(filepath, processedDom);
    console.log(`Saved to: ${filename}`);

    return processedDom;
}

/**
 * Universal request function
 * @param {string} v - Video identifier (for naming saved files)
 * @param {string} q - Search term
 * @param {number} waitMs - Optional wait time before this request (milliseconds)
 */
async function processYouTubeRequest(v, q, waitMs = 0) {
    if (waitMs > 0) {
        console.log(`=== WAITING ${waitMs}ms ===\n`);
        await delay(waitMs);
    }

    console.log(`=== PROCESSING: ${v} (search: "${q}") ===\n`);

    await navigateAndWait(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`);

    const titles = await extractVideoTitles();
    console.log('\n=== VIDEO TITLES ===');
    titles.forEach((title, i) => {
        console.log(`${i + 1}. ${title}`);
    });
    console.log('====================\n');

    return await captureAndSaveDOM(v, q);
}

/**
 * Initialize browser
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

    // Navigate to YouTube homepage first to establish session
    await navigateAndWait('https://www.youtube.com');

    console.log('\n=== INITIALIZATION REQUESTS ===\n');

    // Request 1: cats (immediate)
    await processYouTubeRequest('init-1', 'cats');

    // Request 2: dogs (after ~6 seconds, randomized +/- 10%)
    const wait2 = Math.round(6000 * (0.9 + Math.random() * 0.2));
    await processYouTubeRequest('init-2', 'dogs', wait2);

    // Request 3: pigs (after ~31 seconds, randomized +/- 10%)
    const wait3 = Math.round(31000 * (0.9 + Math.random() * 0.2));
    await processYouTubeRequest('init-3', 'pigs', wait3);

    console.log('=== INITIALIZATION COMPLETE ===\n');
}

/**
 * Navigate to a URL, wait for content, extract titles, and return DOM
 */
async function navigateAndRender(url) {
    // Extract search term from URL for naming
    const urlObj = new URL(url);
    const searchParams = new URLSearchParams(urlObj.search);
    const searchTerm = searchParams.get('search_query') || 'homepage';

    await navigateAndWait(url);

    const titles = await extractVideoTitles();
    console.log('\n=== VIDEO TITLES FOR REQUEST ===');
    titles.forEach((title, i) => {
        console.log(`${i + 1}. ${title}`);
    });
    console.log('==================================\n');

    return await captureAndSaveDOM('req', searchTerm);
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
        console.log(`Output directory: ${OUTPUT_DIR}`);
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
