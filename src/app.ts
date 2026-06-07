import express from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import evalkit from "syntropylabs-evalkit";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TRACE_URL = process.env.TRACE_SERVICE_URL ?? "https://api.syntropylabs.ai";
const SUB_KEY   = process.env.EVALKIT_SUBSCRIPTION_KEY ?? "";
const OPENAI_API_KEY    = process.env.OPENAI_API_KEY ?? "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

// Single init — auto-instruments http, fetch, console, OpenAI, Anthropic, Axios, Mongoose
evalkit.init({
  subscriptionKey: SUB_KEY,
  baseUrl: TRACE_URL,
  serviceName: "evalkit-showcase",
  environment: (process.env.NODE_ENV as any) ?? "development",
  debug: process.env.NODE_ENV !== "production",
  scheduledDelayMillis: 1000,
});

const openai    = new OpenAI({ apiKey: OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const TOOL_DEFS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather and forecast for a city",
      parameters: {
        type: "object",
        properties: {
          city:  { type: "string", description: "City name, e.g. Delhi, New York" },
          units: { type: "string", enum: ["celsius", "fahrenheit"] },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Evaluate a mathematical expression",
      parameters: {
        type: "object",
        properties: { expression: { type: "string" } },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the web for recent information on a topic",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stock_price",
      description: "Get the current stock price and daily change for a ticker symbol",
      parameters: {
        type: "object",
        properties: { ticker: { type: "string" } },
        required: ["ticker"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_news",
      description: "Fetch recent news headlines for a topic",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string" },
          count: { type: "number" },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "translate_text",
      description: "Translate text to a target language",
      parameters: {
        type: "object",
        properties: {
          text:            { type: "string" },
          target_language: { type: "string" },
        },
        required: ["text", "target_language"],
      },
    },
  },
];

type ToolResult = Record<string, unknown>;

async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  switch (name) {
    case "get_weather": {
      const city  = String(args.city ?? "Unknown");
      const units = String(args.units ?? "celsius");
      const temps = { celsius: { low: 12, high: 28 }, fahrenheit: { low: 53, high: 82 } };
      const t     = units === "fahrenheit" ? temps.fahrenheit : temps.celsius;
      const conditions = ["sunny", "partly cloudy", "cloudy", "light rain", "clear skies"];
      return {
        city,
        temperature: Math.floor(Math.random() * (t.high - t.low) + t.low),
        units,
        condition: conditions[Math.floor(Math.random() * conditions.length)],
        humidity: Math.floor(Math.random() * 40 + 40),
        wind_kph: Math.floor(Math.random() * 20 + 5),
      };
    }
    case "calculate": {
      const expr = String(args.expression ?? "");
      try {
        const sanitized = expr.replace(/[^0-9+\-*/().% \t]/g, "");
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${sanitized})`)();
        return { expression: expr, result, formatted: `${expr} = ${result}` };
      } catch {
        return { expression: expr, error: "Could not evaluate expression" };
      }
    }
    case "search_web": {
      const query = String(args.query ?? "");
      return {
        query,
        results: [
          { title: `Recent developments in ${query}`, snippet: `Latest research shows progress in ${query}.` },
          { title: `${query}: A comprehensive overview`, snippet: `Experts weigh in on ${query}.` },
        ],
      };
    }
    case "get_stock_price": {
      const ticker = String(args.ticker ?? "").toUpperCase();
      const prices: Record<string, number> = { AAPL: 189, TSLA: 245, GOOGL: 175, MSFT: 420, NVDA: 875 };
      const base   = prices[ticker] ?? Math.floor(Math.random() * 400 + 50);
      const change = parseFloat((Math.random() * 10 - 5).toFixed(2));
      return { ticker, price: (base + change).toFixed(2), change: change.toFixed(2) };
    }
    case "get_news": {
      const topic = String(args.topic ?? "");
      const count = Math.min(Number(args.count ?? 3), 5);
      const headlines = [
        `Breaking: Major developments in ${topic} announced today`,
        `${topic} industry sees record growth`,
        `Experts debate the future of ${topic}`,
        `New study reveals insights about ${topic}`,
        `${topic}: What you need to know this week`,
      ].slice(0, count);
      return { topic, headlines };
    }
    case "translate_text": {
      const text = String(args.text ?? "");
      const lang = String(args.target_language ?? "Spanish");
      return { original: text, translation: `[${lang} translation of: "${text}"]`, target_language: lang };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

interface AgentStep {
  type: "llm" | "tool_call" | "tool_result";
  name?: string;
  args?: Record<string, unknown>;
  result?: ToolResult;
  content?: string;
  tokens?: { in: number; out: number };
}

async function runOpenAIAgent(
  prompt: string,
  systemPrompt: string,
  model: string,
  tools: OpenAI.Chat.ChatCompletionTool[] = TOOL_DEFS,
) {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user",   content: prompt },
  ];
  const steps: AgentStep[]       = [];
  const totalTokens              = { in: 0, out: 0 };
  let answer = "";
  let usedModel = model;

  for (let round = 0; round < 6; round++) {
    // No withTrace needed — expressMiddleware already set the active context
    const response = await openai.chat.completions.create({
      model,
      messages,
      tools:       tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
    });
    usedModel          = response.model;
    const tokensIn     = response.usage?.prompt_tokens ?? 0;
    const tokensOut    = response.usage?.completion_tokens ?? 0;
    totalTokens.in    += tokensIn;
    totalTokens.out   += tokensOut;

    const msg = response.choices[0]?.message;
    if (!msg) break;
    messages.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      answer = msg.content ?? "";
      steps.push({ type: "llm", content: answer, tokens: { in: tokensIn, out: tokensOut } });
      break;
    }

    steps.push({ type: "llm", content: "(deciding tool calls…)", tokens: { in: tokensIn, out: tokensOut } });

    for (const tc of msg.tool_calls) {
      const fname = tc.function.name;
      const fargs = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
      steps.push({ type: "tool_call", name: fname, args: fargs });

      // Tool spans are emitted automatically by the SDK's LLM instrumentation.
      const result = await executeTool(fname, fargs);

      steps.push({ type: "tool_result", name: fname, result });
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  return { answer, steps, model: usedModel, totalTokens };
}

export const app = express();
app.use(express.json());

// Auto-traces every incoming HTTP request
app.use(evalkit.expressMiddleware());

app.get("/", (_req, res) => {
  try {
    res.setHeader("Content-Type", "text/html");
    res.send(readFileSync(join(__dirname, "index.html"), "utf8"));
  } catch {
    res.send("<h1>EvalKit Demo API</h1><p>See /health for status.</p>");
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", traceService: TRACE_URL, sdk: "evalkit-showcase" });
});

app.post("/demo/chat", async (req, res) => {
  const { prompt, model = "gpt-4o-mini", provider = "openai" } = req.body as {
    prompt?: string; model?: string; provider?: string;
  };
  if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }

  try {
    if (provider === "anthropic") {
      const msg = await anthropic.messages.create({
        model: model || "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const answer = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
      await evalkit.flush();
      res.json({ answer, model: msg.model, tokens: { in: msg.usage.input_tokens, out: msg.usage.output_tokens } });
    } else {
      const completion = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
      });
      const answer = completion.choices[0]?.message.content ?? "";
      await evalkit.flush();
      res.json({ answer, model: completion.model, tokens: { in: completion.usage?.prompt_tokens, out: completion.usage?.completion_tokens } });
    }
  } catch (err: unknown) {
    await evalkit.flush();
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/demo/agent", async (req, res) => {
  const { prompt, model = "gpt-4o-mini", scenario = "general" } = req.body as {
    prompt?: string; model?: string; scenario?: string;
  };
  if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }

  const systemPrompts: Record<string, string> = {
    general:  "You are a helpful AI assistant. Use tools whenever they'd give more accurate information.",
    research: "You are a research assistant. Search the web for current info. Use search_web multiple times if needed.",
    finance:  "You are a financial analyst. Always fetch current prices and news. Provide analysis with data.",
    weather:  "You are a weather advisor. Always fetch current weather data. Provide practical advice.",
    data:     "You are a data analyst. Use the calculator to verify all numbers. Show your working.",
  };

  const scenarioTools: Record<string, string[]> = {
    general:  ["get_weather", "calculate", "search_web", "get_news", "translate_text"],
    research: ["search_web", "get_news"],
    finance:  ["get_stock_price", "get_news", "calculate"],
    weather:  ["get_weather"],
    data:     ["calculate"],
  };

  const system      = systemPrompts[scenario] ?? systemPrompts.general;
  const allowedTools = scenarioTools[scenario] ?? scenarioTools.general;
  const tools        = TOOL_DEFS.filter((t) => allowedTools.includes(t.function.name));

  try {
    const result = await runOpenAIAgent(prompt, system, model, tools);
    await evalkit.flush();
    res.json({ ...result, scenario });
  } catch (err: unknown) {
    await evalkit.flush();
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/demo/compare", async (req, res) => {
  const { prompt, models = ["gpt-4o-mini", "claude-haiku-4-5-20251001"] } = req.body as {
    prompt?: string; models?: string[];
  };
  if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }

  try {
    const jobs = models.map(async (model) => {
      const provider = model.startsWith("claude") ? "anthropic" : "openai";
      const start    = Date.now();
      try {
        if (provider === "anthropic") {
          const msg = await anthropic.messages.create({
            model, max_tokens: 512, messages: [{ role: "user", content: prompt }],
          });
          return {
            model: msg.model, provider,
            answer: msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join(""),
            tokens: { in: msg.usage.input_tokens, out: msg.usage.output_tokens },
            latencyMs: Date.now() - start,
          };
        } else {
          const completion = await openai.chat.completions.create({
            model, messages: [{ role: "user", content: prompt }],
          });
          return {
            model: completion.model, provider,
            answer: completion.choices[0]?.message.content ?? "",
            tokens: { in: completion.usage?.prompt_tokens ?? 0, out: completion.usage?.completion_tokens ?? 0 },
            latencyMs: Date.now() - start,
          };
        }
      } catch (err) {
        return { model, provider, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start };
      }
    });

    const results = await Promise.all(jobs);
    await evalkit.flush();
    res.json({ prompt, results });
  } catch (err: unknown) {
    await evalkit.flush();
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/flush", async (_req, res) => {
  await evalkit.flush();
  res.json({ status: "flushed" });
});

export default app;
