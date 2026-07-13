import { getGeminiClient } from './_gemini.js';
import { Type } from '@google/genai';

export default async function handler(req, res) {
  // Allow only POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { examDate, topicsText, fileData, mimeType, language } = req.body;

    if (!examDate) {
      return res.status(400).json({ error: "Missing required examDate" });
    }

    const ai = getGeminiClient();

    const planSystemPrompt = `You are StudyBridge AI, an expert exam strategist and study planner. 
Your goal is to generate a custom, highly realistic day-by-day study schedule leading up to the given exam date.
Analyze the provided topics list, syllabus text, or uploaded document/image to identify priorities.

Always respect the chosen language:
- "English": Plan strictly in English.
- "Hindi": Plan strictly in Hindi (Devanagari script).
- "Hinglish": Plan in natural Hinglish (mixed English/Hindi).

Output your response strictly as a JSON object matching this schema:
{
  "title": "A highly motivating title for the plan",
  "totalDays": 10, // calculated integer representing total days allocated from now to the exam
  "plan": [
    {
      "day": "Day 1 (or specific Date if relevant)",
      "topic": "Syllabus topic to focus on",
      "tasks": [
        "Task 1 (e.g. Read Nucleus concept)",
        "Task 2 (e.g. Practice MCQ set)"
      ],
      "estimatedTime": "Estimated study hours, e.g. 2 hours",
      "priority": "High (or Medium or Low)"
    }
  ]
}`;

    const planSchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        totalDays: { type: Type.INTEGER },
        plan: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              day: { type: Type.STRING },
              topic: { type: Type.STRING },
              tasks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              estimatedTime: { type: Type.STRING },
              priority: { type: Type.STRING },
            },
            required: ["day", "topic", "tasks", "estimatedTime", "priority"],
          },
        },
      },
      required: ["title", "totalDays", "plan"],
    };

    const contents = [];
    if (fileData && mimeType) {
      if (mimeType === 'text/plain') {
        const decodedText = Buffer.from(fileData, 'base64').toString('utf-8');
        contents.push({
          text: `Here is the study material text context for reference:\n\n${decodedText}`
        });
      } else {
        contents.push({
          inlineData: {
            data: fileData,
            mimeType: mimeType,
          }
        });
      }
    }

    contents.push({
      text: `Generate a study plan. Exam Date: ${examDate}. Topics or syllabus description: ${topicsText || "General curriculum of the uploaded file."}. Language: ${language}. Please output the result strictly matching the JSON schema.`
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        systemInstruction: planSystemPrompt,
        responseMimeType: "application/json",
        responseSchema: planSchema,
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response received from Gemini for study plan");
    }

    return res.status(200).json(JSON.parse(resultText.trim()));

  } catch (error) {
    console.error("Error in /api/study/plan:", error);
    return res.status(500).json({ error: error.message || "Failed to generate study plan" });
  }
}
