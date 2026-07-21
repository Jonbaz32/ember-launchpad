import "./server.js";
import { startSync } from "./sync.js";

startSync().catch((err) => {
  console.error("[indexer] fatal sync error:", err);
  process.exit(1);
});
