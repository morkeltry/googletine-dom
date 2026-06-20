<div align="center">

# 🎛️ YourAlgoMate

### Your content, *someone else's* algorithm — chosen by you, paid by the click.

**A marketplace of algorithms with a personal agent that runs your feed and pays the pennies.**

[**▶ Live app**](https://googletine.boxgeist.com) · [**🤖 Agent console**](https://googletine.boxgeist.com/agent) · [**📖 API docs**](API.md)

`Status: live` · `Model: GLM-5.2` · `Payments: MPP` · `Runtime: Node 22 + Puppeteer`

</div>

---

## What is this?

Today a platform owns **both** its content **and** the algorithm that ranks it — you can't have YouTube's videos without YouTube's feed. **YourAlgoMate unbundles them.** The content stays the platform's; the *ranking* becomes a thing **you choose**.

You pick a **lens** (e.g. *Developer* by day, *Cat Lover* by night). Behind the scenes a real YouTube session is driven on your behalf and mirrored in a clean UI that learns from every click. And a **personal agent** (GLM-5.2) watches your context, switches the lens to fit the moment, and **auto-pays the per-view micro-fees over MPP** — so it just feels free.

> **Try it:** open the [live app](https://googletine.boxgeist.com), pick a lens, click a video — the feed evolves. Then open the [agent console](https://googletine.boxgeist.com/agent) and hit **"Let the agent decide."**

---

## 🏆 Hackathon

Built for the **Futura Camp · MPP Hackathon** (sponsored by **[Tempo](https://tempo.xyz)**, creators of the [Machine Payments Protocol](https://mpp.dev)).

YourAlgoMate is a **consumer-facing reason for machine payments to exist**: an autonomous agent that pays sub-cent fees you'd never sign up and enter a card for by hand. That's the MPP story, made human.

| | |
|---|---|
| **Live demo** | https://googletine.boxgeist.com |
| **Agent console** | https://googletine.boxgeist.com/agent |
| **Track** | App (consumer + agentic) |
| **Payments** | MPP (Machine Payments Protocol) |
| **Agent model** | GLM-5.2 (Z.ai) |

---

## ✨ Features

- **Choose your algorithm** — switch between curated *lenses*; same content, a different feed.
- **Live, stateful sessions** — a persistent headless Chromium session per lens holds its own watch-history. Click a video and the feed genuinely **evolves**.
- **Blended Home** — "home" is built from everything the session engaged with, weighted by interest.
- **In-page playback** — videos play inside the app via the YouTube embed; never leave the site.
- **A personal agent (AlgoMate)** — GLM-5.2 senses time + activity, picks the right lens, pays, and **narrates every action** on a live console.
- **Real machine payments** — micro-fees settled over **MPP**, inside a budget you set.
- **Activity logging** — per-user searches & watches recorded for the agent's signal.

---

## 🧠 How it works

```
                         ┌─────────────── YourAlgoMate ───────────────┐
   You ──▶ Web UI ◀────▶ │  REST + SSE API                            │
 (browser)              │     │                                       │
                        │     ├─▶ Live session (Developer)  ─▶ youtube.com
                        │     ├─▶ Live session (Cat Lover)   ─▶ youtube.com
                        │     │      (persistent headless Chromium, 1 per lens)
                        │     │                                       │
                        │     ├─▶ Activity logger ── context ──▶ AlgoMate agent
                        │     │                                   (GLM-5.2)
                        │     └─▶ MPP payments ◀── approve_payment ──┘
                        └────────────────────────────────────────────┘
```

1. **Pick a lens → see a real feed.** A headless browser per lens drives YouTube; we mirror its state.
2. **Click a video → the feed reacts.** The session watches it; recommendations shift; history accumulates.
3. **The agent senses your context.** Time of day + recent activity → the right lens for the moment.
4. **It decides, acts, and explains itself.** GLM-5.2 switches the lens if it helps and narrates on the console.
5. **It pays for you over MPP.** The per-view fee is auto-settled within your budget — no checkout.

---

## 🚀 Quick start

### Prerequisites
- **Node.js 22+**
- **Chromium** — Puppeteer downloads its own by default; in Docker we use the system package.
- *(Optional)* a **Z.ai GLM Coding Plan** API key to power the live agent (it falls back to a time-of-day rule without one).

### Install & run
```bash
git clone https://github.com/morkeltry/googletine-dom
cd googletine-dom
npm install

# start the YourAlgoMate server (default :7070)
npm run start-server
#   → app:            http://localhost:7070
#   → agent console:  http://localhost:7070/agent
```

### Enable the live agent (optional)
```bash
export ZAI_API_KEY="<your Z.ai GLM Coding Plan key>"
export GLM_MODEL="glm-5.2"
npm run start-server
```

---

## ⚙️ Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|---|---|---|
| `LIVE_PORT` / `GOOGLETINE_SERVER_PORT` | `7070` | HTTP port for the server. |
| `ZAI_API_KEY` | — | Z.ai **GLM Coding Plan** key for the agent. Without it, the agent uses a simple time-of-day rule. |
| `GLM_MODEL` | `glm-5.2` | The GLM model id. |
| `GLM_BASE_URL` | `https://api.z.ai/api/coding/paas/v4` | OpenAI-compatible base URL. **Use the `coding` endpoint** for Coding-Plan keys. |

> 🔑 The API key is **never committed** — set it in your shell locally, or as an encrypted env var on your host (e.g. Coolify).

---

## 🔌 API

Full reference in **[API.md](API.md)**. Highlights:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/lenses` | Available lenses. |
| `GET` | `/api/feed?lens=` | Current mirrored feed + context + watch-history. |
| `POST` | `/api/search` | Run a search in the live session. |
| `POST` | `/api/watch` | Watch a video → feed evolves to recommendations. |
| `POST` | `/api/home` | The blended home feed. |
| `GET` | `/api/agent/state` | Agent state (active lens, budget, decisions). |
| `POST` | `/api/agent/tick` | Run one agent decision (GLM, or rule fallback). |
| `GET` | `/api/agent/stream` | SSE stream of the agent's live decision timeline. |
| `GET` | `/agent` | The agent console (web UI). |
| `GET` | `/health` | Health check. |

---

## 🐳 Deployment

The app ships a **Dockerfile** (Node 22 + system Chromium) and is deployed on **Coolify**.

```bash
# local container
docker compose up --build      # → http://localhost:7100
```

For production (Coolify / any Dockerfile host):
1. Point the platform at this repo, **build pack: Dockerfile**, exposed **port 7100**.
2. Set `ZAI_API_KEY` and `GLM_MODEL=glm-5.2` as **encrypted env vars** (not in the repo).
3. Deploy. The live instance runs at **[googletine.boxgeist.com](https://googletine.boxgeist.com)**.

> Build note: `npm ci` runs with `--legacy-peer-deps` (the `mppx` package declares a peerOptional `express>=5`; the app uses Express 4).

---

## 📂 Project structure

```
server/
  live-algo-server.js     The YourAlgoMate server (lenses, feed, REST + SSE API)
  agent/                  AlgoMate — the personal agent
    agent.js                state, decision loop, console endpoints
    glm.js                  minimal Z.ai (GLM) client, OpenAI-compatible
  public/                 the web UI (index.html) + agent console (agent.html)
  logs/                   activity logger (per-user searches & watches)
shared/
  payments/               MPP integration (mpp-client, mpp-server, sessions, …)
  providers/ personas/    persona engine (legacy proxy)
client/                   legacy payment proxy + payment modal UI
Dockerfile, docker-compose.yml   containerised deployment
API.md, CLI.md            full API + CLI reference
```

---

## 🗺️ Status & roadmap

**Working today:** live lenses · evolving feeds · blended home · in-page playback · the agent on GLM-5.2 · MPP payments · deployed in production.

**Next:** an agent scheduler (auto-switch by time/context) · persistent sessions across restarts · multi-user accounts · more lenses · beyond YouTube (X and other feed-driven platforms).

---

<div align="center">

**[googletine.boxgeist.com](https://googletine.boxgeist.com)** — your content, someone else's algorithm.

</div>
