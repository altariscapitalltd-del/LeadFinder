export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db.js";
import { getBooleanSettingKeys, getSettingsCookieName, parseSettingsSession, serializeSettingsSession } from "../../../lib/settings-session.js";

const BOOLEAN_KEYS = getBooleanSettingKeys();

function shouldUseSecureCookies(req) {
  const forwardedProto = String(req.headers.get("x-forwarded-proto") || "").toLowerCase();
  const host = String(req.headers.get("host") || "").toLowerCase();
  if (host.includes("localhost") || host.includes("127.0.0.1")) return false;
  return process.env.NODE_ENV === "production" || forwardedProto === "https";
}

export async function GET(req) {
  const cookieSettings = parseSettingsSession(req.cookies.get(getSettingsCookieName())?.value);
  try {
    const db = getDb();
    const rows = db.prepare("SELECT key, value FROM settings").all();
    const settings = {
      ...cookieSettings,
      ...Object.fromEntries(rows.map((row) => [row.key, BOOLEAN_KEYS.has(row.key) ? row.value === "1" : row.value])),
    };
    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ settings: cookieSettings });
  }
}

export async function PATCH(req) {
  const body = await req.json();
  const entries = Object.entries(body || {}).filter(([key]) => BOOLEAN_KEYS.has(key));
  if (!entries.length) return NextResponse.json({ error: "No valid settings provided" }, { status: 400 });

  const cookieSettings = parseSettingsSession(req.cookies.get(getSettingsCookieName())?.value);
  const nextSettings = {
    ...cookieSettings,
    ...Object.fromEntries(entries.map(([key, value]) => [key, Boolean(value)])),
  };

  try {
    const db = getDb();
    const upsert = db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const tx = db.transaction((items) => {
      for (const [key, value] of items) {
        upsert.run(key, value ? "1" : "0");
      }
    });
    tx(entries);
  } catch {
    // Session-backed settings keep deployed behavior stable when local disk is not durable.
  }

  const response = NextResponse.json({ ok: true, settings: nextSettings });
  response.cookies.set(getSettingsCookieName(), serializeSettingsSession(nextSettings), {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(req),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
