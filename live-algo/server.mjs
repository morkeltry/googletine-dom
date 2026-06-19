// Googletine — LIVE algorithm sessions.
// One persistent headless Chromium page per lens. Our page is a mirror; clicking/searching
// drives the real YouTube session, whose watch-history makes the feed evolve.

import express from 'express';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.LIVE_PORT || 7100;

const LENSES = {
  dev: { id: 'dev', name: 'Developer', emoji: '👨‍💻', when: 'the 9-to-5 you', seed: 'fireship programming' },
  cat: { id: 'cat', name: 'Cat Lover', emoji: '🐱', when: 'the after-dark you', seed: 'funny cats compilation' },
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const NUKE = `document.querySelectorAll('[class*="overlay"],[class*="backdrop"],[class*="blanket"],tp-yt-iron-overlay-backdrop,ytd-consent-bump-v2-lightbox').forEach(el=>el.remove());`;

let browser = null;
const sessions = new Map(); // lensId -> { page, feed, context, watched, lock }

async function getBrowser() {
  if (!browser) {
    console.log('[live] launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      defaultViewport: { width: 1366, height: 900 },
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=en-US', '--mute-audio'],
    });
  }
  return browser;
}

// serialise all page ops per lens so we never drive one page concurrently
function withLock(s, fn) {
  s.lock = s.lock.then(fn, fn);
  return s.lock;
}

// "Home" = a blend of recommendations from every interest event this session has had
// (seed + each watch + each search). Round-robin across recent events, so the home feed
// is weighted by how much you've engaged with each interest. Most-recent events lead.
function blendedHome(s, max = 18) {
  const watched = new Set(s.watched.map((w) => w.id));
  const lists = s.events.slice(-8).map((e) => e.videos.filter((v) => !watched.has(v.id))).reverse();
  const out = [], seen = new Set();
  let i = 0, added = true;
  while (out.length < max && added) {
    added = false;
    for (const list of lists) {
      const v = list[i];
      if (v && !seen.has(v.id)) { seen.add(v.id); out.push(v); added = true; if (out.length >= max) break; }
    }
    i++;
  }
  return out;
}
function blendSources(s) {
  return s.events.slice(-8).map((e) => ({ type: e.type, label: e.label })).reverse();
}

async function dismissConsent(page) {
  await delay(1200);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button,tp-yt-paper-button,ytd-button-renderer')]
      .find((x) => /reject all|accept all|i agree/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await delay(1200);
  await page.evaluate(NUKE);
}

// extract a list of videos. Handles both the classic search/home renderers AND the new
// yt-lockup-view-model used for watch-page recommendations ("up next").
function extractVideos(page, max = 16) {
  return page.evaluate((max) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().replace(/^•\s*/, '').replace(/\s*•\s*/g, ' · ');
    const out = [];
    const push = (id, title, channel, meta) => { if (id && title) out.push({ id, title, channel, meta, url: 'https://www.youtube.com/watch?v=' + id }); };

    // classic search results & home grid
    document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer').forEach((el) => {
      const t = el.querySelector('#video-title');
      let href = '';
      for (const a of el.querySelectorAll('a')) { const h = a.getAttribute('href') || ''; if (h.includes('/watch')) { href = h; break; } }
      const title = t ? (t.getAttribute('title') || t.textContent || '').trim() : '';
      const m = href.match(/[?&]v=([^&]+)/);
      if (!title || !m) return;
      const ch = el.querySelector('ytd-channel-name a, #channel-name a, ytd-channel-name #text, #channel-name #text');
      const meta = el.querySelector('#metadata-line');
      push(m[1], title, ch ? clean(ch.textContent) : '', meta ? clean(meta.textContent) : '');
    });

    // new watch-page recommendation lockups
    document.querySelectorAll('yt-lockup-view-model').forEach((el) => {
      const a = el.querySelector('a[href*="/watch"]');
      const tEl = el.querySelector('a[title]') || el.querySelector('h3');
      const title = tEl ? (tEl.getAttribute('title') || tEl.textContent || '').trim() : '';
      const href = a ? a.getAttribute('href') : '';
      const m = href.match(/[?&]v=([^&]+)/);
      if (!title || !m) return;
      const chA = el.querySelector('a[href*="/@"], a[href*="/channel/"], a[href*="/c/"]');
      const texts = [...el.querySelectorAll('.yt-content-metadata-view-model-wiz__metadata-text')].map((x) => clean(x.textContent)).filter(Boolean);
      const channel = chA ? clean(chA.textContent) : (texts[0] || '');
      const meta = texts.filter((t) => t && t !== channel).join(' · ');
      push(m[1], title, channel, meta);
    });

    const seen = new Set(), res = [];
    for (const v of out) { if (!seen.has(v.id)) { seen.add(v.id); res.push(v); } }
    return res.slice(0, max);
  }, max);
}

async function initSession(lensId) {
  const lens = LENSES[lensId];
  const b = await getBrowser();
  const page = await b.newPage();
  await page.setUserAgent(UA);
  const s = { page, feed: [], context: 'starting…', watched: [], events: [], lock: Promise.resolve() };
  sessions.set(lensId, s);

  console.log(`[live:${lensId}] init — seeding with "${lens.seed}"`);
  await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await dismissConsent(page);
  // seed the session with a representative search so there's an initial feed
  await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(lens.seed)}`, { waitUntil: 'domcontentloaded', timeout: 35000 });
  try { await page.waitForSelector('ytd-video-renderer', { timeout: 12000 }); } catch {}
  await delay(700);
  s.feed = await extractVideos(page, 16);
  s.context = `seed search · "${lens.seed}"`;
  s.events.push({ type: 'seed', label: lens.seed, videos: s.feed });
  console.log(`[live:${lensId}] ready — ${s.feed.length} videos`);
  return s;
}

async function ensure(lensId) {
  if (!LENSES[lensId]) throw new Error('unknown lens');
  if (sessions.has(lensId)) return sessions.get(lensId);
  // init under a placeholder lock so concurrent callers wait
  const pending = initSession(lensId);
  return pending;
}

async function doSearch(lensId, query) {
  const s = await ensure(lensId);
  return withLock(s, async () => {
    console.log(`[live:${lensId}] search "${query}"`);
    await s.page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await s.page.evaluate(NUKE);
    try { await s.page.waitForSelector('ytd-video-renderer', { timeout: 12000 }); } catch {}
    await delay(500);
    s.feed = await extractVideos(s.page, 16);
    s.context = `search · "${query}"`;
    s.events.push({ type: 'search', label: query, videos: s.feed });
    return { feed: s.feed, context: s.context, watched: s.watched, sources: blendSources(s) };
  });
}

async function doWatch(lensId, videoId, title) {
  const s = await ensure(lensId);
  return withLock(s, async () => {
    console.log(`[live:${lensId}] WATCH ${videoId} — ${title || ''}`);
    await s.page.goto(`https://www.youtube.com/watch?v=${videoId}`, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await s.page.evaluate(NUKE);
    // let the watch register & the up-next column populate
    try { await s.page.waitForSelector('yt-lockup-view-model', { timeout: 12000 }); } catch {}
    await delay(2500);
    if (title) s.watched.push({ id: videoId, title });
    const recs = await extractVideos(s.page, 16);
    s.feed = recs;
    s.context = `recommended after watching · "${(title || videoId).slice(0, 48)}"`;
    s.events.push({ type: 'watch', label: title || videoId, videos: recs });
    console.log(`[live:${lensId}] now recommends ${recs.length} videos`);
    return { feed: s.feed, context: s.context, watched: s.watched, sources: blendSources(s) };
  });
}

// Home = our OWN blended feed, built from the session's accumulated interest events.
// No browser navigation needed → instant, and signed-out-friendly.
async function goHome(lensId) {
  const s = await ensure(lensId);
  return withLock(s, async () => {
    s.feed = blendedHome(s, 18);
    const n = s.events.length;
    s.context = n > 1 ? `home · blended from ${n} signals this session` : `home · seed "${LENSES[lensId].seed}"`;
    return { feed: s.feed, context: s.context, watched: s.watched, sources: blendSources(s) };
  });
}

// ---- HTTP API ----
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

app.get('/api/lenses', (req, res) => res.json(Object.values(LENSES)));

app.get('/api/feed', async (req, res) => {
  try {
    const s = await ensure(req.query.lens);
    res.json({ feed: s.feed, context: s.context, watched: s.watched, sources: blendSources(s) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/search', async (req, res) => {
  try { res.json(await doSearch(req.body.lens, req.body.query)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/watch', async (req, res) => {
  try { res.json(await doWatch(req.body.lens, req.body.videoId, req.body.title)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/home', async (req, res) => {
  try { res.json(await goHome(req.body.lens)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`[live] Googletine live-algo server on http://localhost:${PORT}`));

process.on('SIGINT', async () => { if (browser) await browser.close(); process.exit(0); });
process.on('SIGTERM', async () => { if (browser) await browser.close(); process.exit(0); });
