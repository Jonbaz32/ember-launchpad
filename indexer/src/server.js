import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { db } from "./db.js";

const app = express();

// Security: Rate limiting to prevent DDoS & scraping spam
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // max 300 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP, please try again later." },
});

app.use(cors());
app.use(express.json());
app.use(limiter);

app.get("/health", (_req, res) => res.json({ status: "healthy", timestamp: Date.now() }));

// GET /tokens?limit=50&offset=0 — newest first
app.get("/tokens", (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const offset = Number(req.query.offset) || 0;
  const rows = db
    .prepare("SELECT * FROM tokens ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset);
  res.json(rows);
});

// GET /tokens/:address
app.get("/tokens/:address", (req, res) => {
  const row = db
    .prepare("SELECT * FROM tokens WHERE address = ? COLLATE NOCASE")
    .get(req.params.address);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
});

// GET /tokens/:address/trades?limit=100
app.get("/tokens/:address/trades", (req, res) => {
  const limit = Math.min(500, Number(req.query.limit) || 100);
  const rows = db
    .prepare(
      "SELECT * FROM trades WHERE token = ? COLLATE NOCASE ORDER BY block_number DESC, log_index DESC LIMIT ?"
    )
    .all(req.params.address, limit);
  res.json(rows);
});

// GET /tokens/:address/burns
app.get("/tokens/:address/burns", (req, res) => {
  const rows = db
    .prepare(
      "SELECT * FROM burns WHERE token = ? COLLATE NOCASE ORDER BY block_number DESC, log_index DESC"
    )
    .all(req.params.address);
  res.json(rows);
});

// GET /creators/:address/tokens
app.get("/creators/:address/tokens", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM tokens WHERE creator = ? COLLATE NOCASE ORDER BY created_at DESC")
    .all(req.params.address);
  res.json(rows);
});

// GET /stats
app.get("/stats", (req, res) => {
  try {
    const trades = db.prepare("SELECT eth_amount FROM trades").all();
    let totalWei = 0n;
    for (const t of trades) {
      try {
        totalWei += BigInt(t.eth_amount || 0);
      } catch {}
    }
    const tokenCountRow = db.prepare("SELECT COUNT(*) as count FROM tokens").get();
    const tokenCount = tokenCountRow ? tokenCountRow.count : 0;

    res.json({
      totalVolumeWei: totalWei.toString(),
      totalVolumeEth: Number(totalWei) / 1e18,
      tokenCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`[indexer] API listening on :${PORT}`));
