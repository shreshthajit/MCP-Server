import { config } from "dotenv";
import readline from "readline/promises";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

config();

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = ai.getGenerativeModel({ model: "models/gemini-pro" });

const mcpClient = new Client({
  name: "example-client",
  version: "1.0.0",
});

const chatHistory = [];
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let tools = [];

mcpClient
  .connect(new SSEClientTransport(new URL("http://localhost:3001/sse")))
  .then(async () => {
    console.log("Connected to mcp server");

    tools = (await mcpClient.listTools()).tools.map((tool) => {
      return {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object",
          properties: tool.inputSchema.properties,
          required: tool.inputSchema.required,
        },
      };
    });

    chatLoop();
  });

async function chatLoop(toolCall) {
  if (toolCall) {
    console.log("calling tool ", toolCall.name);

    chatHistory.push({
      role: "model",
      parts: [{ text: `calling tool ${toolCall.name}` }],
    });

    const toolResult = await mcpClient.callTool({
      name: toolCall.name,
      arguments: toolCall.args,
    });

    chatHistory.push({
      role: "user",
      parts: [{ text: "Tool result : " + toolResult.content[0].text }],
    });
  } else {
    const question = await rl.question("You: ");
    chatHistory.push({
      role: "user",
      parts: [{ text: question }],
    });
  }

  const result = await model.generateContent({
    contents: chatHistory,
    tools: [{ functionDeclarations: tools }],
  });

  const candidate = result.response.candidates[0];
  const content = candidate.content.parts[0];

  if (content.functionCall) {
    return chatLoop(content.functionCall);
  }

  const responseText = content.text;

  chatHistory.push({
    role: "model",
    parts: [{ text: responseText }],
  });

  console.log(`AI: ${responseText}`);

  chatLoop();
}
