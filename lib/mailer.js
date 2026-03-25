// lib/mailer.js
// Real email sending via Nodemailer. Handles:
// - SMTP account rotation
// - Send delay randomization
// - Unsubscribe link injection
// - DNC/bounce checking
// - Daily cap enforcement

import nodemailer from "nodemailer";
import { getDb } from "./db.js";
import { allowInvalidSmtpTls, getAppUrl } from "./env.js";

// ── Interpolate template variables ──────────────────────────────────────────
export function interpolate(template, contact) {
  return template
    .replace(/\{\{name\}\}/g, contact.name || contact.email.split("@")[0])
    .replace(/\{\{email\}\}/g, contact.email)
    .replace(/\{\{country\}\}/g, contact.country || "")
    .replace(/\{\{source\}\}/g, contact.source || "")
    .replace(/\{\{company\}\}/g, contact.name || "your company");
}

// ── Build unsubscribe footer HTML ────────────────────────────────────────────
function unsubscribeFooter(email, appUrl) {
  const url = `${appUrl || "http://localhost:3000"}/unsubscribe?email=${encodeURIComponent(email)}`;
  return `
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;font-family:sans-serif;">
      You received this email because you or your organization opted in to our communications.<br/>
      <a href="${url}" style="color:#6b7280;">Unsubscribe</a> · 
      <a href="${url}&reason=dnc" style="color:#6b7280;">Never contact me again</a>
    </div>`;
}

// ── Create transporter from stored SMTP account ──────────────────────────────
function createTransporter(account) {
  const tls = allowInvalidSmtpTls() ? { rejectUnauthorized: false } : undefined;
  return nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.secure === 1,
    auth: { user: account.user, pass: account.password },
    tls,
  });
}

// ── Test SMTP connection ─────────────────────────────────────────────────────
export async function testSmtpConnection(accountId) {
  const db = getDb();
  const account = db.prepare("SELECT * FROM smtp_accounts WHERE id = ?").get(accountId);
  if (!account) throw new Error("SMTP account not found");

  const transporter = createTransporter(account);
  await transporter.verify();
  return { success: true, message: "SMTP connection verified successfully" };
}

// ── Send a single email ──────────────────────────────────────────────────────
export async function sendEmail({ smtpAccountId, to, toName, subject, htmlBody, textBody, campaignId, contactId }) {
  const db = getDb();
  const appUrl = getAppUrl();

  // ── DNC check ─────────────────────────────────────────────────────────────
  const dnc = db.prepare("SELECT 1 FROM dnc_list WHERE email = ?").get(to);
  if (dnc) {
    return { success: false, reason: "dnc", message: "Address is on Do Not Contact list" };
  }

  // ── Unsubscribed check ────────────────────────────────────────────────────
  const contact = db.prepare("SELECT status FROM contacts WHERE email = ?").get(to);
  if (contact?.status === "unsubscribed" || contact?.status === "dnc") {
    return { success: false, reason: "unsubscribed", message: "Contact has unsubscribed" };
  }

  // ── Get SMTP account ──────────────────────────────────────────────────────
  const account = db.prepare("SELECT * FROM smtp_accounts WHERE id = ? AND active = 1").get(smtpAccountId);
  if (!account) throw new Error("SMTP account not found or inactive");

  // ── Daily cap check ───────────────────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  if (account.last_reset !== today) {
    db.prepare("UPDATE smtp_accounts SET sent_today = 0, last_reset = ? WHERE id = ?").run(today, smtpAccountId);
    account.sent_today = 0;
  }
  if (account.sent_today >= account.daily_limit) {
    return { success: false, reason: "daily_cap", message: `Daily limit of ${account.daily_limit} reached for this account` };
  }

  // ── Inject unsubscribe footer ─────────────────────────────────────────────
  const settings = db.prepare("SELECT value FROM settings WHERE key = 'unsubscribe_link'").get();
  const addUnsub = settings?.value === "1";
  const finalHtml = addUnsub ? htmlBody + unsubscribeFooter(to, appUrl) : htmlBody;

  // ── Send ──────────────────────────────────────────────────────────────────
  const transporter = createTransporter(account);
  const fromName = account.from_name || process.env.APP_FROM_NAME || "LeadForge";

  const info = await transporter.sendMail({
    from: `"${fromName}" <${account.user}>`,
    to: toName ? `"${toName}" <${to}>` : to,
    subject,
    html: finalHtml,
    text: textBody || finalHtml.replace(/<[^>]+>/g, ""),
  });

  // ── Update DB ─────────────────────────────────────────────────────────────
  const now = new Date().toISOString();
  db.prepare("UPDATE smtp_accounts SET sent_today = sent_today + 1 WHERE id = ?").run(smtpAccountId);
  db.prepare("UPDATE contacts SET status = 'contacted', last_contacted = ?, updated_at = ? WHERE email = ?").run(now, now, to);

  if (campaignId) {
    db.prepare("UPDATE campaigns SET sent_count = sent_count + 1, delivered_count = delivered_count + 1 WHERE id = ?").run(campaignId);
  }

  if (contactId) {
    db.prepare(`
      UPDATE email_log SET status = 'sent', message_id = ?, sent_at = ? WHERE contact_id = ? AND campaign_id = ?
    `).run(info.messageId, now, contactId, campaignId);
  } else {
    db.prepare(`
      INSERT INTO email_log (campaign_id, contact_id, smtp_account_id, subject, status, message_id, sent_at)
      VALUES (?, ?, ?, ?, 'sent', ?, ?)
    `).run(campaignId || null, contactId || null, smtpAccountId, subject, info.messageId, now);
  }

  return { success: true, messageId: info.messageId };
}

// ── Send campaign batch ───────────────────────────────────────────────────────
export async function sendCampaignBatch(campaignId, batchSize = 10) {
  const db = getDb();
  const campaign = db.prepare(`
    SELECT c.*, t.subject, t.body_html, t.body_text
    FROM campaigns c
    JOIN templates t ON c.template_id = t.id
    WHERE c.id = ? AND c.status = 'active'
  `).get(campaignId);

  if (!campaign) return { sent: 0, errors: ["Campaign not found or not active"] };

  // Get contacts matching campaign filter who haven't been sent this campaign yet
  const sentIds = db.prepare(`
    SELECT contact_id FROM email_log WHERE campaign_id = ? AND status IN ('sent','delivered','opened','replied')
  `).all(campaignId).map(r => r.contact_id);

  const notInClause = sentIds.length > 0 ? `AND id NOT IN (${sentIds.join(",")})` : "";

  const contacts = db.prepare(`
    SELECT * FROM contacts
    WHERE status NOT IN ('bounced','unsubscribed','dnc')
    ${notInClause}
    LIMIT ?
  `).all(batchSize);

  const results = { sent: 0, skipped: 0, errors: [] };

  for (const contact of contacts) {
    const subject = interpolate(campaign.subject, contact);
    const htmlBody = interpolate(campaign.body_html, contact);
    const textBody = campaign.body_text ? interpolate(campaign.body_text, contact) : null;

    // Random delay between sends (avoids spam detection)
    const delay = campaign.send_delay_min + Math.random() * (campaign.send_delay_max - campaign.send_delay_min);
    await new Promise(r => setTimeout(r, delay * 1000));

    try {
      const result = await sendEmail({
        smtpAccountId: campaign.smtp_account_id,
        to: contact.email,
        toName: contact.name,
        subject,
        htmlBody,
        textBody,
        campaignId,
        contactId: contact.id,
      });
      if (result.success) results.sent++;
      else results.skipped++;
    } catch (err) {
      results.errors.push(`${contact.email}: ${err.message}`);
      // Mark as bounced if permanent error
      if (err.responseCode >= 500) {
        db.prepare("UPDATE contacts SET status = 'bounced', updated_at = ? WHERE id = ?").run(new Date().toISOString(), contact.id);
        db.prepare("UPDATE campaigns SET bounced_count = bounced_count + 1 WHERE id = ?").run(campaignId);
      }
    }
  }

  return results;
}
