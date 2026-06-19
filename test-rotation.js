// Test suite for persona rotation functionality
// Tests that personas are properly rotated when none is specified by the client

import { PersonaManager } from './shared/personas/PersonaManager.js';

const testResults = {
	passed: 0,
	failed: 0,
	tests: []
};

function test(name, fn) {
	testResults.tests.push({ name, fn, status: 'pending' });
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(`Assertion failed: ${message}`);
	}
}

function assertEqual(actual, expected, message) {
	if (actual !== expected) {
		throw new Error(`Assertion failed: ${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
	}
}

async function runTests() {
	console.log('🧪 Running Persona Rotation Tests...\n');

	for (const test of testResults.tests) {
		try {
			console.log(`Testing: ${test.name}`);
			await test.fn();
			testResults.passed++;
			test.status = 'passed';
			console.log(`  ✓ Passed\n`);
		} catch (err) {
			testResults.failed++;
			test.status = 'failed';
			test.error = err.message;
			console.log(`  ✗ Failed: ${err.message}\n`);
		}
	}

	console.log('════════════════════════════════════════');
	console.log(`Tests passed: ${testResults.passed}`);
	console.log(`Tests failed: ${testResults.failed}`);
	console.log(`Total tests: ${testResults.tests.length}`);
	console.log('════════════════════════════════════════');

	if (testResults.failed > 0) {
		console.log('\nFailed tests:');
		for (const t of testResults.tests.filter(t => t.status === 'failed')) {
			console.log(`  - ${t.name}`);
			console.log(`    ${t.error}`);
		}
		process.exit(1);
	}
}

// Test: Round-robin rotation strategy
test('round-robin rotates through personas sequentially', () => {
	const manager = new PersonaManager({
		providerId: 'youtube',
		rotationStrategy: 'round-robin'
	});

	// Create 3 personas
	manager.createPersona({ id: 'persona-1' });
	manager.createPersona({ id: 'persona-2' });
	manager.createPersona({ id: 'persona-3' });

	// Get personas 4 times and verify rotation order
	const p1 = manager.getPersona();
	assertEqual(p1.id, 'persona-1', 'First persona should be persona-1');

	const p2 = manager.getPersona();
	assertEqual(p2.id, 'persona-2', 'Second persona should be persona-2');

	const p3 = manager.getPersona();
	assertEqual(p3.id, 'persona-3', 'Third persona should be persona-3');

	const p4 = manager.getPersona();
	assertEqual(p4.id, 'persona-1', 'Fourth persona should cycle back to persona-1');
});

// Test: Random rotation strategy
test('random strategy returns different personas', () => {
	const manager = new PersonaManager({
		providerId: 'youtube',
		rotationStrategy: 'random'
	});

	// Create 5 personas
	for (let i = 1; i <= 5; i++) {
		manager.createPersona({ id: `persona-${i}` });
	}

	// Get personas multiple times and ensure we get variety
	const selected = new Set();
	for (let i = 0; i < 20; i++) {
		const p = manager.getPersona();
		selected.add(p.id);
	}

	// With 5 personas and 20 selections with random, we should get at least 2 different ones
	assert(selected.size >= 2, `Random selection should return variety, got ${selected.size} unique personas from 20 tries`);
});

// Test: Least-recently-used rotation strategy
test('least-recently-used selects oldest persona', async () => {
	const manager = new PersonaManager({
		providerId: 'youtube',
		rotationStrategy: 'least-recently-used'
	});

	// Create 3 personas with different lastUsed times
	const p1 = manager.createPersona({ id: 'persona-1' });
	const p2 = manager.createPersona({ id: 'persona-2' });
	const p3 = manager.createPersona({ id: 'persona-3' });

	// Set up different lastUsed times
	p1.lastUsed = Date.now() - 5000;
	p2.lastUsed = Date.now() - 2000;
	p3.lastUsed = Date.now() - 10000;

	// LRU should select persona-3 (oldest)
	const selected = manager.getPersona();
	assertEqual(selected.id, 'persona-3', 'LRU should select persona with oldest lastUsed time');
});

// Test: Rotation when no active personas exist
test('creates new persona when no active personas available', () => {
	const manager = new PersonaManager({
		providerId: 'youtube',
		rotationStrategy: 'round-robin'
	});

	// With no personas, getPersona should create one
	const p1 = manager.getPersona();
	assert(p1 !== null, 'Should create a persona when none exist');
	assert(p1.id.startsWith('persona-'), 'Created persona should have valid ID');
	assert(manager.personas.size === 1, 'Manager should have 1 persona');
});

// Test: Rotation skips expired personas
test('rotation skips expired personas', () => {
	const manager = new PersonaManager({
		providerId: 'youtube',
		rotationStrategy: 'round-robin',
		maxPersonaAge: 1000 // 1 second
	});

	// Create 3 personas
	const p1 = manager.createPersona({ id: 'persona-1' });
	const p2 = manager.createPersona({ id: 'persona-2' });
	manager.createPersona({ id: 'persona-3' });

	// Make p1 expired
	p1.createdAt = Date.now() - 2000;

	// First call should skip p1 and return p2
	const selected = manager.getPersona();
	assertEqual(selected.id, 'persona-2', 'Should skip expired persona-1 and return persona-2');
});

// Test: Rotation with single persona
test('rotation with single active persona always returns same persona', () => {
	const manager = new PersonaManager({
		providerId: 'youtube',
		rotationStrategy: 'round-robin'
	});

	manager.createPersona({ id: 'only-persona' });

	const p1 = manager.getPersona();
	const p2 = manager.getPersona();
	const p3 = manager.getPersona();

	assertEqual(p1.id, 'only-persona', 'Should return the only persona');
	assertEqual(p2.id, 'only-persona', 'Should return the same persona again');
	assertEqual(p3.id, 'only-persona', 'Should return the same persona third time');
	assert(p1 === p2 && p2 === p3, 'Should return same instance');
});

// Test: Default rotation strategy
test('default rotation strategy is round-robin', () => {
	const manager = new PersonaManager({
		providerId: 'youtube'
	});

	assertEqual(manager.rotationStrategy, 'round-robin', 'Default strategy should be round-robin');

	// Verify it behaves as round-robin
	manager.createPersona({ id: 'p1' });
	manager.createPersona({ id: 'p2' });

	const p1 = manager.getPersona();
	const p2 = manager.getPersona();

	assertEqual(p1.id, 'p1', 'First should be p1');
	assertEqual(p2.id, 'p2', 'Second should be p2');
});

// Test: Rotation counter increments
test('rotation counter increments with each selection', () => {
	const manager = new PersonaManager({
		providerId: 'youtube'
	});

	manager.createPersona({ id: 'p1' });
	manager.createPersona({ id: 'p2' });

	// Initial rotation count
	assertEqual(manager.stats.rotationCount, 0, 'Initial rotation count should be 0');

	manager.getPersona();
	assertEqual(manager.stats.rotationCount, 1, 'Rotation count should be 1 after first get');

	manager.getPersona();
	assertEqual(manager.stats.rotationCount, 2, 'Rotation count should be 2 after second get');
});

// Test: Max personas limit during rotation
test('rotation enforces max personas limit', () => {
	const manager = new PersonaManager({
		providerId: 'youtube',
		maxPersonas: 3
	});

	// Create 3 personas (at limit)
	for (let i = 0; i < 3; i++) {
		manager.createPersona({ id: `p${i}` });
	}

	// Try to create one more via rotation
	manager.getPersona(); // This should trigger cleanup before creating

	// Should still be at max
	assertEqual(manager.personas.size, 3, 'Should not exceed max personas limit');
});

// Test: Persona selection with options parameter
test('getPersona respects options parameter', () => {
	const manager = new PersonaManager({
		providerId: 'youtube'
	});

	// Get persona with specific options
	const p = manager.getPersona({ customOption: 'test' });
	assert(p !== null, 'Should return a persona');
});

// Test: Multiple rotations cycle correctly
test('multiple round-robin rotations cycle correctly', () => {
	const manager = new PersonaManager({
		providerId: 'youtube',
		rotationStrategy: 'round-robin'
	});

	// Create 4 personas
	const personas = [];
	for (let i = 1; i <= 4; i++) {
		personas.push(manager.createPersona({ id: `p${i}` }));
	}

	// Get 8 personas (2 full cycles)
	const selections = [];
	for (let i = 0; i < 8; i++) {
		selections.push(manager.getPersona().id);
	}

	// Should cycle: p1, p2, p3, p4, p1, p2, p3, p4
	const expected = ['p1', 'p2', 'p3', 'p4', 'p1', 'p2', 'p3', 'p4'];
	assert(JSON.stringify(selections) === JSON.stringify(expected),
		`Should cycle through personas correctly. Expected [${expected}] but got [${selections}]`);
});

// Run the tests
runTests().catch(err => {
	console.error('Test runner error:', err);
	process.exit(1);
});
