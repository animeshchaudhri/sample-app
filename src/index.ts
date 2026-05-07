import { app } from "./app.js";

const PORT = parseInt(process.env.PORT ?? "3100", 10);

app.listen(PORT, () => {
  console.log(`\n  evalkit showcase → http://localhost:${PORT}`);
  console.log(`  Trace service    → ${process.env.TRACE_SERVICE_URL ?? "http://localhost:8085"}`);
  console.log(`  Subscription key → ${process.env.EVALKIT_SUBSCRIPTION_KEY ?? "(not set)"}\n`);
});

process.on("SIGTERM", async () => { const { default: evalkit } = await import("@evalkit/sdk"); await evalkit.flush(); process.exit(0); });
process.on("SIGINT",  async () => { const { default: evalkit } = await import("@evalkit/sdk"); await evalkit.flush(); process.exit(0); });
