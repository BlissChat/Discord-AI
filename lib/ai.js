// ai.js — Gemini correct model
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Correct stable model name
const MODEL = "gemini-1.5-flash";

async function askAI(prompt, memory = []) {
  try {
    const model = genAI.getGenerativeModel({ model: MODEL });

    const response = await model.generateContent({
      contents: [
        ...memory.map(m => ({
          role: m.role,
          parts: [{ text: m.content }]
        })),
        { role: "user", parts: [{ text: prompt }] }
      ]
    });

    const text = response.response.text();
    return text;

  } catch (err) {
    console.error("Gemini askAI error:", err);
    return "⚠️ AI error — please check your model name or API key.";
  }
}

module.exports = { askAI };
