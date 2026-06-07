/**
 * EvalKit + Hono + OpenAI demo (edge-compatible)
 *
 * Just call evalkit.init() — auto-instruments OpenAI, HTTP.
 * honoMiddleware() adds per-request trace spans.
 * Compatible with Cloudflare Workers, Vercel Edge, Deno Deploy.
 *
 * Install: npm install hono @hono/node-server openai syntropylabs-evalkit
 * Run:     EVALKIT_KEY=tk_live_... OPENAI_API_KEY=sk-... npx tsx hono-edge.ts
 * Test:    curl "http://localhost:3003/ask?q=Explain+edge+computing"
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import OpenAI from "openai";
import evalkit from "syntropylabs-evalkit";

evalkit.init({
  subscriptionKey: process.env.EVALKIT_KEY ?? "demo-key",
  baseUrl: process.env.EVALKIT_URL ?? "http://localhost:8085",
  serviceName: "hono-openai-demo",
  environment: "development",
  debug: true,
});

const openai = new OpenAI();
const app = new Hono();
app.use("*", evalkit.honoMiddleware());

app.get("/ask", async (c) => {
  const question = c.req.query("q") ?? "What is edge computing?";

  const { traceId, end, ctx } = evalkit.startTrace("ask", { question: question.slice(0, 100) });
  try {
    const answer = await evalkit.withTrace(ctx, async () => {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: question },
        ],
      });
      return response.choices[0]?.message?.content ?? "";
    });
    end("OK");
    return c.json({ answer, traceId });
  } catch (err) {
    end("ERROR");
    return c.json({ error: String(err) }, 500);
  }
});

app.get("/health", (c) => c.json({ status: "ok" }));

const PORT = 3003;
serve({ fetch: app.fetch, port: PORT }, () =>
  console.log(`Hono demo → http://localhost:${PORT}`)
);

process.on("SIGTERM", async () => { await evalkit.flush(); process.exit(0); });
process.on("SIGINT",  async () => { await evalkit.flush(); process.exit(0); });
