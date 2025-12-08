const fetch = require("node-fetch");

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-1.5-flash";

async function askAI(prompt) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ]
        })
      }
    );

    const data = await res.json();

    if (!data.candidates || !data.candidates[0]) {
      console.error("Gemini bad response:", data);
      return "⚠️ Gemini returned no output.";
    }

    return data.candidates[0].content.parts[0].text;
  } catch (err) {
    console.error("Gemini askAI error:", err);
    return "⚠️ AI error — fetch failed.";
  }
}

module.exports = { askAI };
