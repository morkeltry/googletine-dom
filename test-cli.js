// Tests for guil-cli.js
// Simple test framework for CLI functionality

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

const TEST_DB = join(process.cwd(), 'server/data', '.googletine-db.json');

// Test result tracking
const results = {
	passed: 0,
	failed: 0,
	tests: []
};

// Test helper
function test(name, fn) {
	results.tests.push({ name, fn, status: 'pending' });
}

// Assert helper
function assert(condition, message) {
	if (!condition) {
		throw new Error(`Assertion failed: ${message}`);
	}
}

// CLI helper
async function runCli(args) {
	try {
		const { stdout, stderr } = await execAsync(`node guil-cli.js ${args}`);
		return { stdout, stderr, success: true };
	} catch (error) {
		return { stdout: error.stdout || '', stderr: error.stderr || '', success: false, error };
	}
}

// Backup and restore database
let backupDb = null;

function backupDatabase() {
	if (existsSync(TEST_DB)) {
		backupDb = TEST_DB + '.backup';
		execSync(`cp ${TEST_DB} ${backupDb}`);
	}
}

function restoreDatabase() {
	if (backupDb && existsSync(backupDb)) {
		execSync(`mv ${backupDb} ${TEST_DB}`);
	}
}

// Clean test database
function cleanDatabase() {
	if (existsSync(TEST_DB)) {
		unlinkSync(TEST_DB);
	}
}

// Run all tests
async function runTests() {
	console.log('🧪 Running Googletine CLI Tests...\n');

	// Setup
	backupDatabase();
	cleanDatabase();

	// Run each test
	for (const test of results.tests) {
		try {
			console.log(`Testing: ${test.name}`);
			await test.fn();
			results.passed++;
			test.status = 'passed';
			console.log(`  ✓ Passed\n`);
		} catch (err) {
			results.failed++;
			test.status = 'failed';
			test.error = err.message;
			console.log(`  ✗ Failed: ${err.message}\n`);
		}
	}

	// Cleanup
	restoreDatabase();

	// Print summary
	console.log('════════════════════════════════════════');
	console.log(`Tests passed: ${results.passed}`);
	console.log(`Tests failed: ${results.failed}`);
	console.log(`Total tests: ${results.tests.length}`);
	console.log('════════════════════════════════════════');

	if (results.failed > 0) {
		console.log('\nFailed tests:');
		for (const test of results.tests.filter(t => t.status === 'failed')) {
			console.log(`  - ${test.name}`);
		}
		process.exit(1);
	}
}

// Define tests
test('help command displays usage', async () => {
	const result = await runCli('help');
	assert(result.success, 'help command should succeed');
	assert(result.stdout.includes('Googletine CLI'), 'should show title');
	assert(result.stdout.includes('create'), 'should show create command');
	assert(result.stdout.includes('list'), 'should show list command');
});

test('list with no database shows no personas', async () => {
	const result = await runCli('list');
	assert(result.success, 'list command should succeed');
	assert(result.stdout.includes('No personas found'), 'should show no personas');
});

test('create youtube persona with search term', async () => {
	const result = await runCli('create youtube "test search" "Test Persona"');
	assert(result.success, 'create command should succeed');
	assert(result.stdout.includes('Persona created successfully'), 'should confirm creation');
	assert(result.stdout.includes('Test Persona'), 'should show persona name');
	// Cookie count is shown after creation
});

test('list youtube personas shows created persona', async () => {
	const result = await runCli('list youtube');
	assert(result.success, 'list youtube should succeed');
	assert(result.stdout.includes('youtube'), 'should show provider header');
	assert(result.stdout.includes('Test Persona'), 'should show persona name');
	assert(result.stdout.includes('persona-'), 'should show persona ID');
});

test('stats youtube shows statistics', async () => {
	const result = await runCli('stats youtube');
	assert(result.success, 'stats youtube should succeed');
	assert(result.stdout.includes('Stats for youtube'), 'should show stats header');
	assert(result.stdout.includes('Total Personas:'), 'should show total count');
});

test('create persona without name defaults to search term', async () => {
	const result = await runCli('create youtube "another test"');
	assert(result.success, 'create should succeed');
	assert(result.stdout.includes('another test'), 'should use search term as name');
});

test('list all providers shows youtube', async () => {
	const result = await runCli('list');
	assert(result.success, 'list should succeed');
	assert(result.stdout.includes('youtube'), 'should show youtube provider');
	assert(result.stdout.includes('Total Personas:'), 'should show persona count');
});

test('delete persona removes it from database', async () => {
	// First, get a persona ID from create
	const createResult = await runCli('create youtube "delete test" "Delete Test"');
	const match = createResult.stdout.match(/ID: (persona-[a-z0-9-]+)/);
	assert(match, 'should find a persona ID in create output');

	const personaId = match[1];

	// Verify it exists
	const listBefore = await runCli('list youtube');
	assert(listBefore.stdout.includes('Delete Test'), 'persona should exist before delete');

	// Delete the persona
	const deleteResult = await runCli(`delete youtube ${personaId}`);
	assert(deleteResult.success, 'delete should succeed');
	assert(deleteResult.stdout.includes('Deleted persona'), 'should confirm deletion');

	// Verify it's gone
	const listAfter = await runCli('list youtube');
	assert(!listAfter.stdout.includes('Delete Test'), 'persona should be removed from list');
});

test('create with invalid provider shows error', async () => {
	const result = await runCli('create invalid "test"');
	// CLI handles errors gracefully but prints to stderr
	assert(result.stderr.includes('Unknown provider'), 'should show error message');
});

test('delete non-existent persona shows error', async () => {
	const result = await runCli('delete youtube persona-does-not-exist');
	assert(result.success, 'delete command should execute'); // CLI handles this gracefully
	assert(result.stderr.includes('Persona not found') || result.stdout.includes('Persona not found'), 'should show not found error');
});

test('stats with no database shows empty stats', async () => {
	cleanDatabase(); // Ensure no database
	const result = await runCli('stats youtube');
	assert(result.success, 'stats should succeed');
	assert(result.stdout.includes('Total Personas: 0'), 'should show zero personas');
});

// Additional integration test
test('full persona lifecycle', async () => {
	cleanDatabase();

	// Create persona
	const createResult = await runCli('create youtube "lifecycle test" "Lifecycle"');
	assert(createResult.success, 'create should succeed');

	// Extract persona ID
	const match = createResult.stdout.match(/ID: (persona-[a-z0-9-]+)/);
	assert(match, 'should find persona ID in create output');
	const personaId = match[1];

	// List and verify
	const listResult = await runCli('list youtube');
	assert(listResult.stdout.includes('Lifecycle'), 'persona should be in list');
	assert(listResult.stdout.includes(personaId), 'persona ID should match');

	// Get stats
	const statsResult = await runCli('stats youtube');
	assert(statsResult.stdout.includes('Total Personas: 1'), 'should show 1 persona');

	// Delete
	const deleteResult = await runCli(`delete youtube ${personaId}`);
	assert(deleteResult.success, 'delete should succeed');

	// Verify deleted (should say "No personas found")
	const finalList = await runCli('list youtube');
	assert(finalList.stdout.includes('No personas found'), 'should be empty after deletion');
});

// Run tests
runTests().catch(err => {
	console.error('Test runner error:', err);
	process.exit(1);
});
