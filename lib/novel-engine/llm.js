// lib/novel-engine/llm.js
// Centralized LLM client - easy to swap providers

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

export async function callLLM({ systemPrompt, userPrompt, model = "grok-4.3", temperature = 0.8, max_tokens = 4000, tools = null, tool_choice = null }) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  const payload = {
    model,
    messages,
    temperature,
    max_tokens,
  };

  if (tools) {
    payload.tools = tools;
    if (tool_choice) payload.tool_choice = tool_choice;
  }

  const response = await getClient().chat.completions.create(payload);

  return {
    content: response.choices[0].message.content,
    tool_calls: response.choices[0].message.tool_calls,
    raw: response
  };
}

export default { callLLM };
