// Cookie injection test - simple version
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

// Test setting cookies directly on the page
await page.goto('http://localhost:6060/request/youtube.com', { waitUntil: 'domcontentloaded' });

// Set cookies manually to test
await page.evaluate(() => {
  document.cookie = 'VISITOR_PRIVACY_METADATA=CgJQVBIiEh4SHAsMDg8QERITFBUWFxgZGhscHR4fICEiIyQlJicgGw%3D%3D';
  document.cookie = 'YSC=7OPnjArJYJo';
});

const result = await page.evaluate(() => ({
  documentCookie: document.cookie,
  hasVisitorMetadata: document.cookie.includes('VISITOR_PRIVACY_METADATA')
}));

console.log('After manually setting cookies:');
console.log('document.cookie:', result.documentCookie);
console.log('Has VISITOR_PRIVACY_METADATA:', result.hasVisitorMetadata);

await browser.close();
