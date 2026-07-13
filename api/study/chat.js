import { getGeminiClient } from './_gemini.js';

export default async function handler(req, res) {
  // Allow only POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { message, chatHistory, fileData, mimeType, language } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Missing required query message" });
    }

    const ai = getGeminiClient();

    const chatSystemInstruction = `You are StudyBridge AI, a helpful, extremely friendly, and highly capable study companion for Indian students. 
Your goal is to explain concepts clearly, resolve doubts, and keep the student motivated.

Always respect the chosen language mode:
- "English": Respond strictly in clear, professional, yet friendly English.
- "Hindi": Respond strictly in warm, fluent Hindi (using Devanagari script).
- "Hinglish": Respond in natural conversational Hinglish (mixed English and Hindi written in the Latin alphabet). Keep the style easy, warm, and highly engaging.

If the student has uploaded a document (fileData is provided), analyze it to solve doubts strictly grounded in the document context.
Keep answers concise, structured (using bullet points and bold formatting where appropriate), and encouraging.`;

    const contents = [];

    // If document is present, prepend/attach it to the system input or conversation
    let docPart = null;
    if (fileData && mimeType) {
      if (mimeType === 'text/plain') {
        const decodedText = Buffer.from(fileData, 'base64').toString('utf-8');
        docPart = {
          text: `Here is the study material text context for reference:\n\n${decodedText}`
        };
      } else {
        docPart = {
          inlineData: {
            data: fileData,
            mimeType: mimeType,
          }
        };
      }
    }

    // Format previous history
    if (chatHistory && Array.isArray(chatHistory)) {
      for (const turn of chatHistory) {
        contents.push({
          role: turn.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: turn.content }],
        });
      }
    }

    // Add current message with optional docPart
    const currentParts = [];
    if (docPart) {
      currentParts.push(docPart);
    }
    currentParts.push({ text: message });

    contents.push({
      role: 'user',
      parts: currentParts,
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        systemInstruction: chatSystemInstruction,
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response received from Gemini");
    }

    return res.status(200).json({ text });

  } catch (error) {
    console.error("Error in /api/study/chat:", error);
    return res.status(500).json({ error: error.message || "Failed to generate chat response" });
  }
}
