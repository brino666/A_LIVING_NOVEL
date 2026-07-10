// lib/novel-engine/llm.js - Clean Grok abstraction
import OpenAI from "openai";

let client = null;

function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: "https://api.x.ai/v1",
    });
  }
  return client;
}

export async function callLLM({
  systemPrompt,
  userPrompt,
  temperature = 0.85,
  max_tokens = 4000,
  tools = null
}) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  const payload = {
    model: "grok-4.3",
    messages,
    temperature,
    max_tokens,
  };

  if (tools) {
    payload.tools = tools;
    payload.tool_choice = { type: "function", function: { name: tools[0].function.name } };
  }

  const response = await getClient().chat.completions.create(payload);

  return {
    content: response.choices[0]?.message?.content || "",
    tool_calls: response.choices[0]?.message?.tool_calls,
  };
}
