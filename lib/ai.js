// ai.js — Using Google Gemini 1.5 Flash
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// MAIN FUNCTION: Ask Gemini something
async function askAI(prompt, memory = []) {
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash"
        });

        // Build conversation history
        const history = memory.map(m => ({
            role: m.role,
            parts: [{ text: m.content }]
        }));

        const result = await model.generateContent({
            contents: [
                ...history,
                { role: "user", parts: [{ text: prompt }] }
            ]
        });

        return result.response.text();
    } catch (err) {
        console.error("Gemini API Error:", err);
        return "⚠️ AI error — could not generate a response.";
    }
}

module.exports = { askAI };
