// app/api/smtp/test/route.js
import { NextResponse } from "next/server";
import { testSmtpConnection } from "../../../../lib/mailer.js";

export async function POST(req) {
  const { id } = await req.json();
  try {
    const result = await testSmtpConnection(id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 400 });
  }
}
