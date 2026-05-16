/**
 * EvalKit + Hapi + AWS Bedrock demo
 *
 * Just call evalkit.init() — auto-instruments Bedrock, HTTP.
 * hapiPlugin() adds per-request trace spans.
 *
 * Install: npm install @hapi/hapi @aws-sdk/client-bedrock-runtime @evalkit/sdk
 * Run:     EVALKIT_KEY=tk_live_... AWS_DEFAULT_REGION=us-east-1 npx tsx hapi-bedrock.ts
 * Test:    curl "http://localhost:3005/ask?q=What+is+Hapi.js"
 */

import Hapi from "@hapi/hapi";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import evalkit from "@evalkit/sdk";

evalkit.init({
  subscriptionKey: process.env.EVALKIT_KEY ?? "demo-key",
  baseUrl: process.env.EVALKIT_URL ?? "http://localhost:8085",
  serviceName: "hapi-bedrock-demo",
  environment: "development",
  debug: true,
});

const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_DEFAULT_REGION ?? "us-east-1",
});

const init = async () => {
  const server = Hapi.server({ port: 3005, host: "0.0.0.0" });

  await server.register(evalkit.hapiPlugin());

  server.route({
    method: "GET",
    path: "/ask",
    handler: async (request) => {
      const question = String(request.query.q ?? "What is Hapi.js?");
      const model = "anthropic.claude-3-haiku-20240307-v1:0";

      const { traceId, end, ctx } = evalkit.startTrace("ask", {
        question: question.slice(0, 100),
        model,
      });

      try {
        const answer = await evalkit.withTrace(ctx, async () => {
          const response = await bedrock.send(
            new ConverseCommand({
              modelId: model,
              messages: [{ role: "user", content: [{ text: question }] }],
              inferenceConfig: { maxTokens: 256 },
            })
          );
          const content = response.output?.message?.content ?? [];
          return (content.find((c) => "text" in c) as { text: string } | undefined)?.text ?? "";
        });
        end("OK");
        return { answer, traceId };
      } catch (err) {
        end("ERROR");
        return { error: String(err) };
      }
    },
  });

  server.route({
    method: "GET",
    path: "/health",
    handler: () => ({ status: "ok" }),
  });

  await server.start();
  console.log(`Hapi demo → ${server.info.uri}`);

  process.on("SIGTERM", async () => { await evalkit.flush(); await server.stop(); });
  process.on("SIGINT",  async () => { await evalkit.flush(); await server.stop(); });
};

init().catch(console.error);
