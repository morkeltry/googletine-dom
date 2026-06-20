# Googletine-DOM

**Payment-based proxy node for circumventing loginwalls and algorithm mirroring.**

A two-tier architecture where a **client** handles payments and forwards requests to a **server** that fetches, renders, and serves content with proper payment flow.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP requests
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Client (Port 6060)                                             │
│  - Handles payment authorization                                │
│  - Shows payment modal to user                                  │
│  - Manages MPP payment channels                                 │
│  - Forwards requests to server                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Forwarded with payment
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Server (Port 7070)                                             │
│  - Validates payments                                           │
│  - Fetches pages using Puppeteer                                │
│  - Renders and processes HTML                                   │
│  - Returns 402 if no payment                                    │
│  - Returns content if payment valid                            │
└─────────────────────────────────────────────────────────────────┘
```

## Payment Flow

1. **Browser requests URL** → `localhost:6060/https://youtube.com`
2. **Client forwards** → `localhost:7070/request?url=https://youtube.com`
3. **Server checks payment** → Returns 402 + payment details if no payment
4. **Client receives 402** → Redirects user to payment modal
5. **User authorizes** → Selects amount ($1-$10 USDC)
6. **Client retries** → With payment in headers
7. **Server validates** → Fetches, renders, returns HTML page
8. **Client streams** → HTML content to browser

## Quick Start

```bash
# Install dependencies
npm install

# Start server (port 7070)
npm run start-server

# Start client (port 6060)
npm run start-client

# Access via client (all equivalent)
curl http://localhost:6060/youtube.com
curl http://localhost:6060/https://youtube.com
curl http://localhost:6060/request/https://youtube.com
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLETINE_SERVER_PORT` | `7070` | Server port |
| `GOOGLETINE_CLIENT_PORT` | `6060` | Client port |
| `LIVE_PORT` | `7070` | Live-algo server port |
| `ZAI_API_KEY` | — | Z.ai API key for agent (optional) |
| `GLM_MODEL` | `glm-5.2` | GLM model for agent |

## Client Endpoints (Port 6060)

### Page Request Endpoints

| Method | Endpoint | Description |
|-------|----------|-------------|
| `GET` | `/request?url=<url>` | Forward request to server with query parameter |
| `GET` | `/request/<url>` | Transparent URL forwarding |
| `GET` | `/*` | Catch-all: simpler alias (e.g., `/youtube.com`) |

### Payment Endpoints

| Method | Endpoint | Description |
|-------|----------|-------------|
| `GET` | `/payment/auth` | Payment authorization modal |
| `POST` | `/payment/authorize` | Authorize payment (amount + userId) |
| `GET` | `/payment/auth/check` | Check authorization status |
| `GET` | `/payment/status/:sessionId` | Payment session status |

### Other Endpoints

| Method | Endpoint | Description |
|-------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/` | API info and available endpoints |

## Server Endpoints (Port 7070)

### Page Request Endpoint

| Method | Endpoint | Description |
|-------|----------|-------------|
| `GET` | `/request?url=<url>` | Fetch and render page with payment flow |

**Behavior:**
- No payment → Returns 402 with payment required HTML
- Invalid payment → Returns 402 with error HTML
- Valid payment → Fetches URL, renders with Puppeteer, returns HTML

### Live-Algo API Endpoints

| Method | Endpoint | Description |
|-------|----------|-------------|
| `GET` | `/` | Main web UI |
| `GET` | `/api/lenses` | Available algorithm lenses |
| `GET` | `/api/feed?lens=<id>` | Current feed for lens |
| `POST` | `/api/search` | Search in live session (requires payment) |
| `POST` | `/api/watch` | Watch video (requires payment) |
| `POST` | `/api/home` | Blended home feed (requires payment) |
| `GET` | `/health` | Health check |
| `GET` | `/agent` | Agent console UI |

### Activity Endpoints

| Method | Endpoint | Description |
|-------|----------|-------------|
| `GET` | `/activity/:userId` | Recent activity for user |
| `GET` | `/activity/:userId/summary` | Activity summary (hours parameter) |

## CLI Commands

### Start/Stop Services

```bash
# Start services
npm run start-server    # Start server on port 7070
npm run start-client    # Start client on port 6060

# Stop services
npm run stop            # Stop both server and client
npm run stop-server     # Stop server only
npm run stop-client     # Stop client only

# Watch mode (auto-reload on changes)
npm run watch-server    # Server with auto-reload
npm run watch-client    # Client with auto-reload
```

### Persona Management

```bash
# Persona CLI
npm run persona

# Available commands (use --help for more):
# - List personas
# - Create persona
# - Delete persona
# - Show persona details
```

### Testing

```bash
# Run CLI tests
npm run test
npm run test:cli
```

## Usage Examples

### Browser Access (via Client)

```bash
# All these work the same:
curl http://localhost:6060/youtube.com
curl http://localhost:6060/https://youtube.com
curl http://localhost:6060/request/https://youtube.com
curl "http://localhost:6060/request?url=https://youtube.com"
```

### With Payment (Manual Testing)

```bash
# This will return 402 payment required
curl http://localhost:6060/youtube.com

# After authorizing via payment modal, requests succeed
# (client automatically includes payment header)
```

### Live-Algo Feature

```bash
# Get available lenses
curl http://localhost:7070/api/lenses

# Get feed for lens (without payment - may return 402)
curl http://localhost:7070/api/feed?lens=dev

# Search (with payment)
curl -X POST http://localhost:7070/api/search \
  -H "Content-Type: application/json" \
  -H "X-Payment: '{\"transactionId\":\"test-123\",\"amount\":1000}'" \
  -d '{"lens":"dev","query":"programming"}'
```

## Payment Configuration

**Cost Structure:**
- Per-page cost: 1000 units ($0.001 USDC)
- Max single payment: 20,000 units ($0.02 USDC)
- Authorization options: $1, $2, $5, $10 USDC

**MPP Integration:**
- Client manages MPP payment channels
- User authorizes "up to" amount (e.g., $1 USDC)
- Client signs individual micro-payments automatically
- Server validates payments via MPP protocol

## Project Structure

```
googletine-dom/
├── client/
│   └── express/
│       ├── src/
│       │   ├── server.js           # Client server (port 6060)
│       │   ├── forwardRequest.js    # Request forwarding logic
│       │   └── personas.js          # Persona management
│       └── public/
│           └── payment/              # Payment authorization modal
│               ├── index.html
│               ├── css/
│               └── js/
├── server/
│   ├── live-algo-server.js          # Main server (port 7070)
│   ├── dom-server.js                # Legacy DOM server (unused)
│   ├── youralgomate-proxy.js        # YourAlgoMate AI integration
│   ├── agent/                        # AlgoMate agent
│   ├── public/                       # Web UI
│   └── logs/                         # Activity logging
├── shared/
│   ├── payments/                     # MPP payment integration
│   ├── providers/                    # Content providers (YouTube, etc.)
│   └── personas/                     # Persona engine
├── API.md                            # Full API documentation
├── CLI.md                            # CLI reference
└── README.md                         # This file
```

## Deployment

### Docker

```bash
# Build and run
docker compose up --build

# Access
# - Client: http://localhost:6060
# - Server: http://localhost:7070
```

### Production

1. Set environment variables (ports, API keys)
2. Deploy server and client separately
3. Configure MPP payment channels
4. Set up reverse proxy if needed

## Development

**Payment Modal Development:**

The payment modal is based on MPP.dev templates. Key files:
- `/client/public/payment/index.html` - Modal UI
- `/client/public/payment/js/authorize.js` - Authorization logic
- `/client/public/payment/css/modal.css` - Styling

**Payment Flow Debugging:**

```bash
# Check authorization status
curl http://localhost:6060/payment/auth/check?userId=test-user

# Test payment endpoint
curl -X POST http://localhost:6060/payment/authorize \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user","amount":1000000}'
```

## Status & Roadmap

**Working:**
- ✅ Client-server architecture
- ✅ Payment flow with 402 responses
- ✅ Puppeteer HTML rendering
- ✅ Payment authorization modal
- ✅ Transparent URL forwarding
- ✅ Live-algo feature with lenses

**In Progress:**
- 🔄 MPP payment channel integration
- 🔄 Multi-session support
- 🔄 Enhanced payment modal

**Planned:**
- 📋 Persistent sessions across restarts
- 📋 Multi-user accounts
- 📋 Beyond YouTube (X, other platforms)
- 📋 Agent scheduler (auto-switch by context)
