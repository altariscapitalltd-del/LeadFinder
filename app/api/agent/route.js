export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getAgentThread, listAgentThreads, runAgentTurn } from "../../../lib/agent.js";
import { getProviderCookieName, parseProviderSession } from "../../../lib/provider-session.js";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const threadId = Number(searchParams.get("threadId"));
  if (Number.isInteger(threadId) && threadId > 0) {
    const thread = getAgentThread(threadId);
    if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    return NextResponse.json({ thread });
  }
  return NextResponse.json({ threads: listAgentThreads() });
}

export async function POST(req) {
  try {
    const body = await req.json();
    const message = String(body.message || "").trim();
    const threadId = body.threadId ? Number(body.threadId) : null;
    if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });
    const sessionProviders = parseProviderSession(req.cookies.get(getProviderCookieName())?.value);
    const thread = await runAgentTurn({ threadId, message, sessionProviders });
    return NextResponse.json({ thread });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Agent request failed" }, { status: 500 });
  }
}
