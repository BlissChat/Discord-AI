// ai.js — Google Gemini wrapper (gemini-1.5-flash)
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error('Missing GEMINI_API_KEY in environment.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(KEY);

/**
 * askAI(prompt, memory)
 * - prompt: string
 * - memory: array of { role: 'system'|'user'|'assistant', content: '...' }
 * Returns answer string.
 */
async function askAI(prompt, memory = []) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Build contents for Gemini SDK
    const contents = [];
    for (const m of memory) {
      contents.push({ role: m.role, parts: [{ text: m.content }] });
    }
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const result = await model.generateContent({
      contents,
      // you can add other options here (temperature etc.) if needed
    });

    // result.response.text might be a string or function — handle common cases:
    if (!result) return '⚠️ AI returned no response.';
    if (typeof result.response === 'string') return result.response;
    if (result.response && typeof result.response.text === 'function') return result.response.text();
    if (result.output && Array.isArray(result.output) && result.output[0]?.content) {
      // fallback parsing
      const block = result.output[0].content.find(c => c.type === 'output_text' || c.mimetype?.startsWith('text/'));
      if (block && block.text) return block.text;
    }
    // safest fallback
    return String(result.response?.text ?? JSON.stringify(result)).slice(0, 2000);
  } catch (err) {
    console.error('Gemini askAI error:', err);
    return '⚠️ AI error — could not generate response.';
  }
}

module.exports = { askAI };
