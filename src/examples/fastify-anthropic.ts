/**
 * EvalKit + Fastify + Anthropic demo
 *
 * Just call evalkit.init() — auto-instruments Anthropic, HTTP.
 * fastifyPlugin() adds per-request trace spans.
 *
 * Install: npm install fastify @anthropic-ai/sdk @evalkit/sdk
 * Run:     EVALKIT_KEY=tk_live_... ANTHROPIC_API_KEY=sk-ant-... npx tsx fastify-anthropic.ts
 * Test:    curl -X POST http://localhost:3002/chat \
 *               -H 'Content-Type: application/json' \
 *               -d '{"message":"What is Fastify?"}'
 */

import Fastify from "fastify";
import Anthropic from "@anthropic-ai/sdk";
import evalkit from "@evalkit/sdk";

evalkit.init({
  subscriptionKey: process.env.EVALKIT_KEY ?? "demo-key",
  baseUrl: process.env.EVALKIT_URL ?? "http://localhost:8085",
  serviceName: "fastify-anthropic-demo",
  environment: "development",
  debug: true,
});

const anthropic = new Anthropic();
const fastify = Fastify({ logger: false });
fastify.register(evalkit.fastifyPlugin());

fastify.post<{ Body: { message: string; maxTokens?: number } }>("/chat", async (request) => {
  const { message, maxTokens = 256 } = request.body;
  const { traceId, end, ctx } = evalkit.startTrace("chat", { message: message.slice(0, 100) });

  try {
    const reply = await evalkit.withTrace(ctx, async () => {
      const response = await anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: message }],
      });
      return response.content[0]?.type === "text" ? response.content[0].text : "";
    });
    end("OK");
    return { reply, traceId };
  } catch (err) {
    end("ERROR");
    throw err;
  }
});

fastify.get("/health", async () => ({ status: "ok" }));

const PORT = 3002;
fastify.listen({ port: PORT }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  console.log(`Fastify demo → http://localhost:${PORT}`);
});

process.on("SIGTERM", async () => { await evalkit.flush(); process.exit(0); });
process.on("SIGINT",  async () => { await evalkit.flush(); process.exit(0); });
