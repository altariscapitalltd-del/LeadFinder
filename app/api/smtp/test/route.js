export const dynamic = "force-dynamic";
// app/api/smtp/test/route.js
import { NextResponse } from "next/server";
import { testSmtpConnection } from "../../../../lib/mailer.js";

function normalizeMailError(err) {
  const code = err?.code || err?.responseCode || "SMTP_ERROR";
  const message = err?.response || err?.message || "SMTP verification failed";
  return { code, message };
}

export async function POST(req) {
  const { id } = await req.json();
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ success: false, message: "valid numeric id is required" }, { status: 400 });
  }
  try {
    const result = await testSmtpConnection(numericId);
    return NextResponse.json(result);
  } catch (err) {
    const normalized = normalizeMailError(err);
    return NextResponse.json({ success: false, ...normalized }, { status: 400 });
  }
}
