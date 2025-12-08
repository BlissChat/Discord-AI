const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL = "models/gemini-1.5-flash";

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

    return response.response.text();

  } catch (err) {
    console.error("Gemini askAI error:", err);
    return "⚠️ AI error — API not enabled or wrong model.";
  }
}

module.exports = { askAI };
