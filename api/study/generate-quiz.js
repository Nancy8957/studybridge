import { getGeminiClient } from './_gemini.js';
import { Type } from '@google/genai';

export default async function handler(req, res) {
  // Allow only POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { fileData, mimeType, language } = req.body;
    const numMCQs = parseInt(req.body.numMCQs) || 5;

    if (!fileData || !mimeType) {
      return res.status(400).json({ error: "Missing required file data or mimeType" });
    }

    let contentData = fileData;
    if (mimeType === 'text/plain') {
      let text = Buffer.from(fileData, 'base64').toString('utf-8');
      if (text.length > 10000) {
        text = text.substring(0, 10000) + "\n[Content truncated for performance...]";
        contentData = Buffer.from(text, 'utf-8').toString('base64');
      }
    }

    const ai = getGeminiClient();

    const systemPrompt = `You are the StudyBridge Quiz Maker. Extract concepts and generate a quick quiz in ${language} mode.
Output exactly ${numMCQs} Multiple Choice Questions (with options A, B, C, D) and exactly 1 conceptual Short Answer Question.
Each question's "explanation" must be a concise 2-3 sentences maximum. It must clearly explain the correct answer and why incorrect options/common mistakes are wrong, directly grounded on the text.
Keep questions and options brief for quick response time.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        quiz: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, description: "Must be either 'mcq' or 'short_answer'" },
              question: { type: Type.STRING },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Required for 'mcq' (exactly 4 options). Leave empty or null for 'short_answer'."
              },
              correctAnswer: { type: Type.STRING, description: "The correct option text for MCQ or exact keywords for short answer." },
              explanation: { type: Type.STRING }
            },
            required: ["id", "type", "question", "correctAnswer", "explanation"],
          },
        },
      },
      required: ["quiz"],
    };

    let contentParts = [];
    if (mimeType === 'text/plain') {
      const decodedText = Buffer.from(contentData, 'base64').toString('utf-8');
      contentParts.push({
        text: `Here is the study material text:\n\n${decodedText}`
      });
    } else {
      contentParts.push({
        inlineData: {
          data: contentData,
          mimeType: mimeType,
        }
      });
    }

    contentParts.push({
      text: `Create the assessments now in ${language} mode.`
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contentParts,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response received from Gemini for quiz");
    }

    const parsedData = JSON.parse(resultText.trim());
    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("Error in /api/study/generate-quiz:", error);
    return res.status(500).json({ error: error.message || "Failed to generate quiz" });
  }
}
