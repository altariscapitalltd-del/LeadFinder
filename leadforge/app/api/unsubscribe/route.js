// app/api/unsubscribe/route.js
import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db.js";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  const reason = searchParams.get("reason") || "unsubscribed";

  if (!email) {
    return new NextResponse("Missing email", { status: 400 });
  }

  const db = getDb();
  const now = new Date().toISOString();

  // Add to DNC list if reason = dnc
  if (reason === "dnc") {
    db.prepare("INSERT OR IGNORE INTO dnc_list (email, reason) VALUES (?, 'user_requested_dnc')").run(email);
    db.prepare("UPDATE contacts SET status = 'dnc', updated_at = ? WHERE email = ?").run(now, email);
  } else {
    db.prepare("UPDATE contacts SET status = 'unsubscribed', updated_at = ? WHERE email = ?").run(now, email);
    db.prepare("INSERT OR IGNORE INTO dnc_list (email, reason) VALUES (?, 'unsubscribed')").run(email);
  }

  // Return a clean HTML confirmation page
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Unsubscribed</title>
  <style>
    body { font-family: sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { text-align: center; padding: 48px; background: #1e293b; border-radius: 16px; max-width: 400px; }
    h1 { font-size: 24px; margin-bottom: 12px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="box">
    <h1>✓ ${reason === "dnc" ? "You've been removed" : "Unsubscribed"}</h1>
    <p>${reason === "dnc"
      ? "You have been permanently removed from all mailing lists. You will not receive any further emails."
      : "You have been unsubscribed successfully. You won't receive any more emails from us."
    }</p>
    <p style="margin-top:24px;font-size:12px;color:#475569;">${email}</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}
