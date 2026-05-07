import express from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import evalkit from "../../sdk-ts/src/index.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TRACE_URL = process.env.TRACE_SERVICE_URL ?? "http://localhost:8085";
const SUB_KEY   = process.env.EVALKIT_SUBSCRIPTION_KEY ?? "tk_live_e1a8f18910d0435fef904230ddfb2a605c5bb8c2707137c3";
const PORT      = parseInt(process.env.PORT ?? "3100", 10);
const OPENAI_API_KEY   = process.env.OPENAI_API_KEY ?? ;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";


// ---------------------------------------------------------------------------
// EvalKit SDK init
// ---------------------------------------------------------------------------

evalkit.init({
  subscriptionKey: SUB_KEY,
  baseUrl: TRACE_URL,
  serviceName: "evalkit-showcase",
  environment: "development",
  debug: true,
  scheduledDelayMillis: 1000,
});

const openai    = new OpenAI({ apiKey: OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

evalkit.patchOpenAIClient(openai);
evalkit.patchAnthropicClient(anthropic);

// ---------------------------------------------------------------------------
// Tool definitions (OpenAI format)
// ---------------------------------------------------------------------------

const TOOL_DEFS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather and forecast for a city",
      parameters: {
        type: "object",
        properties: {
          city:    { type: "string", description: "City name, e.g. Delhi, New York" },
          units:   { type: "string", enum: ["celsius", "fahrenheit"], description: "Temperature unit" },
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
        properties: {
          expression: { type: "string", description: "Math expression, e.g. '2 * (3 + 4)'" },
        },
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
        properties: {
          query: { type: "string", description: "Search query" },
        },
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
        properties: {
          ticker: { type: "string", description: "Stock ticker, e.g. AAPL, TSLA" },
        },
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
          topic:  { type: "string" },
          count:  { type: "number", description: "Number of headlines (1-5)" },
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
          target_language: { type: "string", description: "e.g. Spanish, French, Hindi, Japanese" },
        },
        required: ["text", "target_language"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

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
        forecast: ["Tomorrow: similar conditions", "Day 3: chance of rain", "Weekend: clearing up"],
      };
    }
    case "calculate": {
      const expr = String(args.expression ?? "");
      try {
        // Safe eval for simple math
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
      const mockResults = [
        { title: `Recent developments in ${query}`, url: "https://example.com/1", snippet: `Latest research shows significant progress in ${query} with new breakthroughs reported this week.` },
        { title: `${query}: A comprehensive overview`, url: "https://example.com/2", snippet: `Experts weigh in on ${query}, discussing key trends and future implications for the industry.` },
        { title: `How ${query} is changing the landscape`, url: "https://example.com/3", snippet: `A deep dive into ${query} reveals surprising connections to adjacent fields and emerging opportunities.` },
      ];
      return { query, result_count: mockResults.length, results: mockResults };
    }
    case "get_stock_price": {
      const ticker = String(args.ticker ?? "").toUpperCase();
      const prices: Record<string, number> = { AAPL: 189, TSLA: 245, GOOGL: 175, MSFT: 420, AMZN: 185, NVDA: 875 };
      const base  = prices[ticker] ?? Math.floor(Math.random() * 400 + 50);
      const change = (Math.random() * 10 - 5);
      return {
        ticker,
        price: (base + change).toFixed(2),
        change: change.toFixed(2),
        change_pct: ((change / base) * 100).toFixed(2),
        volume: `${Math.floor(Math.random() * 50 + 5)}M`,
        market_cap: `$${(base * Math.floor(Math.random() * 5000 + 1000)).toLocaleString()}B`,
      };
    }
    case "get_news": {
      const topic = String(args.topic ?? "");
      const count = Math.min(Number(args.count ?? 3), 5);
      const headlines = [
        `Breaking: Major developments in ${topic} announced today`,
        `${topic} industry sees record growth amid global shifts`,
        `Experts debate the future of ${topic} at international summit`,
        `New study reveals surprising insights about ${topic}`,
        `${topic}: What you need to know this week`,
      ].slice(0, count);
      return { topic, headline_count: headlines.length, headlines, source: "Mock News API", published_at: new Date().toISOString() };
    }
    case "translate_text": {
      const text = String(args.text ?? "");
      const lang = String(args.target_language ?? "Spanish");
      return {
        original: text,
        translation: `[${lang} translation of: "${text}"]`,
        target_language: lang,
        note: "Translation provided by language model",
      };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Agent loop — runs tool calls until LLM returns a text response (max 6 rounds)
// ---------------------------------------------------------------------------

interface AgentStep {
  type: "llm" | "tool_call" | "tool_result";
  name?: string;
  args?: Record<string, unknown>;
  result?: ToolResult;
  content?: string;
  tokens?: { in: number; out: number };
}

interface AgentResult {
  answer: string;
  steps: AgentStep[];
  traceId: string;
  model: string;
  totalTokens: { in: number; out: number };
}

async function runOpenAIAgent(
  prompt: string,
  systemPrompt: string,
  model: string,
  ctx: ReturnType<typeof evalkit.startTrace>["ctx"],
  tools: OpenAI.Chat.ChatCompletionTool[] = TOOL_DEFS
): Promise<AgentResult & { traceId: string }> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user",   content: prompt },
  ];

  const steps: AgentStep[] = [];
  const totalTokens = { in: 0, out: 0 };
  let answer = "";
  let usedModel = model;

  for (let round = 0; round < 6; round++) {
    const response = await evalkit.withTrace(ctx, () =>
      openai.chat.completions.create({
        model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
      })
    );

    usedModel     = response.model;
    const tokensIn  = response.usage?.prompt_tokens ?? 0;
    const tokensOut = response.usage?.completion_tokens ?? 0;
    totalTokens.in  += tokensIn;
    totalTokens.out += tokensOut;

    const msg = response.choices[0]?.message;
    if (!msg) break;

    messages.push(msg);

    // No tool calls → final answer
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      answer = msg.content ?? "";
      steps.push({ type: "llm", content: answer, tokens: { in: tokensIn, out: tokensOut } });
      break;
    }

    steps.push({ type: "llm", content: "(deciding tool calls…)", tokens: { in: tokensIn, out: tokensOut } });

    // Execute each tool call, record a child span
    for (const tc of msg.tool_calls) {
      const fname = tc.function.name;
      const fargs = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;

      steps.push({ type: "tool_call", name: fname, args: fargs });

      const { end } = evalkit.startSpan(`tool:${fname}`, { "tool.name": fname }, ctx);
      const result  = await executeTool(fname, fargs);
      end("OK");

      steps.push({ type: "tool_result", name: fname, result });

      messages.push({
        role:         "tool",
        tool_call_id: tc.id,
        content:      JSON.stringify(result),
      });
    }
  }

  return { answer, steps, traceId: "", model: usedModel, totalTokens };
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(readFileSync(join(__dirname, "index.html"), "utf8"));
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", traceService: TRACE_URL, sdk: "evalkit-showcase" });
});

// ---------------------------------------------------------------------------
// POST /demo/chat — simple single-turn LLM call (OpenAI or Anthropic)
// ---------------------------------------------------------------------------

app.post("/demo/chat", async (req, res) => {
  const { prompt, model = "gpt-4o-mini", provider = "openai" } = req.body as {
    prompt?: string; model?: string; provider?: string;
  };
  if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }

  const { traceId, end, ctx } = evalkit.startTrace("chat", { "demo.provider": provider });

  try {
    if (provider === "anthropic") {
      const msg = await evalkit.withTrace(ctx, () =>
        anthropic.messages.create({
          model: model || "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        })
      );
      const answer = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
      end("OK");
      res.json({ answer, model: msg.model, traceId, tokens: { in: msg.usage.input_tokens, out: msg.usage.output_tokens } });
    } else {
      const completion = await evalkit.withTrace(ctx, () =>
        openai.chat.completions.create({
          model,
          messages: [{ role: "user", content: prompt }],
        })
      );
      const answer = completion.choices[0]?.message.content ?? "";
      end("OK");
      res.json({ answer, model: completion.model, traceId, tokens: { in: completion.usage?.prompt_tokens, out: completion.usage?.completion_tokens } });
    }
  } catch (err: unknown) {
    end("ERROR");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /demo/agent — multi-step tool-calling agent
// ---------------------------------------------------------------------------

app.post("/demo/agent", async (req, res) => {
  const { prompt, model = "gpt-4o-mini", scenario = "general" } = req.body as {
    prompt?: string; model?: string; scenario?: string;
  };
  if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }

  const systemPrompts: Record<string, string> = {
    general:  "You are a helpful AI assistant. Use the available tools whenever they would give you more accurate or current information. Think step by step.",
    research: "You are a research assistant. For any question, search the web for current information, check multiple sources, and provide a well-cited, comprehensive answer. Use the search_web tool multiple times if needed.",
    finance:  "You are a financial analyst. When asked about stocks or markets, always fetch current prices and recent news. Provide analysis with specific data points.",
    weather:  "You are a weather and travel advisor. Always fetch current weather data when asked. Provide practical advice based on conditions.",
    data:     "You are a data analyst. Use the calculator tool to verify all numbers. Show your working step by step.",
  };

  const system = systemPrompts[scenario] ?? systemPrompts.general;

  // Filter tools by scenario
  const scenarioTools: Record<string, string[]> = {
    general:  ["get_weather", "calculate", "search_web", "get_news", "translate_text"],
    research: ["search_web", "get_news"],
    finance:  ["get_stock_price", "get_news", "calculate"],
    weather:  ["get_weather"],
    data:     ["calculate"],
  };
  const allowedTools = (scenarioTools[scenario] ?? scenarioTools.general);
  const tools = TOOL_DEFS.filter((t) => allowedTools.includes(t.function.name));

  const { traceId, end, ctx } = evalkit.startTrace(`agent:${scenario}`, {
    "demo.scenario": scenario,
    "demo.prompt": prompt.slice(0, 200),
  });

  try {
    const result = await runOpenAIAgent(prompt, system, model, ctx, tools);
    end(result.answer ? "OK" : "ERROR");
    res.json({ ...result, traceId, scenario });
  } catch (err: unknown) {
    end("ERROR");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /demo/compare — run same prompt on multiple models, side by side
// ---------------------------------------------------------------------------

app.post("/demo/compare", async (req, res) => {
  const { prompt, models = ["gpt-4o-mini", "claude-haiku-4-5-20251001"] } = req.body as {
    prompt?: string; models?: string[];
  };
  if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }

  const { traceId, end, ctx } = evalkit.startTrace("compare", { "demo.models": models.join(",") });

  try {
    const jobs = models.map(async (model) => {
      const provider = model.startsWith("claude") ? "anthropic" : "openai";
      const start    = Date.now();
      try {
        if (provider === "anthropic") {
          const msg = await evalkit.withTrace(ctx, () =>
            anthropic.messages.create({
              model,
              max_tokens: 512,
              messages: [{ role: "user", content: prompt }],
            })
          );
          return {
            model: msg.model,
            provider,
            answer: msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join(""),
            tokens: { in: msg.usage.input_tokens, out: msg.usage.output_tokens },
            latencyMs: Date.now() - start,
          };
        } else {
          const completion = await evalkit.withTrace(ctx, () =>
            openai.chat.completions.create({ model, messages: [{ role: "user", content: prompt }] })
          );
          return {
            model: completion.model,
            provider,
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
    end("OK");
    res.json({ prompt, results, traceId });
  } catch (err: unknown) {
    end("ERROR");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /flush
// ---------------------------------------------------------------------------

app.post("/flush", async (_req, res) => {
  await evalkit.flush();
  res.json({ status: "flushed" });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`\n  evalkit showcase → http://localhost:${PORT}`);
  console.log(`  Trace service    → ${TRACE_URL}`);
  console.log(`  Subscription key → ${SUB_KEY}\n`);
});

process.on("SIGTERM", () => evalkit.flush().then(() => process.exit(0)));
process.on("SIGINT",  () => evalkit.flush().then(() => process.exit(0)));
