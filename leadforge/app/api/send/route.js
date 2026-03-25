// app/api/send/route.js — Send a one-off email to a single contact right now
import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db.js";
import { sendEmail, interpolate } from "../../../lib/mailer.js";

export async function POST(req) {
  const body = await req.json();
  const { contactId, smtpAccountId, subject, htmlBody, textBody, campaignId } = body;

  if (!contactId || !smtpAccountId || !subject || !htmlBody) {
    return NextResponse.json({ error: "contactId, smtpAccountId, subject and htmlBody are required" }, { status: 400 });
  }

  const db = getDb();
  const contact = db.prepare("SELECT * FROM contacts WHERE id = ?").get(contactId);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  // Interpolate variables
  const finalSubject = interpolate(subject, contact);
  const finalHtml = interpolate(htmlBody, contact);
  const finalText = textBody ? interpolate(textBody, contact) : null;

  try {
    const result = await sendEmail({
      smtpAccountId,
      to: contact.email,
      toName: contact.name,
      subject: finalSubject,
      htmlBody: finalHtml,
      textBody: finalText,
      campaignId: campaignId || null,
      contactId,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
