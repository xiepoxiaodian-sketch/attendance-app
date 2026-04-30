import crypto from "crypto";
import type { Request, Response } from "express";
import * as db from "./db";

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || "";
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

// ── Signature Verification ──────────────────────────────────────────────────

function verifyLineSignature(body: string, signature: string): boolean {
  if (!LINE_CHANNEL_SECRET) return false;
  const hash = crypto
    .createHmac("SHA256", LINE_CHANNEL_SECRET)
    .update(body)
    .digest("base64");
  return hash === signature;
}

// ── Send Push Message via LINE ──────────────────────────────────────────────

export async function sendLineMessage(lineUserId: string, text: string): Promise<void> {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    console.warn("[LINE Bot] No access token configured");
    return;
  }
  const res = await fetch(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[LINE Bot] Push failed:", err);
  }
}

// ── Reply Message via LINE ──────────────────────────────────────────────────

async function replyLineMessage(replyToken: string, text: string): Promise<void> {
  if (!LINE_CHANNEL_ACCESS_TOKEN) return;
  await fetch(LINE_REPLY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });
}

// ── Webhook Handler ─────────────────────────────────────────────────────────

export async function lineWebhookHandler(req: Request, res: Response): Promise<void> {
  // Verify signature
  const signature = req.headers["x-line-signature"] as string;
  const rawBody = JSON.stringify(req.body);
  if (LINE_CHANNEL_SECRET && !verifyLineSignature(rawBody, signature)) {
    console.warn("[LINE Webhook] Invalid signature");
    res.status(401).json({ ok: false, error: "Invalid signature" });
    return;
  }

  res.status(200).json({ ok: true });

  const events = req.body?.events || [];
  for (const event of events) {
    if (event.type !== "message" || event.message?.type !== "text") continue;
    const lineUserId: string = event.source?.userId;
    const text: string = event.message.text.trim();
    const replyToken: string = event.replyToken;

    if (!lineUserId) continue;

    // Command: 綁定 <員工帳號>
    if (text.startsWith("綁定 ") || text.startsWith("绑定 ")) {
      const username = text.replace(/^(綁定|绑定)\s+/, "").trim();
      if (!username) {
        await replyLineMessage(replyToken, "請輸入員工帳號，格式：綁定 <帳號>");
        continue;
      }
      const employee = await db.getEmployeeByUsername(username);
      if (!employee) {
        await replyLineMessage(replyToken, `找不到員工帳號「${username}」，請確認帳號是否正確`);
        continue;
      }
      // Check if this LINE account is already bound to another employee
      const existingBound = await db.getEmployeeByLineUserId(lineUserId);
      if (existingBound && existingBound.id !== employee.id) {
        await replyLineMessage(replyToken, `此 LINE 帳號已綁定員工「${existingBound.fullName}」，如需更換請聯絡管理員`);
        continue;
      }
      await db.updateEmployeeLineUserId(employee.id, lineUserId);
      await replyLineMessage(replyToken, `✅ 綁定成功！\n員工：${employee.fullName}\n帳號：${username}\n\n之後打卡時，請在 App 點擊「發送 OTP」，系統會透過 LINE 傳送驗證碼給您。`);
      continue;
    }

    // Default: show help
    await replyLineMessage(
      replyToken,
      "👋 歡迎使用好好上班打卡系統\n\n請輸入以下指令綁定您的員工帳號：\n\n綁定 <員工帳號>\n\n例如：綁定 john123"
    );
  }
}
