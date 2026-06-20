// YourAlgoMate Proxy - Optional integration with YourAlgoMate AI service
// This module provides proxy functions to call YourAlgoMate (if running on port 30123)

const YOURALGOMATE_PORT = process.env.YOURALGOMATE_PORT || 30123;
const YOURALGOMATE_URL = `http://localhost:${YOURALGOMATE_PORT}`;

/**
 * Check if YourAlgoMate service is available
 */
async function isAvailable() {
  try {
    const response = await fetch(`${YOURALGOMATE_URL}/health`);
    return response.ok;
  } catch (e) {
    return false;
  }
}

/**
 * Get mood assessment for a user
 */
async function getMoodAssessment(userId, hours = 24) {
  try {
    const response = await fetch(`${YOURALGOMATE_URL}/mood-assessment/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours })
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error('[youralgomate-proxy] Mood assessment failed:', e.message);
    return null;
  }
}

/**
 * Invoke a specific skill
 */
async function invokeSkill(skillId, userId, parameters = {}) {
  try {
    const response = await fetch(`${YOURALGOMATE_URL}/skills/${skillId}/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, parameters })
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error('[youralgomate-proxy] Skill invocation failed:', e.message);
    return null;
  }
}

/**
 * Get activity summary for a user
 */
async function getActivitySummary(userId, hours = 24) {
  try {
    const response = await fetch(`${YOURALGOMATE_URL}/activity/${userId}/summary?hours=${hours}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error('[youralgomate-proxy] Activity summary failed:', e.message);
    return null;
  }
}

/**
 * Main request endpoint - process with AI
 */
async function processRequest(userMessage, userId, enableSkills = true) {
  try {
    const response = await fetch(`${YOURALGOMATE_URL}/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage, userId, enableSkills })
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error('[youralgomate-proxy] Request failed:', e.message);
    return null;
  }
}

export default {
  isAvailable,
  getMoodAssessment,
  invokeSkill,
  getActivitySummary,
  processRequest
};
