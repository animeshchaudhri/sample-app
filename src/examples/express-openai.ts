/**
 * EvalKit + Express + OpenAI demo
 *
 * Just call evalkit.init() — auto-instruments OpenAI, HTTP, DB.
 * expressMiddleware() adds per-request trace spans to every route.
 *
 * Install: npm install express openai @evalkit/sdk
 * Run:     EVALKIT_KEY=tk_live_... OPENAI_API_KEY=sk-... npx tsx express-openai.ts
 * Test:    curl "http://localhost:3001/ask?q=What+is+TypeScript"
 */

import express from "express";
import OpenAI from "openai";
import evalkit from "@evalkit/sdk";

evalkit.init({
  subscriptionKey: process.env.EVALKIT_KEY ?? "demo-key",
  baseUrl: process.env.EVALKIT_URL ?? "http://localhost:8085",
  serviceName: "express-openai-demo",
  environment: "development",
  debug: true,
});

const openai = new OpenAI();
const app = express();
app.use(express.json());
app.use(evalkit.expressMiddleware());

app.get("/ask", async (req, res) => {
  const question = String(req.query.q ?? "What is 2+2?");

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
    res.json({ answer, traceId });
  } catch (err) {
    end("ERROR");
    res.status(500).json({ error: String(err) });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = 3001;
app.listen(PORT, () => console.log(`Express demo → http://localhost:${PORT}`));

process.on("SIGTERM", async () => { await evalkit.flush(); process.exit(0); });
process.on("SIGINT",  async () => { await evalkit.flush(); process.exit(0); });
