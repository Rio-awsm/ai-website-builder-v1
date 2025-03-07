require("dotenv").config();
import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";
import express from "express";
import { basePrompt as nodeBasePrompt } from "./defaults/node";
import { basePrompt as reactBasePrompt } from "./defaults/react";
import { BASE_PROMPT, getSystemPrompt } from "./prompts";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not defined in the environment variables.");
}
const genAI = new GoogleGenerativeAI(apiKey);

const app = express();
app.use(cors());
app.use(express.json());

interface TemplateRequest {
  prompt: string;
}

app.post("/template", async (req, res) => {
    const prompt = req.body.prompt;
    
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      
      const fullPrompt = "Return either node or react based on what do you think this project should be. Only return a single word either 'node' or 'react'. Do not return anything extra.\n\nProject description: " + prompt;
      
      const result = await model.generateContent(fullPrompt);
      const response = result.response;
      const answer = response.text().trim().toLowerCase();
      
      if (answer === "react") {
        res.json({
          prompts: [BASE_PROMPT, `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactBasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`],
          uiPrompts: [reactBasePrompt]
        });
        return;
      }
      
      if (answer === "node") {
        res.json({
          prompts: [`Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactBasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`],
          uiPrompts: [nodeBasePrompt]
        });
        return;
      }
      
      res.status(403).json({ message: "You cant access this" });
    } catch (error) {
      console.error("Error in template route:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
}

app.post("/chat", async (req, res) => {
    const messages = req.body.messages;
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192
      }
    });
    
    try {
      const systemPromptText = getSystemPrompt();
      
      const geminiMessages = messages.map((msg: ChatMessage) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
      }));
      
      const chatSession = model.startChat();
      
      if (systemPromptText) {
        await chatSession.sendMessage("SYSTEM: " + systemPromptText);
      }
      
      for (let i = 0; i < geminiMessages.length - 1; i++) {
        await chatSession.sendMessage(geminiMessages[i].parts[0].text);
      }
      
      const lastMessage = geminiMessages[geminiMessages.length - 1];
      const response = await chatSession.sendMessage(lastMessage.parts[0].text);
      const responseText = response.response.text();
      
      res.json({
        response: responseText
      });
    } catch (error) {
      console.error("Error in chat route:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

app.listen(3000, () => {
  console.log("Server running on port 3000");
});