#!/usr/bin/env node
// YourAlgoMate - Service connected to set.ai using GLM model (multi-user support)

import express from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.YOURALGOMATE_PORT || 30123;
const SETAI_API_KEY = process.env.SETAI_API_KEY;
const SETAI_API_URL = process.env.SETAI_API_URL || 'https://api.set.ai/v1';
const DEFAULT_USER = process.env.DEFAULT_USER || 'user1';

const app = express();

app.use(express.json());

// Load prompts from files
function loadPrompt(filename) {
    try {
        const filepath = join(__dirname, 'prompts', filename);
        return readFileSync(filepath, 'utf-8');
    } catch (error) {
        console.error(`Failed to load prompt file ${filename}:`, error.message);
        return '';
    }
}

// Load user-specific prompt
function loadUserPrompt(userId) {
    try {
        const filepath = join(__dirname, 'prompts', 'users', `${userId}.txt`);
        if (!existsSync(filepath)) {
            console.warn(`User prompt not found for ${userId}, using default`);
            return loadPrompt(`users/${DEFAULT_USER}.txt`);
        }
        return readFileSync(filepath, 'utf-8');
    } catch (error) {
        console.error(`Failed to load user prompt for ${userId}:`, error.message);
        return '';
    }
}

// Load system prompt
const systemPrompt = loadPrompt('system.txt');

/**
 * Call set.ai API with GLM model
 */
async function callSetAI(messages) {
    const response = await fetch(`${SETAI_API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SETAI_API_KEY}`
        },
        body: JSON.stringify({
            model: 'glm',
            messages: messages
        })
    });

    if (!response.ok) {
        throw new Error(`set.ai API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'youralgomate',
        timestamp: new Date().toISOString()
    });
});

// Get list of available users
app.get('/users', (req, res) => {
    const usersDir = join(__dirname, 'prompts', 'users');
    const { readdirSync } = require('fs');
    const files = readdirSync(usersDir);
    const users = files
        .filter(f => f.endsWith('.txt'))
        .map(f => f.replace('.txt', ''));

    res.json({
        users,
        default: DEFAULT_USER
    });
});

// Main endpoint - process request with GLM
app.post('/request', async (req, res) => {
    const { userMessage, userId } = req.body;

    if (!userMessage) {
        return res.status(400).json({ error: 'userMessage is required' });
    }

    // Use provided userId or default
    const effectiveUserId = userId || DEFAULT_USER;

    try {
        console.log(`[${new Date().toISOString()}] Processing request for user: ${effectiveUserId}`);

        // Load user-specific prompt
        const userPrompt = loadUserPrompt(effectiveUserId);

        // Build messages array with system prompt and user message
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `${userPrompt}\n\n${userMessage}` }
        ];

        // Call set.ai API
        const response = await callSetAI(messages);

        // Extract the assistant's reply
        const assistantMessage = response.choices?.[0]?.message?.content || 'No response from GLM';

        console.log(`[${new Date().toISOString()}] Success: ${assistantMessage.length} chars`);

        res.json({
            success: true,
            userId: effectiveUserId,
            response: assistantMessage,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`YourAlgoMate service listening on port ${PORT}`);
    console.log(`POST http://localhost:${PORT}/request`);
    console.log(`GET  http://localhost:${PORT}/health`);
    console.log(`GET  http://localhost:${PORT}/users`);
    console.log(`Default user: ${DEFAULT_USER}`);
    console.log(`System prompt loaded: ${systemPrompt.length} chars`);
});
