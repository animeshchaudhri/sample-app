/**
 * EvalKit + NestJS + OpenAI demo
 *
 * Just call evalkit.init() — auto-instruments OpenAI, HTTP, DB.
 * EvalKitInterceptor traces every controller method automatically.
 *
 * Install: npm install @nestjs/core @nestjs/common @nestjs/platform-express
 *                      openai reflect-metadata @evalkit/sdk
 * Run:     EVALKIT_KEY=tk_live_... OPENAI_API_KEY=sk-... npx ts-node -r reflect-metadata main.ts
 * Test:    curl "http://localhost:3006/ask?q=What+is+NestJS"
 */

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Controller, Get, Module, Query } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import OpenAI from "openai";
import evalkit, { EvalKitInterceptor } from "@evalkit/sdk";

evalkit.init({
  subscriptionKey: process.env.EVALKIT_KEY ?? "demo-key",
  baseUrl: process.env.EVALKIT_URL ?? "http://localhost:8085",
  serviceName: "nestjs-openai-demo",
  environment: "development",
  debug: true,
});

const openai = new OpenAI();

@Controller()
class AppController {
  @Get("ask")
  async ask(@Query("q") question: string = "What is NestJS?") {
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
      return { answer, traceId };
    } catch (err) {
      end("ERROR");
      throw err;
    }
  }

  @Get("health")
  health() {
    return { status: "ok" };
  }
}

@Module({
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: EvalKitInterceptor,
    },
  ],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const PORT = 3006;
  await app.listen(PORT);
  console.log(`NestJS demo → http://localhost:${PORT}`);

  process.on("SIGTERM", async () => { await evalkit.flush(); await app.close(); });
  process.on("SIGINT",  async () => { await evalkit.flush(); await app.close(); });
}

bootstrap().catch(console.error);
