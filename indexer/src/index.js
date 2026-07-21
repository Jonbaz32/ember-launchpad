import "./server.js";
import { startSync } from "./sync.js";
import { startRelayer } from "./relayer.js";

startSync().catch((err) => {
  console.error("[indexer] fatal sync error:", err);
  process.exit(1);
});

startRelayer().catch((err) => {
  console.error("[relayer] fatal relayer error:", err);
});
