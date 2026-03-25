"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, MessageSquarePlus, Send, Sparkles, Loader2 } from "lucide-react";
import { Btn, Card, CardTitle } from "../ui";

const STARTERS = [
  "Find my highest scoring contacts and summarize them.",
  "Start a scrape for keyword AI founders in the USA with 100 pages.",
  "Create a new outreach template for AI agencies.",
  "Show me which campaigns are active and which need attention.",
];

export default function Agent({ notify }) {
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [thread, setThread] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);

  async function loadThreads(targetThreadId) {
    const res = await fetch("/api/agent");
    const data = await res.json();
    const nextThreads = data.threads || [];
    setThreads(nextThreads);
    const selectedId = targetThreadId || activeThreadId || nextThreads[0]?.id || null;
    if (selectedId) {
      await loadThread(selectedId);
    } else {
      setThread(null);
      setActiveThreadId(null);
    }
  }

  async function loadThread(id) {
    const res = await fetch(`/api/agent?threadId=${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load thread");
    setThread(data.thread);
    setActiveThreadId(data.thread.id);
  }

  useEffect(() => {
    loadThreads().catch((err) => notify?.(err.message || "Failed to load agent"));
  }, []);

  useEffect(() => {
    function handleInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
  }, []);

  async function sendMessage(messageText) {
    const content = String(messageText || input).trim();
    if (!content || loading) return;
    setLoading(true);
    try {
      const optimistic = thread
        ? { ...thread, messages: [...thread.messages, { id: `temp-${Date.now()}`, role: "user", content }] }
        : { id: activeThreadId || "new", messages: [{ id: `temp-${Date.now()}`, role: "user", content }] };
      setThread(optimistic);
      setInput("");

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId, message: content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Agent request failed");
      setThread(data.thread);
      setActiveThreadId(data.thread.id);
      await loadThreads(data.thread.id);
    } catch (error) {
      notify?.(error.message || "Agent request failed");
    } finally {
      setLoading(false);
    }
  }

  const messages = useMemo(() => thread?.messages || [], [thread]);

  return (
    <div className="page-shell">
      <div className="page-hero">
        <div>
          <div className="eyebrow">Autonomous Workspace</div>
          <h1 className="page-title">LeadForge Agent</h1>
          <p className="page-subtitle">
            Chat with an in-app agent that can inspect your pipeline, queue keyword scrapes, create templates, and operate the CRM.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn onClick={() => { setThread(null); setActiveThreadId(null); }} variant="ghost"><MessageSquarePlus size={14} />New Chat</Btn>
          {installPrompt && (
            <Btn
              variant="primary"
              onClick={async () => {
                await installPrompt.prompt();
                setInstallPrompt(null);
              }}
            >
              <Sparkles size={14} />Install App
            </Btn>
          )}
        </div>
      </div>

      <div className="agent-layout">
        <Card className="agent-sidebar">
          <CardTitle icon={<Bot size={14} />} color="var(--accent-2)">Recent Threads</CardTitle>
          <div style={{ display: "grid", gap: 8 }}>
            {threads.length === 0 && <div className="muted-small">No conversations yet. Start with one of the prompts below.</div>}
            {threads.map((item) => (
              <button
                key={item.id}
                className="agent-thread-button"
                data-active={item.id === activeThreadId}
                onClick={() => loadThread(item.id).catch((err) => notify?.(err.message))}
              >
                <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{item.title || `Thread ${item.id}`}</div>
                <div className="muted-small">{item.last_message?.slice(0, 90) || "No messages yet"}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="agent-main">
          <CardTitle icon={<Bot size={14} />}>Agent Chat</CardTitle>
          <div className="agent-messages">
            {messages.length === 0 && (
              <div className="agent-empty">
                <div className="agent-orb"><Bot size={22} /></div>
                <div className="agent-empty-title">Ask the app to do real work</div>
                <div className="muted-small" style={{ maxWidth: 560 }}>
                  Try asking for high-score leads, keyword-driven scraping, campaign reviews, template creation, or analytics summaries.
                </div>
                <div className="starter-grid">
                  {STARTERS.map((starter) => (
                    <button key={starter} className="starter-card" onClick={() => sendMessage(starter)}>
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className={`agent-bubble agent-${message.role}`}>
                <div className="agent-role">
                  {message.role === "assistant" ? "LeadForge Agent" : message.role === "tool" ? `Tool: ${message.tool_name}` : "You"}
                </div>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{message.content}</div>
              </div>
            ))}
          </div>

          <div className="agent-composer">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask the agent to search leads, queue a scrape, create a template, or review campaign health..."
            />
            <Btn variant="primary" onClick={() => sendMessage()} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {loading ? "Working..." : "Send"}
            </Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}
