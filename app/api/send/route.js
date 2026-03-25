export const dynamic = "force-dynamic";
// app/api/send/route.js — Send a one-off email to a single contact right now
import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db.js";
import { sendEmail, interpolate } from "../../../lib/mailer.js";

function normalizeMailError(err) {
  const code = err?.code || err?.responseCode || "SEND_FAILED";
  const message = err?.response || err?.message || "Failed to send email";
  return { code, message };
}

export async function POST(req) {
  const body = await req.json();
  const { contactId, smtpAccountId, subject, htmlBody, textBody, campaignId } = body;
  const contactIdNum = Number(contactId);
  const smtpAccountIdNum = Number(smtpAccountId);

  if (!contactId || !smtpAccountId || !subject || !htmlBody) {
    return NextResponse.json({ error: "contactId, smtpAccountId, subject and htmlBody are required" }, { status: 400 });
  }
  if (!Number.isInteger(contactIdNum) || !Number.isInteger(smtpAccountIdNum)) {
    return NextResponse.json({ error: "contactId and smtpAccountId must be numeric" }, { status: 400 });
  }

  const db = getDb();
  const contact = db.prepare("SELECT * FROM contacts WHERE id = ?").get(contactIdNum);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  // Interpolate variables
  const finalSubject = interpolate(subject, contact);
  const finalHtml = interpolate(htmlBody, contact);
  const finalText = textBody ? interpolate(textBody, contact) : null;

  try {
    const result = await sendEmail({
      smtpAccountId: smtpAccountIdNum,
      to: contact.email,
      toName: contact.name,
      subject: finalSubject,
      htmlBody: finalHtml,
      textBody: finalText,
      campaignId: campaignId || null,
      contactId: contactIdNum,
    });

    return NextResponse.json(result);
  } catch (err) {
    const normalized = normalizeMailError(err);
    return NextResponse.json({ success: false, error: normalized.message, code: normalized.code }, { status: 400 });
  }
}
