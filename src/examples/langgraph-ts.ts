/**
 * EvalKit + LangGraph.js + OpenAI demo
 *
 * Just call evalkit.init() — LangGraph uses openai under the hood
 * (via @langchain/openai), which is class-level patched automatically.
 * Node functions are optionally wrapped in named spans.
 *
 * Install: npm install @langchain/langgraph @langchain/openai openai @evalkit/sdk
 * Run:     EVALKIT_KEY=tk_live_... OPENAI_API_KEY=sk-... npx tsx langgraph-ts.ts
 */

import { StateGraph, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import evalkit from "@evalkit/sdk";

evalkit.init({
  subscriptionKey: process.env.EVALKIT_KEY ?? "demo-key",
  baseUrl: process.env.EVALKIT_URL ?? "http://localhost:8085",
  serviceName: "langgraph-ts-demo",
  environment: "development",
  debug: true,
});

interface AgentState {
  question: string;
  answer: string;
  usedTool: boolean;
}

const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });

async function thinkNode(state: AgentState): Promise<Partial<AgentState>> {
  const { traceId, end, ctx } = evalkit.startTrace("node.think", {
    question: state.question.slice(0, 80),
  });
  try {
    const answer = await evalkit.withTrace(ctx, async () => {
      const response = await llm.invoke([
        new SystemMessage("You are a helpful assistant. Answer concisely."),
        new HumanMessage(state.question),
      ]);
      return String(response.content);
    });
    end("OK");
    return { answer };
  } catch (err) {
    end("ERROR");
    throw err;
  }
}

async function lookupNode(state: AgentState): Promise<Partial<AgentState>> {
  const { end, ctx } = evalkit.startTrace("node.lookup", {
    question: state.question.slice(0, 80),
  });
  await evalkit.withTrace(ctx, async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  end("OK");
  return { answer: `[stub] Lookup result for: ${state.question}`, usedTool: true };
}

function router(state: AgentState): string {
  return /lookup|search|find/i.test(state.question) ? "lookup" : "end";
}

const graph = new StateGraph<AgentState>({
  channels: {
    question: { value: (_, b) => b ?? "" },
    answer: { value: (_, b) => b ?? "" },
    usedTool: { value: (_, b) => b ?? false },
  },
})
  .addNode("think", thinkNode)
  .addNode("lookup", lookupNode)
  .addEdge("__start__", "think")
  .addConditionalEdges("think", router, { lookup: "lookup", end: END })
  .addEdge("lookup", END)
  .compile();

const questions = [
  "What is the capital of France?",
  "Search for information about quantum computing.",
  "What is 2+2?",
];

for (const question of questions) {
  console.log(`\nQ: ${question}`);
  const result = await graph.invoke({ question, answer: "", usedTool: false });
  console.log(`A: ${result.answer}`);
}

await evalkit.flush();
console.log("\nDone — spans exported.");
