const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Supported model names as of 2024–2025:
const MODEL = "gemini-1.5-flash-latest";

async function askAI(prompt, memory = []) {
  try {
    const model = genAI.getGenerativeModel({ model: MODEL });

    // New API format:
    const response = await model.generateContent({
      contents: [
        ...memory.map(m => ({
          role: m.role,
          parts: [{ text: m.content }]
        })),
        { role: "user", parts: [{ text: prompt }] }
      ]
    });

    // extract text
    const text = response.response.text();
    return text;
  } catch (err) {
    console.error("Gemini askAI error:", err);
    return "⚠️ AI error — please check your model name or API key.";
  }
}

module.exports = { askAI };
