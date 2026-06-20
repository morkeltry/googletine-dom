// Minimal GLM (Z.ai) client — OpenAI-compatible chat completions with tool calling.
// The API key is read from the environment (ZAI_API_KEY / GLM_API_KEY) and is NEVER
// committed to the repo — set it as a Coolify env var.

// GLM Coding Plan uses the /api/coding/paas/v4 base (OpenAI-compatible).
// The general /api/paas/v4 base draws from a separate pay-as-you-go balance.
const BASE = process.env.GLM_BASE_URL || 'https://api.z.ai/api/coding/paas/v4';
const MODEL = process.env.GLM_MODEL || 'glm-5.2';
const KEY = process.env.ZAI_API_KEY || process.env.GLM_API_KEY || '';

export function hasKey() { return !!KEY; }
export function model() { return MODEL; }

// GLM-5.2 is a reasoning model — it spends tokens on reasoning_content before the
// answer/tool-calls, so give it generous headroom.
export async function chat(messages, tools, { temperature = 0.4, maxTokens = 2000 } = {}) {
  if (!KEY) throw new Error('no GLM key — set ZAI_API_KEY in the environment');
  const body = { model: MODEL, messages, temperature, max_tokens: maxTokens };
  if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`GLM ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}
