// lib/ai.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error("Missing GEMINI_API_KEY in env.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(KEY);

/**
 * askAI(prompt, memory)
 * - prompt: string user input
 * - memory: [{ role: 'system'|'user'|'assistant', content: '...' }, ...] optional
 * Returns: string answer
 */
async function askAI(prompt, memory = []) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // build content: include any memory entries then user
    const contents = [];
    for (const m of memory) {
      contents.push({ role: m.role, parts: [{ text: m.content }] });
    }
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const result = await model.generateContent({
      contents,
      // you can tune temperature, safety, etc. here via "temperature" or other params if supported
      // e.g. temperature: 0.3
    });

    // result.response.text() may be function or property depending on SDK; handle common case:
    if (!result) return "⚠️ AI returned no response.";
    if (typeof result.response === 'string') return result.response;
    if (result.response && typeof result.response.text === 'function') {
      return result.response.text();
    }
    if (result.output && result.output[0] && result.output[0].content) {
      // fallback
      return String(result.output[0].content[0].text || '').trim();
    }
    return (result.response?.text && typeof result.response.text === 'string') ? result.response.text : JSON.stringify(result).slice(0, 2000);
  } catch (err) {
    console.error('Gemini askAI error:', err);
    return "⚠️ AI error — could not generate response.";
  }
}

module.exports = { askAI };
