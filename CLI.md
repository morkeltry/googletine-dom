# Googletine CLI

Command-line interface for managing personas and making requests through the proxy system.

## Quick Start

```bash
# Show all available commands
node guil-cli.js help
```

## Commands

### Create a Persona

Create a new persona for making requests to YouTube or Twitter.

```bash
# Create a YouTube persona with search term "pig research"
node guil-cli.js create youtube "pig research"

# Create a YouTube persona with custom name
node guil-cli.js create youtube "pig research" "My Pig Research Persona"

# Create a Twitter persona
node guil-cli.js create twitter "technology news"
```

### List Personas

View all personas or filter by provider.

```bash
# List all personas from all providers
node guil-cli.js list

# List only YouTube personas
node guil-cli.js list youtube

# List only Twitter personas
node guil-cli.js list twitter

# Show details for a specific persona
node guil-cli.js list youtube persona-1781711823510-d7ytm25gr
```

### Make a Test Request

Make a request using a specific persona. Useful for testing and debugging.

```bash
# Make a YouTube search request
node guil-cli.js request youtube persona-1781711823510-d7ytm25gr "funny cats"

# Make a Twitter search request
node guil-cli.js request twitter persona-1781711823510-d7ytm25gr "javascript"
```

### Delete a Persona

Remove a persona from the database.

```bash
# Delete a specific YouTube persona
node guil-cli.js delete youtube persona-1781711823510-d7ytm25gr

# Delete a specific Twitter persona
node guil-cli.js delete twitter persona-1781711823510-d7ytm25gr
```

### View Statistics

See statistics about personas and their usage.

```bash
# Show statistics for all providers
node guil-cli.js stats

# Show statistics for YouTube only
node guil-cli.js stats youtube

# Show statistics for Twitter only
node guil-cli.js stats twitter
```

### Configuration

View or change CLI settings.

```bash
# View current configuration
node guil-cli.js config

# Change verbosity level (affects request output)
node guil-cli.js config verbosity json

# Available verbosity levels:
# - titles    : Show video titles (default)
# - stats     : Show response statistics
# - html      : Show HTML preview (2KB)
# - full      : Show full HTML response
# - json      : Show structured YouTube data
```

## Complete Example Workflow

```bash
# 1. Create a YouTube persona
node guil-cli.js create youtube "pig research" "My Research Persona"

# 2. List your personas to get the ID
node guil-cli.js list youtube

# 3. Make a test request using the persona
node guil-cli.js request youtube persona-1781711823510-d7ytm25gr "pig farming"

# 4. Check how many times the persona was used
node guil-cli.js stats youtube

# 5. Clean up - delete the persona when done
node guil-cli.js delete youtube persona-1781711823510-d7ytm25gr
```

## Via npm Scripts

You can also use npm scripts to run commands:

```bash
npm run persona -- help
npm run persona -- create youtube "test"
npm run persona -- list youtube
```
