export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db.js";

export async function GET() {
  try {
    const db = getDb();
    db.prepare("SELECT 1").get();
    return NextResponse.json({
      ok: true,
      service: "leadforge-ai",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
