# YourAlgoMate

Service connected to set.ai using GLM model with multi-user support.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

3. Update `.env` with your set.ai API credentials and default user.

4. Customize prompts in `prompts/` folder:
- `system.txt` - System prompt for the AI (shared by all users)
- `users/user1.txt` - User prompt for user1
- `users/user2.txt` - User prompt for user2
- Add more user prompts as needed

## Running

Start the service:
```bash
npm start
```

Or in development mode with auto-reload:
```bash
npm run dev
```

## API

### POST /request

Process a request with the GLM model for a specific user.

**Request:**
```json
{
  "userMessage": "Your question or request here",
  "userId": "user1"
}
```

If `userId` is not provided, uses `DEFAULT_USER` from `.env`.

**Response:**
```json
{
  "success": true,
  "userId": "user1",
  "response": "AI response here",
  "timestamp": "2026-06-20T00:00:00.000Z"
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "youralgomate",
  "timestamp": "2026-06-20T00:00:00.000Z"
}
```

### GET /users

Get list of available users.

**Response:**
```json
{
  "users": ["user1", "user2"],
  "default": "user1"
}
```

## Multi-User Structure

Each user has their own prompt file in `prompts/users/`:
- `user1.txt` - Custom prompt for user1
- `user2.txt` - Custom prompt for user2
- Add more as needed

The system combines:
1. System prompt (shared)
2. User-specific prompt
3. Current user message

## Integration

This service will be called from a server on another branch.
