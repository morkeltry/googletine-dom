# YourAlgoMate

Service connected to set.ai using GLM model with multi-user support and skills.

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
  "userId": "user1",
  "enableSkills": true
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
  "timestamp": "2026-06-20T00:00:00.000Z",
  "skills_loaded": 3
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

### GET /skills

Get list of available skills.

**Response:**
```json
{
  "skills": [
    {
      "id": "time-awareness",
      "name": "Time Awareness",
      "description": "Tell the current day and time",
      "enabled": true
    },
    {
      "id": "mood-assessment",
      "name": "Mood Assessment",
      "description": "Assess user's mood from their search history",
      "enabled": true
    },
    {
      "id": "obsessions-monitor",
      "name": "Obsessions Monitor",
      "description": "Monitor and report on user's topics of interest",
      "enabled": true
    }
  ],
  "registry": {...}
}
```

### GET /skills/:skillId

Get details for a specific skill.

### POST /skills/:skillId/invoke

Invoke a specific skill directly.

**Request:**
```json
{
  "userId": "user1",
  "parameters": {
    "search_history": "...",
    "obsessions_list": "..."
  }
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
4. Active skills context

## Skills

Skills are modular capabilities that enhance the AI's responses. Each skill has:
- `id`: Unique identifier
- `name`: Display name
- `description`: What the skill does
- `enabled`: Whether the skill is active
- `prompt`: Skill-specific prompt template
- `parameters`: Required/optional parameters

### Available Skills

**Time Awareness**
- Tells the current day and time
- Automatically provides current timestamp in requests

**Mood Assessment**
- Analyzes user's mood from search history
- Requires: search_history, recent_interactions, activity_patterns

**Obsessions Monitor**
- Tracks and reports on topics of interest
- Current obsessions:
  - Ethereum price (hourly updates)
  - Middle East conflicts (daily)
  - Cybersecurity events (daily)
  - DeFi hacks (daily)
  - UK politics/Keir Starmer (daily)

### Adding New Skills

Create a new JSON file in `skills/` directory:

```json
{
  "id": "your-skill-id",
  "name": "Your Skill Name",
  "description": "What your skill does",
  "enabled": true,
  "prompt": "Your skill prompt template with {parameters}",
  "parameters": {
    "param1": "{value1}"
  }
}
```

Then update `skills/index.json` to register the skill.

## Integration

This service will be called from a server on another branch.
