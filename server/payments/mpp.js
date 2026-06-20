// Real MPP payments for AlgoMate, over Tempo (testnet).
//
// Two sides, both server-side:
//   • viewCharge — an Express middleware that gates GET /api/algo/view behind a real
//     `mppx` Tempo charge. Funds land in the algorithm-SELLER wallet. (The 402 seller.)
//   • payForView — the AGENT pays that gate from its own funded wallet, in the
//     background, once per watched video. Returns the on-chain receipt (tx hash).
//
// Secrets: ALGOMATE_AGENT_KEY (payer) + MPP_SECRET_KEY (challenge signing) come from
// env only. Public addresses + chain config come from server/payments/wallets.json.
// If the key/secret are absent, payments are disabled and the app still runs.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { privateKeyToAccount } from 'viem/accounts';

const __dirname = dirname(fileURLToPath(import.meta.url));

let manifest = {};
try { manifest = JSON.parse(readFileSync(join(__dirname, 'wallets.json'), 'utf8')); } catch {}

const AGENT_KEY = process.env.ALGOMATE_AGENT_KEY;
const SECRET = process.env.MPP_SECRET_KEY;
const TESTNET = manifest.testnet !== false;
const TOKEN = manifest.token || '0x20c0000000000000000000000000000000000000';
const DECIMALS = manifest.decimals || 6;
const RECIPIENT = manifest.seller;
const PRICE = String(process.env.ALGOMATE_PRICE_PER_VIEW || manifest.pricePerView || '0.001');

export const enabled = Boolean(AGENT_KEY && SECRET && RECIPIENT);

let _charge = null;     // express middleware gating the view route (seller side)
let _payFetch = null;   // payment-aware fetch from the agent wallet (buyer side)
let initError = null;

async function init() {
  if (!enabled || _charge) return;
  try {
    const [{ Mppx: MppxServer, tempo: tempoServer }, { Mppx: MppxClient, tempo: tempoClient }] = await Promise.all([
      import('mppx/express'),
      import('mppx/client'),
    ]);
    const seller = MppxServer.create({
      secretKey: SECRET,
      methods: [tempoServer.charge({ testnet: TESTNET, currency: TOKEN, decimals: DECIMALS, recipient: RECIPIENT })],
    });
    _charge = seller.charge({ amount: PRICE, description: 'AlgoMate per-view algorithm fee' });

    const buyer = MppxClient.create({
      methods: [tempoClient({ account: privateKeyToAccount(AGENT_KEY) })],
      polyfill: false,
    });
    _payFetch = buyer.fetch.bind(buyer);
    console.log(`[mpp] real Tempo payments ON — ${PRICE} pathUSD/view -> ${RECIPIENT}`);
  } catch (e) {
    initError = e;
    console.error('[mpp] init failed, payments disabled:', e.message);
  }
}
const ready = init();

// Express middleware for the seller's paid view endpoint. Passes through when
// payments are disabled so the route still 200s in dev.
export async function viewCharge(req, res, next) {
  await ready;
  if (_charge) return _charge(req, res, next);
  return next();
}

// The agent pays one view fee, in the background, and returns the receipt.
// baseUrl is the server's own origin (the agent buys from our own 402 gate).
export async function payForView(baseUrl, { videoId, title } = {}) {
  await ready;
  if (!_payFetch) return { ok: false, simulated: true, error: initError && initError.message };
  const url = `${baseUrl}/api/algo/view?v=${encodeURIComponent(videoId || '')}`;
  try {
    const res = await _payFetch(url);
    let receipt = null;
    const hdr = res.headers.get('payment-receipt');
    if (hdr) { try { receipt = JSON.parse(Buffer.from(hdr, 'base64').toString('utf8')); } catch {} }
    const tx = (receipt && receipt.reference) || null;
    if (tx) console.log(`[mpp] paid view ${videoId || ''} — ${PRICE} pathUSD · tx ${tx.slice(0, 12)}…`);
    return { ok: res.ok, tx, receipt };
  } catch (e) {
    console.error('[mpp] payForView error:', e.message);
    return { ok: false, error: e.message };
  }
}

export const config = { enabled, price: PRICE, token: TOKEN, decimals: DECIMALS, recipient: RECIPIENT, agent: manifest.agent, testnet: TESTNET, explorer: manifest.explorer };
