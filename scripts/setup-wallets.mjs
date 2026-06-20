// One-shot, idempotent wallet setup for the AlgoMate agent.
//
//   node scripts/setup-wallets.mjs
//
// Ensures two Tempo testnet wallets exist and funds them from the faucet:
//   • agent  — the backend payer. Holds tokens; pays a micro-tx per video view.
//   • seller — the algorithm-seller wallet. Receives every per-view payment.
//
// Secrets are kept OUT of git: private keys + the MPP signing secret are written
// to .env (gitignored). Only the public addresses + chain config go into the
// committable manifest server/payments/wallets.json, which the server reads.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createWallet, addressOf, fundAddress, tokenBalance, nativeBalance, TEMPO, explorerAddr, delay } from './tempo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV = join(ROOT, '.env');
const MANIFEST = join(ROOT, 'server', 'payments', 'wallets.json');

function readEnv() {
  if (!existsSync(ENV)) return {};
  const out = {};
  for (const line of readFileSync(ENV, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function upsertEnv(updates) {
  let lines = existsSync(ENV) ? readFileSync(ENV, 'utf8').split('\n') : [];
  for (const [k, v] of Object.entries(updates)) {
    const i = lines.findIndex((l) => l.match(new RegExp(`^\\s*${k}\\s*=`)));
    if (i >= 0) lines[i] = `${k}=${v}`;
    else lines.push(`${k}=${v}`);
  }
  writeFileSync(ENV, lines.filter((l, i) => !(l === '' && i === lines.length - 1)).join('\n').replace(/\n*$/, '\n'));
}

const env = readEnv();

// reuse existing keys if present, else mint fresh ones
const agentKey = env.ALGOMATE_AGENT_KEY || createWallet().privateKey;
const sellerKey = env.ALGOMATE_SELLER_KEY || createWallet().privateKey;
const mppSecret = env.MPP_SECRET_KEY || randomBytes(32).toString('hex');
const agent = addressOf(agentKey);
const seller = addressOf(sellerKey);

console.log('AlgoMate wallets (Tempo Moderato testnet, chain ' + TEMPO.chainId + ')');
console.log('  agent  (payer)    ' + agent);
console.log('  seller (recipient)' + seller);

console.log('\nFunding from faucet…');
for (const [name, addr] of [['agent', agent], ['seller', seller]]) {
  try {
    const hashes = await fundAddress(addr);
    console.log(`  ${name}: requested (${hashes.length} tx)`);
  } catch (e) {
    console.log(`  ${name}: faucet skipped (${e.message}) — may already be funded`);
  }
}

console.log('\nWaiting for balances to settle…');
await delay(4000);
for (const [name, addr] of [['agent', agent], ['seller', seller]]) {
  const [bal, gas] = await Promise.all([tokenBalance(addr), nativeBalance(addr)]);
  console.log(`  ${name}: ${bal.toLocaleString()} pathUSD · gas ${gas > 0n ? 'ok' : 'none'}`);
}

// committable manifest — public addresses + chain config only (NO keys)
mkdirSync(dirname(MANIFEST), { recursive: true });
writeFileSync(MANIFEST, JSON.stringify({
  _note: 'AlgoMate payment wallets — public addresses only. Keys live in .env (gitignored).',
  chainId: TEMPO.chainId, rpc: TEMPO.rpc, explorer: TEMPO.explorer,
  token: TEMPO.token, decimals: TEMPO.decimals, testnet: true,
  pricePerView: env.ALGOMATE_PRICE_PER_VIEW || '0.001',
  agent, seller,
}, null, 2) + '\n');

// secrets -> .env (gitignored)
upsertEnv({ ALGOMATE_AGENT_KEY: agentKey, ALGOMATE_SELLER_KEY: sellerKey, MPP_SECRET_KEY: mppSecret });

console.log('\nWrote:');
console.log('  server/payments/wallets.json  (committable — addresses + chain)');
console.log('  .env                          (gitignored — ALGOMATE_AGENT_KEY, ALGOMATE_SELLER_KEY, MPP_SECRET_KEY)');
console.log('\nFor production, set these in Coolify env (never commit):');
console.log('  ALGOMATE_AGENT_KEY=' + agentKey.slice(0, 6) + '…  (the payer key)');
console.log('  MPP_SECRET_KEY=' + mppSecret.slice(0, 6) + '…');
console.log('  explorer: ' + explorerAddr(agent));
