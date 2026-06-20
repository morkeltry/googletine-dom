// AlgoMate — the personal feed agent (step 1: state + console endpoints).
//
// Holds the agent's state in memory (active lens, budget, decision log) and exposes
// it over a small REST + SSE API for the /agent console. The action functions
// (setLens / narrate / sense / decide) are the GLM tools; recordPayment logs the
// real per-view payments the agent makes.

import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import * as glm from './glm.js';
import * as activityLogger from '../logs/activity-logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bus = new EventEmitter();
bus.setMaxListeners(50);

const LENS_META = {
  dev: { id: 'dev', name: 'Developer', emoji: '👨‍💻' },
  cat: { id: 'cat', name: 'Cat Lover', emoji: '🐱' },
};

// the agent's on-chain wallet (public addresses + chain config); keys live in env
let WALLET = null;
try { WALLET = JSON.parse(readFileSync(join(__dirname, '..', 'payments', 'wallets.json'), 'utf8')); } catch {}
const EXPLORER = (WALLET && WALLET.explorer) || 'https://explore.testnet.tempo.xyz';
// real per-view payments are on only when the backend holds a funded key + signing secret
export const PAYMENTS_LIVE = Boolean(process.env.ALGOMATE_AGENT_KEY && process.env.MPP_SECRET_KEY);

const money = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6; // pathUSD: 6 decimals
export const PRICE_PER_VIEW = money(process.env.ALGOMATE_PRICE_PER_VIEW || (WALLET && WALLET.pricePerView) || 0.001);

const state = {
  user: 'frank',
  activeLens: 'dev',
  paused: false,
  budget: { total: 5.0, spent: 0, currency: 'pathUSD' },
  paidViews: 0,
  decisions: [], // { id, ts, phase, message, lens?, amount?, tx?, txUrl? }
};

function record(entry) {
  const e = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), phase: 'NARRATE', message: '', ...entry };
  state.decisions.push(e);
  if (state.decisions.length > 300) state.decisions.shift();
  bus.emit('decision', e);
  return e;
}

function publicState() {
  return {
    user: state.user,
    activeLens: state.activeLens,
    activeLensMeta: LENS_META[state.activeLens] || { id: state.activeLens },
    paused: state.paused,
    budget: { ...state.budget, remaining: money(state.budget.total - state.budget.spent) },
    lenses: Object.values(LENS_META),
    decisions: state.decisions.slice(-60),
    agent: { model: glm.model(), hasKey: glm.hasKey() },
    paidViews: state.paidViews,
    wallet: walletInfo(),
  };
}

function walletInfo() {
  if (!WALLET) return null;
  return {
    address: WALLET.agent, seller: WALLET.seller,
    network: WALLET.testnet === false ? 'Tempo' : 'Tempo testnet',
    token: 'pathUSD', explorer: EXPLORER,
    pricePerView: PRICE_PER_VIEW, live: PAYMENTS_LIVE,
  };
}

// ---- agent actions (these become the GLM tools in step 2) ----
export function sense(message) { return record({ phase: 'SENSE', message: String(message || '') }); }
export function decide(message) { return record({ phase: 'DECIDE', message: String(message || '') }); }
export function narrate(message) { return record({ phase: 'NARRATE', message: String(message || '') }); }

export function setLens(lens, reason) {
  if (!LENS_META[lens]) throw new Error('unknown lens: ' + lens);
  const changed = state.activeLens !== lens;
  state.activeLens = lens;
  return record({ phase: 'ACT', message: reason || (changed ? `Switched you to ${LENS_META[lens].name}` : `Kept you on ${LENS_META[lens].name}`), lens });
}

const fmtPay = (n) => { const s = Number(n).toFixed(6).replace(/0+$/, '').replace(/\.$/, ''); return s === '' || s === '-0' ? '0' : s; };

// Would one more payment of `amount` stay within the session budget? Checked
// BEFORE the on-chain charge is signed, so the cap actually holds.
export function canSpend(amount = PRICE_PER_VIEW) {
  return money(state.budget.spent + money(amount)) <= state.budget.total;
}

// A real per-view micro-payment the agent just made on the human's behalf.
// Carries the on-chain tx reference so the console can link it. Called by the
// server after each watched video settles (reason: 'budget' if it was capped).
export function recordPayment({ amount = PRICE_PER_VIEW, videoId, title, tx, ok = true, reason } = {}) {
  const amt = money(amount);
  const label = `“${String(title || videoId || 'a video').slice(0, 42)}”`;
  if (!ok) {
    const msg = reason === 'budget'
      ? `Budget reached — holding off on the view fee for ${label}`
      : `View fee for ${label} didn’t settle — I’ll retry`;
    return record({ phase: 'ACT', message: msg, amount: amt, videoId, declined: true });
  }
  state.budget.spent = money(state.budget.spent + amt);
  state.paidViews += 1;
  return record({
    phase: 'ACT',
    message: `Paid ${fmtPay(amt)} pathUSD for ${label}`,
    amount: amt, videoId, tx: tx || null,
    txUrl: tx ? `${EXPLORER}/tx/${tx}` : null,
  });
}

export function getState() { return publicState(); }

// ---- the GLM decision loop (step 2) ----
// The human's plain-language instruction to the agent (shown on the console).
export const INSTRUCTION = `I'm a developer. While I'm working, only show me developer videos. After 16:00, switch me to some calming cat videos.`;

export const SYSTEM = `You are AlgoMate, a personal feed agent. You look after ONE human and keep their YouTube feed in line with the standing instruction they gave you.

Their instruction:
"${INSTRUCTION}"

How to read it:
 • Before 16:00 (they're working) -> keep the "dev" (Developer) lens.
 • From 16:00 onward, and late at night -> switch to the "cat" (Cat Lover) lens for calming cat videos.
 • Also glance at their recent activity; if they're clearly off-context, gently nudge — don't nag.

Payments — you handle these automatically, the human never does:
 • Every time they watch a video, that's one use of the chosen algorithm. You pay the
   tiny per-view fee (~0.001 pathUSD) to the algorithm's seller — a REAL micro-payment
   settled on the Tempo blockchain, from your own wallet, in the background.
 • The human just watches; you take care of the money so they never stop to pay.

Rules:
 • The human is in charge. Nudge, don't hijack. Keep actions minimal — doing nothing is valid.
 • If the active lens already fits, do NOT switch; just narrate briefly.
 • After acting, always call narrate() once with a short, warm sentence.

Use your tools: set_lens, narrate.`;

const TOOLS = [
  { type: 'function', function: { name: 'set_lens', description: 'Switch the human active feed lens.',
    parameters: { type: 'object', properties: {
      lens: { type: 'string', enum: ['dev', 'cat'], description: 'dev = Developer, cat = Cat Lover' },
      reason: { type: 'string', description: 'short, warm explanation shown to the human' } }, required: ['lens'] } } },
  { type: 'function', function: { name: 'narrate', description: 'Post one short warm sentence to the human about what you are doing.',
    parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } } },
];

function buildContext() {
  const now = new Date();
  const h = now.getHours();
  const dayPart = (h >= 16 || h < 6) ? 'after 16:00 / wind-down' : 'work hours (before 16:00)';
  const recentActivity = [];
  for (const u of ['user-dev', 'user-cat']) {
    try { (activityLogger.getRecentActivity(u, 4) || []).forEach((a) => recentActivity.push({ user: u, ...a })); } catch {}
  }
  return {
    now: now.toISOString(), hour: h, dayPart,
    activeLens: state.activeLens,
    budget: { remaining: money(state.budget.total - state.budget.spent), total: state.budget.total, currency: state.budget.currency },
    recentActivity: recentActivity.slice(-8),
  };
}

const safeParse = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

// fallback: simple time-of-day rule (used when no GLM key, or on API error)
export function ruleTick() {
  if (state.paused) { narrate('Asked to act, but I’m paused — you’re in control.'); return publicState(); }
  const h = new Date().getHours();
  const relax = h >= 16 || h < 6;
  const target = relax ? 'cat' : 'dev';
  sense(relax ? `It's ${h}:00 — after work, wind-down time.` : `It's ${h}:00 — work hours, focus time.`);
  decide(relax ? 'Past 16:00 → switch to calming cat videos.' : 'Before 16:00 → keep the Developer feed.');
  setLens(target, relax ? 'Past 16:00 — switching you to calming cats.' : 'Work hours — keeping you on the Developer feed.');
  narrate(relax ? 'Clocking off — enjoy the cats. I’ll cover the view fees.' : 'In flow — I’ll stay out of your way and handle the payments.');
  return publicState();
}

// the real decision: GLM reads context + activity and calls the tools
export async function runTick() {
  if (state.paused) { narrate('Asked to act, but I’m paused — you’re in control.'); return publicState(); }
  if (!glm.hasKey()) return ruleTick();

  const ctx = buildContext();
  sense(`${ctx.dayPart} · ${ctx.hour}:00 · on ${LENS_META[ctx.activeLens]?.name || ctx.activeLens} · ${ctx.recentActivity.length} recent events`);
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Current context (JSON). Decide what to do for your human using your tools. Be minimal.\n\n${JSON.stringify(ctx, null, 2)}` },
  ];
  try {
    for (let i = 0; i < 4; i++) {
      const resp = await glm.chat(messages, TOOLS);
      const msg = resp.choices && resp.choices[0] && resp.choices[0].message;
      if (!msg) break;
      messages.push(msg);
      const calls = msg.tool_calls || [];
      if (!calls.length) { if (msg.content) decide(String(msg.content).slice(0, 200)); break; }
      for (const c of calls) {
        const fn = c.function && c.function.name;
        const args = safeParse(c.function && c.function.arguments);
        let result = 'ok';
        try {
          if (fn === 'set_lens') setLens(args.lens, args.reason);
          else if (fn === 'narrate') narrate(args.message);
          else result = 'unknown tool';
        } catch (e) { result = 'error: ' + e.message; }
        messages.push({ role: 'tool', tool_call_id: c.id, content: String(result) });
      }
    }
  } catch (e) {
    record({ phase: 'NARRATE', message: `(model unavailable: ${e.message.slice(0, 80)} — using fallback)` });
    return ruleTick();
  }
  return publicState();
}

// ---- routes ----
export function mountAgent(app) {
  app.get('/api/agent/state', (req, res) => res.json(publicState()));

  // the agent's brief — plain-language instruction + the actual system prompt (for the console)
  app.get('/api/agent/brief', (req, res) => res.json({ instruction: INSTRUCTION, system: SYSTEM, model: glm.model(), hasKey: glm.hasKey(), wallet: walletInfo(), paymentsLive: PAYMENTS_LIVE }));

  app.post('/api/agent/lens', (req, res) => {
    try { setLens((req.body || {}).lens, (req.body || {}).reason || 'Manual override by you'); res.json(publicState()); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.post('/api/agent/pause', (req, res) => {
    state.paused = !!(req.body && req.body.paused);
    record({ phase: 'NARRATE', message: state.paused ? 'Paused — you’ve taken the wheel.' : 'Resumed — I’ll keep an eye out.' });
    res.json(publicState());
  });

  app.post('/api/agent/budget', (req, res) => {
    const total = Number(req.body && req.body.total);
    if (total > 0) { state.budget.total = money(total); record({ phase: 'NARRATE', message: `Budget set to ${state.budget.total} pathUSD.` }); }
    res.json(publicState());
  });

  // generic decision append — used by the GLM loop (step 2) and for testing
  app.post('/api/agent/decision', (req, res) => {
    const { phase, message, lens, amount } = req.body || {};
    res.json(record({ phase: phase || 'NARRATE', message: message || '', lens, amount }));
  });

  // the agent's decision — GLM if a key is set, else a time-of-day rule
  app.post('/api/agent/tick', async (req, res) => {
    try { res.json(await runTick()); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // fallback cycle (no model) — kept for testing
  app.post('/api/agent/simulate', (req, res) => res.json(ruleTick()));

  // SSE stream for the live console
  app.get('/api/agent/stream', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders && res.flushHeaders();
    res.write(`event: snapshot\ndata: ${JSON.stringify(publicState())}\n\n`);
    const onDec = (e) => res.write(`event: decision\ndata: ${JSON.stringify(e)}\n\n`);
    bus.on('decision', onDec);
    const ka = setInterval(() => res.write(`: ka\n\n`), 25000);
    req.on('close', () => { bus.off('decision', onDec); clearInterval(ka); res.end(); });
  });

  // the console page (also reachable via express.static at /agent.html)
  app.get('/agent', (req, res) => res.sendFile(join(__dirname, '../public/agent.html')));
}

// seed one line so the console isn't empty before the agent has acted
record({ phase: 'NARRATE', message: 'AlgoMate online — watching your context.' });
