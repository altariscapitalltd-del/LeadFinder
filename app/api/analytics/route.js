export const dynamic = "force-dynamic";
// app/api/analytics/route.js
import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db.js";

export async function GET() {
  try {
    const db = getDb();

    const totalContacts = db.prepare("SELECT COUNT(*) as n FROM contacts").get().n;
    const newToday = db.prepare("SELECT COUNT(*) as n FROM contacts WHERE date(created_at) = date('now')").get().n;
    const totalSent = db.prepare("SELECT COUNT(*) as n FROM email_log WHERE status IN ('sent','delivered','opened','replied')").get().n;
    const totalReplied = db.prepare("SELECT COUNT(*) as n FROM email_log WHERE status = 'replied'").get().n;
    const totalBounced = db.prepare("SELECT COUNT(*) as n FROM email_log WHERE status = 'bounced'").get().n;

    const byStatus = db.prepare("SELECT status, COUNT(*) as count FROM contacts GROUP BY status").all();
    const byType = db.prepare("SELECT type, COUNT(*) as count FROM contacts GROUP BY type").all();
    const byCountry = db.prepare("SELECT country, COUNT(*) as count FROM contacts WHERE country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 10").all();
    const growth = db.prepare(`
      SELECT date(created_at) as d, COUNT(*) as contacts
      FROM contacts
      WHERE created_at >= date('now', '-14 days')
      GROUP BY date(created_at)
      ORDER BY d
    `).all();
    const campaigns = db.prepare("SELECT name, sent_count, delivered_count, opened_count, replied_count, bounced_count FROM campaigns ORDER BY created_at DESC LIMIT 10").all();

    const replyRate = totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) : 0;
    const bounceRate = totalSent > 0 ? ((totalBounced / totalSent) * 100).toFixed(1) : 0;

    return NextResponse.json({
      totalContacts, newToday, totalSent, totalReplied, totalBounced,
      replyRate, bounceRate,
      byStatus, byType, byCountry, growth, campaigns
    });
  } catch (error) {
    return NextResponse.json({
      totalContacts: 0,
      newToday: 0,
      totalSent: 0,
      totalReplied: 0,
      totalBounced: 0,
      replyRate: 0,
      bounceRate: 0,
      byStatus: [],
      byType: [],
      byCountry: [],
      growth: [],
      campaigns: [],
      warning: error.message,
    });
  }
}
