import { getGeminiClient } from './_gemini.js';

export default async function handler(req, res) {
  // Allow only POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { fileData, mimeType, language } = req.body;

    if (!fileData || !mimeType) {
      return res.status(400).json({ error: "Missing required file data or mimeType" });
    }

    // Truncate text/plain to first 10,000 chars for speed
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

  } catch (error) {
    console.error("Error in /api/study/generate-notes:", error);
    if (!res.headersSent) {
      res.status(500);
    }
    res.write(`Error: ${error.message || "Failed to stream notes"}`);
    res.end();
  }
}
