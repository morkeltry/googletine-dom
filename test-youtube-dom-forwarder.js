#!/usr/bin/env node
// Test script for YouTube DOM Forwarder

import { main } from './youtube-dom-forwarder.js';

console.log('Testing YouTube DOM Forwarder...\n');

const results = await main();

let passCount = 0;
let failCount = 0;

console.log('\n\n=== Test Results ===\n');

for (const result of results) {
    if (result.success) {
        console.log(`✅ PASS - "${result.searchTerm}"`);
        console.log(`   Cookies: ${result.cookieCount}`);
        console.log(`   DOM size: ${result.domSize} bytes (${(result.domSize / 1024).toFixed(2)} KB)`);

        // Validate the DOM has content
        if (result.domSize > 100000) {
            console.log(`   ✓ DOM has substantial content`);
        } else {
            console.log(`   ⚠️ DOM seems small`);
        }

        // Check for key cookies
        const hasVisitorMetadata = result.cookies.some(c => c.name === 'VISITOR_PRIVACY_METADATA');
        const hasYEC = result.cookies.some(c => c.name === '__Secure-YEC');

        if (hasVisitorMetadata) console.log(`   ✓ VISITOR_PRIVACY_METADATA present`);
        if (hasYEC) console.log(`   ✓ __Secure-YEC present`);

        passCount++;
    } else {
        console.log(`❌ FAIL - "${result.searchTerm}"`);
        console.log(`   Error: ${result.error}`);
        failCount++;
    }
    console.log('');
}

console.log('=== Summary ===');
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);
console.log(`Total: ${results.length}`);

if (failCount === 0) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
} else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
}
