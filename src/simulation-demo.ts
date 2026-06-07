import evalkit, { type SimContext, type AgentTurnResult } from "syntropylabs-evalkit";
import OpenAI from "openai";
import { readFileSync } from "fs";

try {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch { /* no .env — rely on real env */ }

const SUB_KEY = process.env.EVALKIT_KEY ?? process.env.EVALKIT_SUBSCRIPTION_KEY ?? "";
const BASE = process.env.EVALKIT_URL ?? process.env.TRACE_SERVICE_URL ?? "https://api.syntropylabs.ai";
const API = process.env.EVALKIT_API_URL ?? BASE;
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";

if (!SUB_KEY) {
  console.error("Set EVALKIT_KEY (subscription key) first.");
  process.exit(1);
}

evalkit.init({
  subscriptionKey: SUB_KEY,
  baseUrl: BASE,
  apiUrl: API,
  serviceName: "evalkit-sim-demo",
  environment: "demo",
  scheduledDelayMillis: 800,
  debug: true,
});

const AGENT_INSTRUCTIONS =
  "You are a concise assistant for a weather + utilities app. You can check the weather, do math, and search the web. Call a tool when it helps; otherwise answer directly and politely decline off-topic requests.";

const TOOL_DEFS: OpenAI.Chat.ChatCompletionTool[] = [
  { type: "function", function: { name: "get_weather", description: "Get current weather for a city", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } },
  { type: "function", function: { name: "calculate", description: "Evaluate a math expression", parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] } } },
  { type: "function", function: { name: "search_web", description: "Search the web", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
];
const TOOL_NAMES = TOOL_DEFS.map((t) => t.function.name);

const FALLBACK_SCENARIOS = [
  { name: "Weather happy path", category: "happy_path", starting_prompt: "What's the weather in Delhi right now?", expected_tools: ["get_weather"], target_keywords: ["weather"] },
  { name: "Math calculation", category: "happy_path", starting_prompt: "What is 1234 * 56?", expected_tools: ["calculate"], target_keywords: ["69104"] },
  { name: "Web lookup", category: "multi_turn_workflow", starting_prompt: "Find the latest news about AI agents.", expected_tools: ["search_web"], target_keywords: [] },
  { name: "Off-topic guard", category: "off_topic_guard", starting_prompt: "Write me a long poem about cats.", expected_tools: [], target_keywords: [] },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const safeParse = (s: string) => { try { return JSON.parse(s); } catch { return {}; } };

function runTool(name: string, args: any): unknown {
  if (name === "get_weather") return { city: args.city ?? "Delhi", tempC: 31, condition: "Sunny" };
  if (name === "calculate") { try { return { result: Function(`return (${args.expression})`)() }; } catch { return { error: "bad expression" }; } }
  if (name === "search_web") return { results: [`Top result for "${args.query}"`] };
  return { ok: true };
}

const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;

async function realAgent(ctx: SimContext): Promise<AgentTurnResult> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: AGENT_INSTRUCTIONS },
    { role: "user", content: ctx.message },
  ];
  const toolCalls: { name: string; args?: Record<string, unknown> }[] = [];
  let res = await openai!.chat.completions.create({ model: "gpt-4o-mini", messages, tools: TOOL_DEFS });
  let msg = res.choices[0].message;
  if (msg.tool_calls?.length) {
    messages.push(msg);
    for (const tc of msg.tool_calls) {
      const args = safeParse((tc as any).function.arguments);
      toolCalls.push({ name: (tc as any).function.name, args });
      const out = runTool((tc as any).function.name, args);
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(out) });
    }
    res = await openai!.chat.completions.create({ model: "gpt-4o-mini", messages, tools: TOOL_DEFS });
    msg = res.choices[0].message;
  }
  return { text: msg.content ?? "", toolCalls };
}

async function mockAgent(ctx: SimContext): Promise<AgentTurnResult> {
  const llm = evalkit.startSpan("chat.completion", { "evalkit.span_type": "llm_call", "gen_ai.request.model": "mock-gpt", "evalkit.prompt": ctx.message });
  await sleep(120);
  const toolCalls: { name: string; args?: Record<string, unknown> }[] = [];
  const lower = ctx.message.toLowerCase();
  const pick = lower.includes("weather") ? "get_weather" : /\d/.test(lower) ? "calculate" : lower.includes("news") || lower.includes("find") ? "search_web" : null;
  if (pick) {
    const args = pick === "get_weather" ? { city: "Delhi" } : pick === "calculate" ? { expression: "1234*56" } : { query: ctx.message };
    const span = evalkit.startSpan(pick, { "evalkit.span_type": "tool_call", "tool.name": pick, "tool.arguments": JSON.stringify(args) });
    await sleep(40);
    span.end("OK");
    toolCalls.push({ name: pick, args });
  }
  const reply = pick ? `Here's what I found (${pick}).` : "I can help with weather, math, and web search — I can't help with that request.";
  await sleep(60);
  llm.end("OK", { "evalkit.completion": reply });
  return { text: reply, toolCalls };
}

async function main() {
  console.log(`\n▶ EvalKit simulation demo  (api=${API}, key=${SUB_KEY.slice(0, 10)}…)`);

  let scenarios: any[] = FALLBACK_SCENARIOS;
  if (OPENAI_KEY) {
    try {
      const gen = await evalkit.generateScenarios({ agentInstructions: AGENT_INSTRUCTIONS, tools: TOOL_NAMES, count: 5, provider: "openai", apiKey: OPENAI_KEY });
      if (gen.length) { scenarios = gen; console.log(`✓ generated ${gen.length} scenarios via /scenarios/generate`); }
      console.log(gen);
    } catch (e: any) {
      console.warn(`! generate failed (${e?.message}); using ${FALLBACK_SCENARIOS.length} fallback scenarios`);
    }
  } else {
    console.log(`! no OPENAI_API_KEY — using ${FALLBACK_SCENARIOS.length} fallback scenarios + mock agent`);
  }

  const entrypoint = openai ? realAgent : mockAgent;
  const report = await evalkit.simulateUser({ entrypoint, scenarios, tags: ["investor-demo"] });

  console.log("\n── report ──");
  for (const r of report.results) console.log(`  ${r.status === "OK" ? "✓" : "✗"} ${r.name}  turns=${r.turns}  scores=${JSON.stringify(r.scores)}`);
  console.log(`\nsimulationId=${report.simulationId}  runId=${report.runId}`);

  await evalkit.flush();
  await sleep(1500);
  console.log("\n✓ flushed — open the dashboard → Simulations tab.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
