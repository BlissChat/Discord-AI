// lib/ai.js
const OpenAI = require('openai');
require('dotenv').config();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function createCompletion(messages, opts = {}) {
  try {
    const res = await client.chat.completions.create({
      model: opts.model || 'gpt-4o-mini',
      messages,
      max_tokens: opts.max_tokens || 700
    });
    return res.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('OpenAI error', err);
    throw err;
  }
}

async function createImage(prompt, opts = {}) {
  // Simple wrapper for image generation. Replace model/name depending on your OpenAI access.
  try {
    const img = await client.images.generate({
      model: opts.model || 'gpt-image-1',
      prompt,
      size: opts.size || '1024x1024'
    });
    // some SDKs return data[0].url, some base64 — handle common case:
    const url = img.data?.[0]?.url || (img.data?.[0]?.b64_json ? `data:image/png;base64,${img.data[0].b64_json}` : null);
    return url;
  } catch (err) {
    console.error('Image generation error', err);
    throw err;
  }
}

module.exports = { createCompletion, createImage };
