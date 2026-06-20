# Googletine API Guide

## Overview

Googletine provides both **Live-Algo** endpoints (YouTube algorithm mirroring with Puppeteer) and **Legacy Proxy** endpoints for backward compatibility.

### Architecture

```
Browser → Client (6060) → Server (7070) → YouTube
                                  ↓
                            Live-Algo Functions
                            (Puppeteer sessions)
                                  ↓
                            Activity Logging
                                  ↓
                            YourAlgoMate (optional)
```

---

## Live-Algo Endpoints

### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "live-algo",
  "timestamp": 1781920122909,
  "lenses": ["dev", "cat"]
}
```

---

### `GET /api/lenses`

Get available lenses (personas).

**Response:**
```json
[
  {
    "id": "dev",
    "name": "Developer",
    "emoji": "👨‍💻",
    "when": "the 9-to-5 you",
    "seed": "fireship programming"
  },
  {
    "id": "cat",
    "name": "Cat Lover",
    "emoji": "🐱",
    "when": "the after-dark you",
    "seed": "funny cats compilation"
  }
]
```

---

### `POST /api/search`

Search YouTube using a specific lens. Creates a persistent session that tracks your watch history.

**Request:**
```json
{
  "lens": "dev",
  "query": "programming"
}
```

**Response:**
```json
{
  "feed": [
    {
      "id": "niWpfRyvs2U",
      "title": "7 Programming myths that waste your time",
      "channel": "Fireship",
      "meta": "1.5M views 1 year ago",
      "url": "https://www.youtube.com/watch?v=niWpfRyvs2U"
    }
  ],
  "context": "search · \"programming\"",
  "watched": [],
  "sources": [
    { "type": "search", "label": "programming" },
    { "type": "seed", "label": "fireship programming" }
  ]
}
```

**cURL example:**
```bash
curl -X POST http://localhost:7070/api/search \
  -H "Content-Type: application/json" \
  -d '{"lens":"dev","query":"javascript"}'
```

---

### `POST /api/watch`

Watch a video. This updates the lens's watch history and influences future recommendations.

**Request:**
```json
{
  "lens": "dev",
  "videoId": "niWpfRyvs2U",
  "title": "7 Programming myths that waste your time"
}
```

**Response:**
```json
{
  "feed": [
    {
      "id": "abc123",
      "title": "Recommended after watching...",
      "channel": "...",
      "meta": "...",
      "url": "..."
    }
  ],
  "context": "recommended after watching · \"7 Programming myths...\"",
  "watched": [
    { "id": "niWpfRyvs2U", "title": "7 Programming myths that waste your time" }
  ],
  "sources": [...]
}
```

**cURL example:**
```bash
curl -X POST http://localhost:7070/api/watch \
  -H "Content-Type: application/json" \
  -d '{"lens":"dev","videoId":"niWpfRyvs2U","title":"Programming myths"}'
```

---

### `POST /api/home`

Get a blended home feed based on all activity in the current session (seed + searches + watches). Uses round-robin across recent events to weight recommendations by engagement.

**Request:**
```json
{
  "lens": "dev"
}
```

**Response:**
```json
{
  "feed": [...],
  "context": "home · blended from 5 signals this session",
  "watched": [...],
  "sources": [...]
}
```

**cURL example:**
```bash
curl -X POST http://localhost:7070/api/home \
  -H "Content-Type: application/json" \
  -d '{"lens":"dev"}'
```

---

### `GET /api/feed?lens={lensId}`

Get the current feed for a lens without triggering a new action.

**Response:**
```json
{
  "feed": [...],
  "context": "search · \"programming\"",
  "watched": [...],
  "sources": [...]
}
```

---

## Legacy Proxy Endpoint

### `GET /request?url={url}`

Legacy proxy endpoint for backward compatibility with the client. Returns the current feed for YouTube URLs.

**cURL example:**
```bash
curl "http://localhost:7070/request?url=https://youtube.com"
```

---

## Activity Logging Endpoints

All searches and watches are automatically logged. These endpoints allow you to retrieve activity data.

### `GET /activity/:userId`

Get recent activity for a user (lens). UserId maps to `user-{lensId}` (e.g., `user-dev`).

**Parameters:**
- `limit` (optional, default: 50) - Number of entries to return

**cURL example:**
```bash
curl "http://localhost:7070/activity/user-dev?limit=20"
```

**Response:**
```json
{
  "userId": "user-dev",
  "activity": [
    {
      "timestamp": "1781920213(Sat)",
      "type": "search",
      "query": "javascript",
      "resultsCount": 16,
      "topResults": [...]
    },
    {
      "timestamp": "1781920250(Sat)",
      "type": "watch",
      "videoId": "niWpfRyvs2U",
      "title": "7 Programming myths...",
      "duration": null
    }
  ],
  "count": 2
}
```

---

### `GET /activity/:userId/summary`

Get activity summary for analysis (used for mood assessment).

**Parameters:**
- `hours` (optional, default: 24) - Time window in hours

**cURL example:**
```bash
curl "http://localhost:7070/activity/user-dev/summary?hours=24"
```

**Response:**
```json
{
  "userId": "user-dev",
  "timeWindow": "24h",
  "startTime": "2026-06-19T01:50:00.000Z",
  "endTime": "2026-06-20T01:50:00.000Z",
  "totalEntries": 15,
  "searchCount": 8,
  "watchCount": 5,
  "pageVisitCount": 2,
  "recentEntries": [...],
  "sessions": [...],
  "currentState": "working"
}
```

---

## CLI Reference

The `guil-cli.js` provides command-line persona management.

### Commands

#### `create <provider> <search-term> [name]`

Create a new persona by making a search request.

**Example:**
```bash
node guil-cli.js create youtube "programming tutorials" "My Dev Persona"
```

---

#### `list <provider> [persona-id]`

List all personas for a provider, or show details for a specific persona.

**Examples:**
```bash
# List all YouTube personas
node guil-cli.js list youtube

# Show specific persona details
node guil-cli.js list youtube persona-id-123
```

---

#### `request <provider> <persona-id> <search-term>`

Make a search request using a specific persona via the running server.

**Example:**
```bash
node guil-cli.js request youtube persona-id-123 "rust programming"
```

---

#### `stats [provider]`

Show usage statistics for all providers or a specific provider.

**Examples:**
```bash
# All stats
node guil-cli.js stats

# YouTube stats
node guil-cli.js stats youtube
```

---

#### `delete <provider> <persona-id>`

Delete a persona.

**Example:**
```bash
node guil-cli.js delete youtube persona-id-123
```

---

#### `config <key> [value]`

View or set configuration options.

**Examples:**
```bash
# View all config
node guil-cli.js config

# Set verbosity
node guil-cli.js config verbosity detailed
```

---

#### `help`

Show help message.

```bash
node guil-cli.js help
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLETINE_SERVER_PORT` | Server port | 7070 |
| `GOOGLETINE_CLIENT_PORT` | Client port | 6060 |
| `LIVE_PORT` | Live-algo server port (alias) | 7070 |
| `YOURALGOMATE_PORT` | YourAlgoMate AI service port | 30123 |
| `GOOGLETINE_SERVER_URL` | Server URL for CLI | `http://localhost:7070` |

---

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm start-server` | Start server on port 7070 |
| `npm start-client` | Start client on port 6060 |
| `npm watch-server` | Start server with auto-reload (nodemon) |
| `npm watch-client` | Start client with auto-reload (nodemon) |
| `npm stop` | Stop both server and client |
| `npm stop-server` | Stop server only |
| `npm stop-client` | Stop client only |

---

## Activity Log Files

Activity logs are stored in `server/logs/users/{userId}.json`:

```
server/logs/users/
├── user-dev.json
├── user-cat.json
└── ...
```

Each log file contains:
```json
{
  "userId": "user-dev",
  "createdAt": 1781920120000,
  "entries": [
    {
      "timestamp": "1781920213(Sat)",
      "type": "search",
      "query": "javascript",
      "resultsCount": 16,
      "topResults": [...]
    },
    {
      "timestamp": "1781920250(Sat)",
      "type": "watch",
      "videoId": "niWpfRyvs2U",
      "title": "7 Programming myths...",
      "duration": null
    }
  ]
}
```

---

## YourAlgoMate Integration (Optional)

The `server/youralgomate-proxy.js` module provides optional integration with the YourAlgoMate AI service for mood assessment and skills.

If YourAlgoMate is running on port 30123, you can:

```javascript
import youralgomateProxy from './server/youralgomate-proxy.js';

// Check availability
const available = await youralgomateProxy.isAvailable();

// Get mood assessment
const mood = await youralgomateProxy.getMoodAssessment('user-dev', 24);

// Invoke a skill
const result = await youralgomateProxy.invokeSkill('obsessions-monitor', 'user-dev', {
  search_history: "...",
  obsessions_list: "..."
});
```

---

## Quick Start

1. **Start the server:**
```bash
npm start-server
```

2. **Test health endpoint:**
```bash
curl http://localhost:7070/health
```

3. **Make a search:**
```bash
curl -X POST http://localhost:7070/api/search \
  -H "Content-Type: application/json" \
  -d '{"lens":"dev","query":"programming"}'
```

4. **Check activity logs:**
```bash
curl http://localhost:7070/activity/user-dev
```

---

## Lens IDs to User IDs Mapping

For activity logging, lens IDs are mapped to user IDs:

| Lens ID | User ID |
|---------|---------|
| `dev` | `user-dev` |
| `cat` | `user-cat` |
| *custom* | `user-{custom}` |

This mapping allows activity tracking per lens while maintaining separation between different personas.
