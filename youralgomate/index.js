#!/usr/bin/env node
// YourAlgoMate - Service connected to set.ai using GLM model (multi-user support with skills)

import express from 'express';
import { readFileSync, existsSync, readdirSync } from 'fs';
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

// Skills management
let skills = [];
let skillsRegistry = {};

/**
 * Load all skills from the skills directory
 */
function loadSkills() {
    try {
        const skillsDir = join(__dirname, 'skills');
        const indexFile = join(skillsDir, 'index.json');

        // Load skills registry
        if (existsSync(indexFile)) {
            skillsRegistry = JSON.parse(readFileSync(indexFile, 'utf-8'));
        }

        // Load individual skill files
        skills = [];
        const files = readdirSync(skillsDir).filter(f => f.endsWith('.json') && f !== 'index.json');

        for (const file of files) {
            try {
                const skillPath = join(skillsDir, file);
                const skillData = JSON.parse(readFileSync(skillPath, 'utf-8'));

                // Check if skill is enabled
                if (skillData.enabled !== false) {
                    skills.push(skillData);
                }
            } catch (error) {
                console.error(`Failed to load skill ${file}:`, error.message);
            }
        }

        console.log(`Loaded ${skills.length} skills`);
    } catch (error) {
        console.error('Failed to load skills:', error.message);
    }
}

/**
 * Get skill by ID
 */
function getSkill(skillId) {
    return skills.find(s => s.id === skillId);
}

/**
 * Load prompts from files
 */
function loadPrompt(filename) {
    try {
        const filepath = join(__dirname, 'prompts', filename);
        return readFileSync(filepath, 'utf-8');
    } catch (error) {
        console.error(`Failed to load prompt file ${filename}:`, error.message);
        return '';
    }
}

/**
 * Load user-specific prompt
 */
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

/**
 * Build enhanced prompt with skills
 */
function buildEnhancedPrompt(basePrompt, skillContexts = {}) {
    let enhancedPrompt = basePrompt;

    // Add time awareness context
    const timeSkill = getSkill('time-awareness');
    if (timeSkill && skillContexts.currentTime) {
        enhancedPrompt += `\n\n[${timeSkill.name}] Current time: ${skillContexts.currentTime}`;
    }

    return enhancedPrompt;
}

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'youralgomate',
        timestamp: new Date().toISOString(),
        skills_loaded: skills.length
    });
});

// Get list of available users
app.get('/users', (req, res) => {
    const usersDir = join(__dirname, 'prompts', 'users');
    const files = readdirSync(usersDir);
    const users = files
        .filter(f => f.endsWith('.txt'))
        .map(f => f.replace('.txt', ''));

    res.json({
        users,
        default: DEFAULT_USER
    });
});

// Get list of available skills
app.get('/skills', (req, res) => {
    res.json({
        skills: skills.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
            enabled: s.enabled !== false
        })),
        registry: skillsRegistry
    });
});

// Get details for a specific skill
app.get('/skills/:skillId', (req, res) => {
    const skill = getSkill(req.params.skillId);

    if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
    }

    res.json(skill);
});

// Invoke a specific skill
app.post('/skills/:skillId/invoke', async (req, res) => {
    const { userId, parameters } = req.body;
    const skill = getSkill(req.params.skillId);

    if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
    }

    if (skill.enabled === false) {
        return res.status(400).json({ error: 'Skill is disabled' });
    }

    const effectiveUserId = userId || DEFAULT_USER;

    try {
        console.log(`[${new Date().toISOString()}] Invoking skill: ${skill.id} for user: ${effectiveUserId}`);

        // Build skill-specific prompt
        const userPrompt = loadUserPrompt(effectiveUserId);
        let skillPrompt = skill.prompt;

        // Replace parameters in prompt
        if (parameters) {
            for (const [key, value] of Object.entries(parameters)) {
                skillPrompt = skillPrompt.replace(`{${key}}`, value);
            }
        }

        // Build messages
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `${userPrompt}\n\n[Skill: ${skill.name}]\n${skillPrompt}` }
        ];

        // Call set.ai API
        const response = await callSetAI(messages);
        const assistantMessage = response.choices?.[0]?.message?.content || 'No response from GLM';

        console.log(`[${new Date().toISOString()}] Skill ${skill.id} success: ${assistantMessage.length} chars`);

        res.json({
            success: true,
            skill: {
                id: skill.id,
                name: skill.name
            },
            userId: effectiveUserId,
            response: assistantMessage,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Skill ${skill.id} error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Main endpoint - process request with GLM
app.post('/request', async (req, res) => {
    const { userMessage, userId, enableSkills = true } = req.body;

    if (!userMessage) {
        return res.status(400).json({ error: 'userMessage is required' });
    }

    // Use provided userId or default
    const effectiveUserId = userId || DEFAULT_USER;

    try {
        console.log(`[${new Date().toISOString()}] Processing request for user: ${effectiveUserId}`);

        // Load user-specific prompt
        const userPrompt = loadUserPrompt(effectiveUserId);

        // Build enhanced prompt with skills
        let enhancedMessage = userMessage;
        if (enableSkills) {
            const skillContexts = {
                currentTime: new Date().toISOString()
            };
            enhancedMessage = buildEnhancedPrompt(userMessage, skillContexts);
        }

        // Build messages array with system prompt and user message
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: enhancedMessage }
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
    // Load skills on startup
    loadSkills();

    console.log(`YourAlgoMate service listening on port ${PORT}`);
    console.log(`POST http://localhost:${PORT}/request`);
    console.log(`GET  http://localhost:${PORT}/health`);
    console.log(`GET  http://localhost:${PORT}/users`);
    console.log(`GET  http://localhost:${PORT}/skills`);
    console.log(`POST http://localhost:${PORT}/skills/:skillId/invoke`);
    console.log(`Default user: ${DEFAULT_USER}`);
    console.log(`System prompt loaded: ${systemPrompt.length} chars`);
});
