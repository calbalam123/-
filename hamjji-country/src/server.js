import express from "express";
import { handleCommand } from "./system.js";

const app = express();
app.use(express.json());

const port = Number(process.env.PORT || 4100);
const secret = process.env.BOT_SECRET || "";

app.get("/", (_req, res) => {
  res.json({
    name: "🐹 햄찌 가상국가",
    status: "running",
    note: "공식적으로 허용된 카카오 연동 어댑터에서 /api/bot/message를 호출하세요."
  });
});

app.post("/api/bot/message", (req, res) => {
  if (secret && req.get("x-bot-secret") !== secret) {
    return res.status(401).json({ ok: false, error: "invalid bot secret" });
  }

  const { kakao_id, nickname, message } = req.body ?? {};
  if (!kakao_id || !message) {
    return res.status(400).json({ ok: false, error: "kakao_id and message are required" });
  }

  const result = handleCommand({
    id: String(kakao_id),
    nickname: String(nickname || "시민"),
    message: String(message).trim()
  });

  res.json({ ok: true, ...result });
});

app.listen(port, () => {
  console.log(`🐹 햄찌 가상국가 서버: http://localhost:${port}`);
});