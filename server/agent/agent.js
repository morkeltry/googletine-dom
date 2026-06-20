// AlgoMate — the personal feed agent (step 1: state + console endpoints).
//
// Holds the agent's state in memory (active lens, budget, decision log) and exposes
// it over a small REST + SSE API for the /agent console. The action functions
// (setLens / approvePayment / narrate / sense / decide) are what the GLM loop will
// call as tools in step 2.

import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as glm from './glm.js';
import * as activityLogger from '../logs/activity-logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bus = new EventEmitter();
bus.setMaxListeners(50);

const LENS_META = {
  dev: { id: 'dev', name: 'Developer', emoji: '👨‍💻' },
  cat: { id: 'cat', name: 'Cat Lover', emoji: '🐱' },
};

const state = {
  user: 'frank',
  activeLens: 'dev',
  paused: false,
  budget: { total: 2.0, spent: 0, currency: 'EUR' },
  decisions: [], // { id, ts, phase, message, lens?, amount? }
};

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

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

export function approvePayment(amount) {
  const amt = money(amount);
  if (state.budget.spent + amt > state.budget.total) {
    record({ phase: 'ACT', message: `Declined €${amt.toFixed(2)} — budget reached`, amount: amt, declined: true });
    return { ok: false, reason: 'budget exceeded', remaining: money(state.budget.total - state.budget.spent) };
  }
  state.budget.spent = money(state.budget.spent + amt);
  record({ phase: 'ACT', message: `Paid €${amt.toFixed(2)} via MPP`, amount: amt });
  return { ok: true, remaining: money(state.budget.total - state.budget.spent) };
}

export function getState() { return publicState(); }

// ---- the GLM decision loop (step 2) ----
const SYSTEM = `You are AlgoMate, a personal feed agent. You look after one human's YouTube
experience so they don't have to manage it.

Your job:
 • Keep their feed suited to the moment. Work hours (~9-17) -> the "dev" (Developer) lens.
   Evenings & weekends -> "cat" (Cat Lover, relaxation).
 • Watch their recent activity. If they're off-context, gently switch lenses — don't nag.
 • Pay the small per-view fee (about EUR 0.03) on their behalf, within budget.

Rules:
 • The human is in charge. Nudge, don't hijack. Keep actions minimal — doing nothing is valid.
 • If the active lens already fits the moment, do NOT switch; just narrate briefly.
 • After acting, always call narrate() once with a short, warm sentence.
 • Never spend beyond the remaining budget.

Use your tools: set_lens, approve_payment, narrate.`;

const TOOLS = [
  { type: 'function', function: { name: 'set_lens', description: 'Switch the human active feed lens.',
    parameters: { type: 'object', properties: {
      lens: { type: 'string', enum: ['dev', 'cat'], description: 'dev = Developer, cat = Cat Lover' },
      reason: { type: 'string', description: 'short, warm explanation shown to the human' } }, required: ['lens'] } } },
  { type: 'function', function: { name: 'approve_payment', description: 'Approve a micro-payment (EUR) for the feed, within budget.',
    parameters: { type: 'object', properties: { amount: { type: 'number', description: 'EUR amount, e.g. 0.03' } }, required: ['amount'] } } },
  { type: 'function', function: { name: 'narrate', description: 'Post one short warm sentence to the human about what you are doing.',
    parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } } },
];

function buildContext() {
  const now = new Date();
  const h = now.getHours();
  const dayPart = (h >= 18 || h < 6) ? 'evening / wind-down' : (h >= 9 && h < 17 ? 'work hours' : 'off-peak');
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
  const evening = h >= 18 || h < 6;
  const target = evening ? 'cat' : 'dev';
  sense(evening ? `Evening (${h}:00) — winding-down hours.` : `Work hours (${h}:00) — focus time.`);
  decide(evening ? 'Time to relax → switch to Cat Lover.' : 'Keep you productive → stay on Developer.');
  setLens(target, evening ? 'Switched you to cats for the evening. 🐱' : 'Keeping you on the Developer feed.');
  approvePayment(0.03);
  narrate(evening ? 'You’ve earned it — enjoy. 🐱' : 'In flow — I’ll stay out of your way.');
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
          else if (fn === 'approve_payment') result = JSON.stringify(approvePayment(args.amount));
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
    if (total > 0) { state.budget.total = money(total); record({ phase: 'NARRATE', message: `Budget set to €${state.budget.total.toFixed(2)}.` }); }
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
