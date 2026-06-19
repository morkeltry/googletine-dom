# Googletine

**A "choice of algorithm" service.** The content can be YouTube videos (or, later, other
platforms), but the *feed* is built by an algorithm **you** pick — not the platform's. Micro-payments
(planned: [MPP](https://mpp.dev)) gate access; an agent can auto-pay so it feels frictionless.

> ⚠️ **This codebase is mid-experiment and not yet cleaned up.** It currently holds **two largely
> independent systems** plus a pile of research scripts. This README is a map so you can navigate it.

---

## The two systems (read this first)

| | What it is | Run it | Port |
|---|---|---|---|
| **`live-algo/`** | **The current direction.** A live, stateful prototype: one persistent headless-Chromium YouTube session per "lens" (Developer / Cat Lover). Click a video → the session watches it → the feed evolves. Search + a blended Home. | `node live-algo/server.mjs` | **7100** |
| **`client/` + `server/`** | **The legacy proxy.** A two-node payment proxy: the *client* sits in front of your browser and forwards to the *server*, which pays a (stubbed) toll and fetches the page with persona cookies injected. | `npm run start-server` & `npm run start-client` | **7070** / **6060** |

Everything else (`shared/`, `guil-cli.js`, `consent-automation/`, `test-*.js`) supports the legacy proxy
or is standalone research.

### Quick start
```bash
npm install

# The current prototype:
node live-algo/server.mjs            # → open http://localhost:7100

# OR the legacy proxy (two terminals):
npm run start-server                 # :7070
npm run start-client                 # :6060  → curl http://localhost:6060/request/example.com
```

---

## Annotated file tree

```
googletine/
│
├── live-algo/                         ★ THE CURRENT PROTOTYPE (live, stateful)
│   ├── server.mjs                     Express + persistent Puppeteer. One live YouTube session per
│   │                                  lens; REST API: /api/feed, /api/search, /api/watch, /api/home
│   │                                  (Home = our own feed, blended from the session's activity).
│   └── public/
│       └── index.html                 Single-page app that mirrors & drives the sessions: click→watch
│                                      →feed evolves, search, blended Home, in-page YouTube embed player.
│
├── client/                            LEGACY proxy — "client node" (sits in front of your browser, :6060)
│   └── express/
│       ├── constants.js               Client config: remote node list, port 6060, session timeout.
│       └── src/
│           ├── index.js               Startup: listen + retry on EADDRINUSE, SIGHUP shutdown.
│           ├── server.js              Express app + routes (/request, /request/*, /health, /).
│           ├── forwardRequest.js      Core: forward request to a server node, run the 402→pay→retry
│           │                          loop, stream the response back to the browser.
│           └── personas.js            Client-side YouTube persona loading / rotation helpers.
│
├── server/                            LEGACY proxy — "server node" (does the fetching, :7070)
│   ├── express/
│   │   ├── constants.js               Server config: port 7070, canned medium/twitter cookies, pricing.
│   │   └── src/
│   │       ├── index.js               Startup (same retry/SIGHUP pattern as the client).
│   │       ├── server.js              Express app + routes (/request, /personas, /session, /health).
│   │       ├── acceptPageRequest.js   Core: validate payment, fetch URL with persona cookies injected,
│   │       │                          render 402 pages, rewrite Set-Cookie to localhost, stream back.
│   │       └── openSession.js         In-memory session create / get / cleanup (placeholder).
│   ├── data/
│   │   └── .googletine-db.json        Persisted personas database (gitignored).
│   └── dom-server.js                  Standalone EXPERIMENT (:60123): serves rendered YouTube via a
│                                      Puppeteer DOM forwarder. Separate from the express server above.
│
├── shared/                            Libraries used by the legacy proxy + the CLI
│   ├── personas/
│   │   ├── Persona.js                 Base Persona: cookies, headers, state, Set-Cookie parsing.
│   │   └── PersonaManager.js          Base persona pool: rotation strategies, expiry, stats.
│   ├── providers/
│   │   ├── index.js                   Provider exports + createPersonaManager(provider) factory.
│   │   ├── youtube.js                 YouTubePersona + manager (YouTube cookie logic, consent init).
│   │   ├── twitter.js                 TwitterPersona + manager (Twitter/X).
│   │   └── youtube-consent-handler.js Puppeteer helper that clicks through YouTube's consent dialog.
│   └── payments/
│       ├── stub.js                    Stubbed payments (doPayment / receivePayment / requestPayment).
│       │                              This is the seam where MPP will plug in. Always "succeeds".
│       └── headers.js                 X-Payment / X-Payment-Required header encode + parse helpers.
│
├── guil-cli.js                        CLI to create / list / test / delete personas (see CLI.md).
│                                      Reads & writes server/data/.googletine-db.json.
│
├── consent-automation/                Standalone research tool (its own package.json)
│   ├── automate-consent.js            Opens YouTube cookie-free, clicks "Accept", captures
│   │                                  screenshots + cookies + network activity.
│   ├── automate-consent-headless.js   Headless variant of the above.
│   ├── output/                        Captured screenshots (*.png) and cookie snapshots (*.json).
│   └── package.json / -lock.json      Its own dependencies.
│
├── consentautomation/                 ⚠️ near-duplicate folder — only a README documenting the
│   └── README.md                      consent-flow findings (the code lives in consent-automation/).
│
├── youtube-dom-forwarder.js           Standalone Puppeteer EXPERIMENT: open YouTube, handle consent,
│                                      search a list of terms, return the rendered DOM. (Superseded in
│                                      spirit by live-algo/, kept for reference.)
│
├── overlay-analysis.txt               Research notes on YouTube's grey-overlay problem.
│
├── test-*.js                          Ad-hoc experiment / smoke scripts (NOT a real test runner):
│   ├── test-cli.js                    Tests for guil-cli.js  (this is what `npm test` runs).
│   ├── test-personas.js               Persona management checks.
│   ├── test-rotation.js               Persona rotation suite.
│   ├── test-cookie-injection.js       Cookie injection check.
│   ├── test-header-proxying.js        Header/cookie proxying via curl.
│   ├── test-transparent-requests.js   Transparent GET (/request/<url>) checks.
│   ├── test-youtube-cookies.js        Inspect what cookies YouTube returns on a fresh request.
│   └── test-youtube-dom-forwarder.js  Exercise youtube-dom-forwarder.js.
│
├── test-results.log                   Captured output from a past test run.
├── CLI.md                             Guide for guil-cli.js (the persona CLI).
├── package.json                       Deps (express, puppeteer, cookie-parser) + npm scripts.
└── README.md                          You are here.
```

---

## npm scripts (`package.json`)

| Script | Does |
|---|---|
| `npm run start-server` / `start-client` | Boot the legacy proxy nodes (:7070 / :6060). |
| `npm run watch-server` / `watch-client` | Same, via nodemon (auto-restart on change). |
| `npm run stop` / `stop-server` / `stop-client` | Kill the proxy nodes. |
| `npm run persona -- <args>` | Run the persona CLI (`guil-cli.js`). See `CLI.md`. |
| `npm test` | Runs `test-cli.js` (note: just one of the ad-hoc scripts). |

> The live-algo prototype is **not** in npm scripts yet — run it directly: `node live-algo/server.mjs`.

---

## Known rough edges (cleanup candidates)

- **Two systems in one repo** — the new `live-algo/` and the legacy `client/`+`server/` proxy are
  mostly independent; only the legacy side uses `shared/` and `guil-cli.js`.
- **Duplicate consent folders** — `consent-automation/` (code) vs `consentautomation/` (just a README).
- **Scattered `test-*.js`** at the root are experiment scripts, not a test suite; only `test-cli.js`
  is wired to `npm test`.
- **Multiple Puppeteer entrypoints** — `live-algo/server.mjs`, `server/dom-server.js`,
  `youtube-dom-forwarder.js`, and `consent-automation/*` all drive a browser in different ways.
- **`server/express/src/index.js`** crashes on `EADDRINUSE` (buggy `netstat` parse) — free the port first.
- **Payments are stubbed** (`shared/payments/stub.js`) — MPP integration is the planned replacement.

## Ports at a glance

| Port | Process |
|---|---|
| 6060 | legacy client node |
| 7070 | legacy server node |
| 7100 | live-algo prototype |
| 60123 | `server/dom-server.js` (experiment) |
