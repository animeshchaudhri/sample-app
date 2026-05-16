/**
 * EvalKit + Koa + Anthropic demo
 *
 * Just call evalkit.init() — auto-instruments Anthropic, HTTP.
 * koaMiddleware() adds per-request trace spans.
 *
 * Install: npm install koa @koa/router koa-bodyparser @anthropic-ai/sdk @evalkit/sdk
 * Run:     EVALKIT_KEY=tk_live_... ANTHROPIC_API_KEY=sk-ant-... npx tsx koa-anthropic.ts
 * Test:    curl -X POST http://localhost:3004/chat \
 *               -H 'Content-Type: application/json' \
 *               -d '{"message":"What is Koa.js?"}'
 */

import Koa from "koa";
import Router from "@koa/router";
import bodyParser from "koa-bodyparser";
import Anthropic from "@anthropic-ai/sdk";
import evalkit from "@evalkit/sdk";

evalkit.init({
  subscriptionKey: process.env.EVALKIT_KEY ?? "demo-key",
  baseUrl: process.env.EVALKIT_URL ?? "http://localhost:8085",
  serviceName: "koa-anthropic-demo",
  environment: "development",
  debug: true,
});

const anthropic = new Anthropic();
const app = new Koa();
const router = new Router();

app.use(bodyParser());
app.use(evalkit.koaMiddleware());

router.post("/chat", async (ctx) => {
  const { message, maxTokens = 256 } = ctx.request.body as { message: string; maxTokens?: number };
  const { traceId, end, ctx: spanCtx } = evalkit.startTrace("chat", { message: message.slice(0, 100) });

  try {
    const reply = await evalkit.withTrace(spanCtx, async () => {
      const response = await anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: message }],
      });
      return response.content[0]?.type === "text" ? response.content[0].text : "";
    });
    end("OK");
    ctx.body = { reply, traceId };
  } catch (err) {
    end("ERROR");
    ctx.status = 500;
    ctx.body = { error: String(err) };
  }
});

router.get("/health", (ctx) => { ctx.body = { status: "ok" }; });

app.use(router.routes()).use(router.allowedMethods());

const PORT = 3004;
app.listen(PORT, () => console.log(`Koa demo → http://localhost:${PORT}`));

process.on("SIGTERM", async () => { await evalkit.flush(); process.exit(0); });
process.on("SIGINT",  async () => { await evalkit.flush(); process.exit(0); });
