# Googletine

Payment-based proxy node for circumventing loginwalls and paywalls.

## Architecture

- **Server**: Accepts requests from clients, validates payments, serves content with cookie injection
- **Client**: Forwards browser requests to server nodes, handles payment flow

## Quick Start

```bash
# Install dependencies
npm install

# Start server (port 7070)
npm run start-server

# Start client (port 6060)
npm run start-client
```

## API Endpoints

### Client Endpoints (Port 6060)

The client forwards requests to the server and handles the payment flow.

#### Transparent GET Requests (Copy-Paste Friendly)

You can copy a URL from your browser and paste it directly after `/request/`:

```bash
# Copy and paste format - no encoding needed!
curl http://localhost:6060/request/youtube.com/watch?v=dQw4w9WgXcQ

# With https:// prefix
curl http://localhost:6060/request/https://youtube.com/watch?v=dQw4w9WgXcQ

# With persona parameter (gets stripped before forwarding)
curl http://localhost:6060/request/youtube.com/watch?v=123&persona=my-persona-id

# With use_persona parameter
curl http://localhost:6060/request/youtube.com?use_persona=true
```

#### Query String Format

```bash
# URL as query parameter
curl "http://localhost:6060/request?url=https://youtube.com"

# With persona
curl "http://localhost:6060/request?url=https://youtube.com&persona=my-id"
```

#### Other Client Endpoints

```bash
# Health check
curl http://localhost:6060/health

# Info and available endpoints
curl http://localhost:6060/
```

### Server Endpoints (Port 7070)

The server accepts requests, validates payments, and serves content.

#### GET Requests

```bash
# Direct URL path (most transparent)
curl http://localhost:7070/request/youtube.com

# With query string
curl "http://localhost:7070/request?url=https://youtube.com"

# With persona parameter
curl "http://localhost:7070/request?url=https://youtube.com&persona=persona-123"
```

#### POST Requests (Original Format)

```bash
curl -X POST http://localhost:7070/request \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/results?search_query=pigs",
    "payment": {
      "success": true,
      "transactionId": "test-1234567890",
      "amount": 1000
    },
    "personaId": "persona-1781711823510-d7ytm25gr"
  }'
```

#### Other Server Endpoints

```bash
# Health check and endpoint list
curl http://localhost:7070/health

# List all loaded personas
curl http://localhost:7070/personas

# Show server statistics
curl http://localhost:7070/personas/stats

# Reload personas from database
curl -X POST http://localhost:7070/personas/reload

# Session management
curl http://localhost:7070/session
curl http://localhost:7070/session/session-id-here
```

### Local Parameters

When using GET requests, these parameters are handled locally and stripped before proxying to the destination:

- `persona` - Specify which persona ID to use for the request
- `use_persona` - Set to `true` to enable persona rotation (if configured)

Example: `curl "http://localhost:6060/request/youtube.com?persona=my-id&use_persona=true"`

## Payment Flow

1. Client forwards request to server without payment
2. Server returns 402 with payment request
3. Client executes payment (stubbed for now)
4. Client retries request with payment
5. Server validates payment and serves content

## TODO: MPP Integration

The payment functions in `shared/payments/stub.js` are placeholders for MPP integration:
- `doPayment()` - Client-side payment execution
- `receivePayment()` - Server-side payment validation
- `requestPayment()` - Server-side payment request generation

## Configuration

Environment variables:
- `GOOGLETINE_SERVER_PORT` - Server port (default: 7070)
- `GOOGLETINE_CLIENT_PORT` - Client port (default: 6060)
