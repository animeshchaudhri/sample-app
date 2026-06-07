# EvalKit TypeScript SDK — Sample Apps

One-line integration examples for every supported framework and LLM provider.

## Prerequisites

```bash
npm install syntropylabs-evalkit
# plus whichever LLM SDK / framework you need (see each example)
```

## .env template

```env
EVALKIT_KEY=tk_live_...
EVALKIT_URL=http://localhost:8085   # or https://api.syntropylabs.ai

# LLM provider keys (only the ones you use)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
AWS_DEFAULT_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

## Examples

| File | Framework | LLM Provider |
|---|---|---|
| `express-openai.ts` | Express | OpenAI |
| `fastify-anthropic.ts` | Fastify | Anthropic |
| `hono-edge.ts` | Hono (edge-compatible) | OpenAI |
| `koa-anthropic.ts` | Koa | Anthropic |
| `hapi-bedrock.ts` | Hapi | AWS Bedrock |
| `nestjs-openai/main.ts` | NestJS | OpenAI |
| `langgraph-ts.ts` | LangGraph.js | OpenAI |

## How it works

Every example calls only:

```typescript
import evalkit from "syntropylabs-evalkit";

evalkit.init({
  subscriptionKey: process.env.EVALKIT_KEY,
  serviceName: "my-service",
});
```

`init()` automatically patches:
- **OpenAI** — all `chat.completions.create()` calls
- **Anthropic** — all `messages.create()` calls (sync + stream passthrough)
- **AWS Bedrock** — all `ConverseCommand` calls
- **Cohere** — all `chat()` calls
- **Vertex AI / @google-cloud/vertexai** — `generateContent()` calls
- **@google/generative-ai** — `generateContent()` calls
- **Node.js http/https** — outbound HTTP traces
- **fetch** — outbound fetch traces
- **Axios** — outbound Axios traces (if installed)
- **MongoDB/Mongoose** — query traces (if installed)

No manual `patchOpenAIClient()` or similar calls needed.

## Running

```bash
# Express
npm install express openai @types/express
npx tsx src/examples/express-openai.ts

# Fastify
npm install fastify @anthropic-ai/sdk
npx tsx src/examples/fastify-anthropic.ts

# Hono
npm install hono @hono/node-server openai
npx tsx src/examples/hono-edge.ts

# Koa
npm install koa @koa/router koa-bodyparser @anthropic-ai/sdk
npx tsx src/examples/koa-anthropic.ts

# Hapi + Bedrock
npm install @hapi/hapi @aws-sdk/client-bedrock-runtime
npx tsx src/examples/hapi-bedrock.ts

# NestJS
npm install @nestjs/core @nestjs/common @nestjs/platform-express reflect-metadata openai
npx ts-node -r reflect-metadata src/examples/nestjs-openai/main.ts

# LangGraph.js
npm install @langchain/langgraph @langchain/openai @langchain/core openai
npx tsx src/examples/langgraph-ts.ts
```

## View Traces

After running any example, open https://app.evalkit.io to see traces in real time.
