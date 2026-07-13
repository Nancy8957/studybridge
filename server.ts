import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

// Lazy initialization of Gemini Client to prevent crash on startup if key is missing
let aiInstance: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set. Please set it in Settings > Secrets.");
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

async function startServer() {
  const app = express();
  const port = 3000;

  // Set limits to handle large base64 uploads (PDFs / high-res scans)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API: Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // API: Document Processing (Notes + Quiz combined)
  app.post('/api/study/process', async (req, res) => {
    try {
      const { fileData, mimeType, language } = req.body;

      if (!fileData || !mimeType) {
        return res.status(400).json({ error: "Missing required file data or mimeType" });
      }

      // Truncate text/plain to first 10,000 chars for extreme speed
      let contentData = fileData;
      if (mimeType === 'text/plain') {
        let text = Buffer.from(fileData, 'base64').toString('utf-8');
        if (text.length > 10000) {
          text = text.substring(0, 10000) + "\n[Content truncated for performance...]";
          contentData = Buffer.from(text, 'utf-8').toString('base64');
        }
      }

      const ai = getGeminiClient();

      const systemPrompt = `You are StudyBridge, a fast AI study tutor for Indian students.
Analyze the study material and return highly concise, structured study notes and a brief quiz.
Always respect the language toggle:
- "English": Output strictly in English.
- "Hindi": Output strictly in Devanagari Hindi.
- "Hinglish": Output in natural, conversational Hinglish (mixed Hindi-English written in the Latin alphabet).
Keep explanations, bullet points, and questions extremely short and punchy for fast reading.`;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          notes: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              summary: { type: Type.STRING, description: "Under 100 words" },
              keyConcepts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    concept: { type: Type.STRING },
                    definition: { type: Type.STRING },
                  },
                  required: ["concept", "definition"],
                },
              },
              bulletPoints: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              highlights: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ["title", "summary", "keyConcepts", "bulletPoints", "highlights"],
          },
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
                  description: "Exactly 4 options for 'mcq'. Leave empty or null for 'short_answer'."
                },
                correctAnswer: { type: Type.STRING },
                explanation: { type: Type.STRING }
              },
              required: ["id", "type", "question", "correctAnswer", "explanation"],
            },
          },
        },
        required: ["notes", "quiz"],
      };

      let contentParts: any[] = [];
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
        text: `Please generate the notes and a short quiz of exactly 4 MCQs and 1 short answer question in ${language} mode.`
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
        throw new Error("No response received from Gemini");
      }

      const parsedData = JSON.parse(resultText.trim());
      res.json(parsedData);

    } catch (error: any) {
      console.error("Error in /api/study/process:", error);
      res.status(500).json({ error: error.message || "Failed to process document" });
    }
  });

  // NEW: Fast streaming notes endpoint
  app.post('/api/study/generate-notes', async (req, res) => {
    try {
      const { fileData, mimeType, language } = req.body;

      if (!fileData || !mimeType) {
        return res.status(400).json({ error: "Missing required file data or mimeType" });
      }

      // Truncate to first 10,000 characters
      let contentData = fileData;
      if (mimeType === 'text/plain') {
        let text = Buffer.from(fileData, 'base64').toString('utf-8');
        if (text.length > 10000) {
          text = text.substring(0, 10000) + "\n[Content truncated for performance...]";
          contentData = Buffer.from(text, 'utf-8').toString('base64');
        }
      }

      const ai = getGeminiClient();

      const systemPrompt = `You are StudyBridge, an elite, super-fast AI tutor. Write high-quality, concise study notes in ${language} mode.
Format the output EXACTLY using the markdown layout below (DO NOT include any vocabulary, glossary, or Key Concepts section):

# Title: [Topic Title]

## Overview
[Provide exactly 2-3 sentences giving a high-level idea of what the material covers]

## Summary
- [Key idea 1, concise and easy to scan]
- [Key idea 2, concise and easy to scan]
- [Key idea 3, concise and easy to scan]
- [Key idea 4, concise and easy to scan]

## Core Lessons
- [Short point 1]
- [Short point 2]
- [Short point 3]
- [Short point 4]

## Exam Tips
- [Exam advice or high-frequency topic highlight 1]
- [Exam advice or high-frequency topic highlight 2]

Be extremely direct, avoiding any introductory fluff or conversational greetings. Keep the response very short for speed.`;

      let contentParts: any[] = [];
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
        text: `Generate the structured study notes in markdown now in ${language} mode.`
      });

      // Set headers for streaming plain text chunks
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      const responseStream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: contentParts,
        config: {
          systemInstruction: systemPrompt,
        }
      });

      for await (const chunk of responseStream) {
        if (chunk.text) {
          res.write(chunk.text);
        }
      }
      res.end();

    } catch (error: any) {
      console.error("Error in /api/study/generate-notes:", error);
      res.status(500).write(`Error: ${error.message || "Failed to stream notes"}`);
      res.end();
    }
  });

  // NEW: Fast parallel quiz endpoint
  app.post('/api/study/generate-quiz', async (req, res) => {
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

      let contentParts: any[] = [];
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
      res.json(parsedData);

    } catch (error: any) {
      console.error("Error in /api/study/generate-quiz:", error);
      res.status(500).json({ error: error.message || "Failed to generate quiz" });
    }
  });

  // API: Doubt Solving Chat (STREAMING)
  app.post('/api/study/chat', async (req, res) => {
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
      let docPart: any = null;
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
      const currentParts: any[] = [];
      if (docPart) {
        currentParts.push(docPart);
      }
      currentParts.push({ text: message });

      contents.push({
        role: 'user',
        parts: currentParts,
      });

      // Set headers for streaming plain text chunks
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      const responseStream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: contents,
        config: {
          systemInstruction: chatSystemInstruction,
        }
      });

      for await (const chunk of responseStream) {
        if (chunk.text) {
          res.write(chunk.text);
        }
      }
      res.end();

    } catch (error: any) {
      console.error("Error in /api/study/chat:", error);
      res.status(500).write(`Error: ${error.message || "Failed to stream chat response"}`);
      res.end();
    }
  });

  // API: Study Plan Generator
  app.post('/api/study/plan', async (req, res) => {
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

      const contents: any[] = [];
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

      res.json(JSON.parse(resultText.trim()));

    } catch (error: any) {
      console.error("Error in /api/study/plan:", error);
      res.status(500).json({ error: error.message || "Failed to generate study plan" });
    }
  });

  // Integration with Vite
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`StudyBridge full-stack server running on http://0.0.0.0:${port}`);
  });
}

startServer();
