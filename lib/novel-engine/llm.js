// lib/novel-engine/llm.js - Model-agnostic wrapper
import OpenAI from "openai";

const PROVIDER = process.env.LLM_PROVIDER || 'grok'; // 'grok' or 'claude'

let grokClient = null;
let anthropicClient = null; // we'll initialize only when needed

export async function callLLM(params) {
  const { systemPrompt, userPrompt, temperature = 0.8, max_tokens = 4000, tools = null } = params;

  if (PROVIDER === 'grok') {
    if (!grokClient) {
      grokClient = new OpenAI({
        apiKey: process.env.XAI_API_KEY,
        baseURL: "https://api.x.ai/v1",
      });
    }

    const payload = {
      model: "grok-4.3",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature,
      max_tokens,
    };

    if (tools) {
      payload.tools = tools;
      payload.tool_choice = { type: 'function', function: { name: tools[0].function.name } };
    }

    const response = await grokClient.chat.completions.create(payload);
    return {
      content: response.choices[0].message.content,
      tool_calls: response.choices[0].message.tool_calls,
    };
  } 
  else if (PROVIDER === 'claude') {
    // We'll add Claude support here next
    console.warn("Claude fallback not fully implemented yet");
    // You can paste your original Anthropic code here later
    throw new Error("Claude provider not implemented in abstraction yet");
  }

  throw new Error(`Unknown provider: ${PROVIDER}`);
}
