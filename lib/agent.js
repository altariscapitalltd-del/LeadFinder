import { complete, generateEmail } from "./ai.js";
import { getDb } from "./db.js";
import { classifyEmailType } from "./ai.js";
import { enqueueScrapeJob, listScrapeJobs } from "./scraper/queue.js";

function nowIso() {
  return new Date().toISOString();
}

function parseJsonSafe(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function createThread(title = "New Agent Chat") {
  const db = getDb();
  const result = db.prepare("INSERT INTO agent_threads (title, created_at, updated_at) VALUES (?, ?, ?)").run(title, nowIso(), nowIso());
  return Number(result.lastInsertRowid);
}

function saveMessage(threadId, role, content, toolName = null) {
  const db = getDb();
  db.prepare("INSERT INTO agent_messages (thread_id, role, content, tool_name, created_at) VALUES (?, ?, ?, ?, ?)").run(threadId, role, content, toolName, nowIso());
  db.prepare("UPDATE agent_threads SET updated_at = ? WHERE id = ?").run(nowIso(), threadId);
}

export function listAgentThreads() {
  const db = getDb();
  return db.prepare(`
    SELECT t.*,
      (SELECT content FROM agent_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_message
    FROM agent_threads t
    ORDER BY t.updated_at DESC, t.id DESC
    LIMIT 30
  `).all();
}

export function getAgentThread(threadId) {
  const db = getDb();
  const thread = db.prepare("SELECT * FROM agent_threads WHERE id = ?").get(threadId);
  if (!thread) return null;
  const messages = db.prepare("SELECT id, role, content, tool_name, created_at FROM agent_messages WHERE thread_id = ? ORDER BY id ASC").all(threadId);
  return { ...thread, messages };
}

function getAppSnapshot() {
  const db = getDb();
  const counts = {
    contacts: db.prepare("SELECT COUNT(*) AS n FROM contacts").get().n,
    campaigns: db.prepare("SELECT COUNT(*) AS n FROM campaigns").get().n,
    templates: db.prepare("SELECT COUNT(*) AS n FROM templates").get().n,
    scrapeJobs: db.prepare("SELECT COUNT(*) AS n FROM scrape_jobs").get().n,
  };
  const recentContacts = db.prepare("SELECT id, email, name, status, score, source, created_at FROM contacts ORDER BY created_at DESC LIMIT 5").all();
  const recentCampaigns = db.prepare("SELECT id, name, status, sent_count, replied_count, created_at FROM campaigns ORDER BY created_at DESC LIMIT 5").all();
  const recentJobs = listScrapeJobs(5).map((job) => ({
    id: job.id,
    status: job.status,
    progress: job.progress,
    config: {
      keyword: job.config?.keyword || "",
      maxPages: job.config?.maxPages,
    },
  }));
  return { counts, recentContacts, recentCampaigns, recentJobs };
}

async function executeTool(call, sessionProviders = []) {
  const db = getDb();
  const args = call?.arguments || {};
  switch (call?.tool) {
    case "list_contacts": {
      const limit = Math.max(1, Math.min(25, Number(args.limit || 10)));
      const search = String(args.search || "").trim();
      const where = search ? "WHERE email LIKE ? OR name LIKE ?" : "";
      const params = search ? [`%${search}%`, `%${search}%`, limit] : [limit];
      const contacts = db.prepare(`
        SELECT id, email, name, status, score, source, country, type
        FROM contacts
        ${where}
        ORDER BY score DESC, created_at DESC
        LIMIT ?
      `).all(...params);
      return { tool: call.tool, result: { contacts } };
    }
    case "create_contact": {
      if (!args.email) throw new Error("email is required");
      const email = String(args.email).trim().toLowerCase();
      const result = db.prepare(`
        INSERT INTO contacts (email, name, country, region, type, source, tags, consent_note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        email,
        args.name || null,
        args.country || null,
        args.region || null,
        classifyEmailType(email),
        args.source || "Agent",
        JSON.stringify(Array.isArray(args.tags) ? args.tags : []),
        args.consent_note || "Added by app agent",
        nowIso(),
        nowIso()
      );
      return { tool: call.tool, result: { id: Number(result.lastInsertRowid), email } };
    }
    case "queue_scrape": {
      const id = enqueueScrapeJob({
        keyword: String(args.keyword || "").trim(),
        seedUrls: Array.isArray(args.seedUrls) ? args.seedUrls : [],
        country: args.country || "all",
        region: args.region || "all",
        industry: args.industry || "all",
        emailFilter: ["all", "gmail_only", "personal", "business"].includes(args.emailFilter) ? args.emailFilter : "all",
        generateEmails: args.generateEmails !== false,
        generationMode: ["off", "roles"].includes(args.generationMode) ? args.generationMode : "roles",
        targetEmails: Math.max(10, Math.min(5000, Number(args.targetEmails || 100))),
        maxPages: Math.max(1, Math.min(1000, Number(args.maxPages || 75))),
        depthLevel: ["shallow", "medium", "deep"].includes(args.depthLevel) ? args.depthLevel : "medium",
        speed: ["slow", "normal", "aggressive"].includes(args.speed) ? args.speed : "normal",
      });
      return { tool: call.tool, result: { id } };
    }
    case "list_scrape_jobs": {
      return { tool: call.tool, result: { jobs: listScrapeJobs(Math.max(1, Math.min(10, Number(args.limit || 5)))) } };
    }
    case "create_template": {
      if (!args.name || !args.goal) throw new Error("name and goal are required");
      const generated = await generateEmail({ goal: args.goal, tone: args.tone || "professional", sessionProviders });
      const result = db.prepare(`
        INSERT INTO templates (name, subject, body_html, body_text, tone, variables, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        args.name,
        generated.subject,
        generated.body_html,
        generated.body_text || null,
        args.tone || "professional",
        JSON.stringify(generated.variables_used || []),
        nowIso()
      );
      return { tool: call.tool, result: { id: Number(result.lastInsertRowid), subject: generated.subject } };
    }
    case "list_campaigns": {
      const campaigns = db.prepare("SELECT id, name, status, sent_count, replied_count, created_at FROM campaigns ORDER BY created_at DESC LIMIT 10").all();
      return { tool: call.tool, result: { campaigns } };
    }
    case "update_campaign_status": {
      const id = Number(args.id);
      if (!Number.isInteger(id) || id <= 0) throw new Error("valid campaign id required");
      const status = String(args.status || "");
      db.prepare("UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), id);
      return { tool: call.tool, result: { id, status } };
    }
    case "analytics_summary": {
      const summary = {
        totalContacts: db.prepare("SELECT COUNT(*) AS n FROM contacts").get().n,
        newToday: db.prepare("SELECT COUNT(*) AS n FROM contacts WHERE date(created_at) = date('now')").get().n,
        activeCampaigns: db.prepare("SELECT COUNT(*) AS n FROM campaigns WHERE status = 'active'").get().n,
        totalTemplates: db.prepare("SELECT COUNT(*) AS n FROM templates").get().n,
      };
      return { tool: call.tool, result: summary };
    }
    default:
      throw new Error(`Unknown tool: ${call?.tool}`);
  }
}

const TOOL_DEFS = [
  { tool: "list_contacts", description: "Search or list contacts", arguments: { search: "optional string", limit: "optional number <= 25" } },
  { tool: "create_contact", description: "Create a new contact in the CRM", arguments: { email: "required string", name: "optional string", country: "optional string", region: "optional string", source: "optional string", tags: "optional string array", consent_note: "optional string" } },
  { tool: "queue_scrape", description: "Queue a keyword-driven or URL-seed scrape job", arguments: { keyword: "optional string", seedUrls: "optional string array", country: "optional string", region: "optional string", industry: "optional string", emailFilter: "optional all|gmail_only|personal|business", generateEmails: "optional boolean", generationMode: "optional off|roles", targetEmails: "optional number", maxPages: "optional number", depthLevel: "optional shallow|medium|deep", speed: "optional slow|normal|aggressive" } },
  { tool: "list_scrape_jobs", description: "List recent scrape jobs", arguments: { limit: "optional number <= 10" } },
  { tool: "create_template", description: "Generate and save a new email template", arguments: { name: "required string", goal: "required string", tone: "optional string" } },
  { tool: "list_campaigns", description: "List recent campaigns", arguments: {} },
  { tool: "update_campaign_status", description: "Update campaign status", arguments: { id: "required campaign id", status: "required string" } },
  { tool: "analytics_summary", description: "Get high-level app metrics", arguments: {} },
];

async function planAgentReply(history, snapshot, sessionProviders = []) {
  const transcript = history.map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`).join("\n\n");
  const latest = history[history.length - 1]?.content?.toLowerCase() || "";

  if (/scrape|harvest|discovery job|find .*email|business email|personal email/.test(latest)) {
    return {
      reply: "I can queue a discovery run from that request.",
      toolCalls: [{
        tool: "queue_scrape",
        arguments: {
          keyword: latest.replace(/.*(?:for|about)\s+/i, "").trim() || latest,
          emailFilter: /gmail/.test(latest) ? "gmail_only" : /personal/.test(latest) ? "personal" : /business/.test(latest) ? "business" : "all",
          generateEmails: true,
          generationMode: "roles",
          targetEmails: 100,
          maxPages: 120,
          depthLevel: "deep",
        },
      }],
    };
  }
  try {
    const text = await complete({
      system: `You are LeadForge's in-app agent. You should feel like a capable product operator: helpful, concise, action-oriented.
You can inspect data and perform actions using tools.
Return only valid JSON with shape:
{"reply":"string","toolCalls":[{"tool":"name","arguments":{}}]}
Rules:
- Use tools when the user asks for data lookup, creation, status changes, or scraping.
- Use at most 3 tool calls.
- If no tool is needed, return an empty toolCalls array.
- Never invent IDs or claim an action happened unless you call the tool.`,
    prompt: `Available tools:
${JSON.stringify(TOOL_DEFS, null, 2)}

App snapshot:
${JSON.stringify(snapshot, null, 2)}

Conversation:
${transcript}`,
      maxTokens: 700,
      sessionProviders,
    });
    return parseJsonSafe(String(text || "").replace(/```json|```/g, "").trim(), { reply: "I hit a formatting issue. Please try that again.", toolCalls: [] });
  } catch {
    if (/scrape|harvest|find emails/.test(latest)) {
      return {
        reply: "I can queue a discovery run from that request.",
        toolCalls: [{
          tool: "queue_scrape",
          arguments: {
            keyword: latest.replace(/.*(?:for|about)\s+/i, "").trim() || latest,
            emailFilter: /gmail/.test(latest) ? "gmail_only" : /personal/.test(latest) ? "personal" : /business/.test(latest) ? "business" : "all",
            generateEmails: true,
            generationMode: "roles",
            targetEmails: 100,
            maxPages: 120,
            depthLevel: "deep",
          },
        }],
      };
    }
    if (/contact|lead/.test(latest)) {
      return { reply: "I can pull your top contacts.", toolCalls: [{ tool: "list_contacts", arguments: { limit: 10 } }] };
    }
    if (/campaign/.test(latest)) {
      return { reply: "I can inspect your campaigns.", toolCalls: [{ tool: "list_campaigns", arguments: {} }] };
    }
    return {
      reply: "The agent needs an AI provider to reason across the app. Add an API key in Settings, or ask me for a direct action like listing contacts or queueing a scrape.",
      toolCalls: [],
    };
  }
}

async function summarizeAfterTools(history, toolResults, snapshot, sessionProviders = []) {
  const transcript = history.map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`).join("\n\n");
  try {
    const text = await complete({
      system: "You are LeadForge's in-app agent. Summarize completed actions and next steps clearly. Be concise and confident. Do not mention hidden system details.",
      prompt: `Conversation:
${transcript}

Tool results:
${JSON.stringify(toolResults, null, 2)}

App snapshot:
${JSON.stringify(snapshot, null, 2)}

Write the final assistant response in plain text.`,
      maxTokens: 500,
      sessionProviders,
    });
    return String(text || "").trim();
  } catch {
    return toolResults
      .map((item) => `${item.tool}: ${JSON.stringify(item.result)}`)
      .join("\n");
  }
}

export async function runAgentTurn({ threadId, message, sessionProviders = [] }) {
  const id = threadId || createThread(message.slice(0, 60) || "New Agent Chat");
  saveMessage(id, "user", message);

  const before = getAgentThread(id)?.messages || [];
  const snapshot = getAppSnapshot();
  const plan = await planAgentReply(before, snapshot, sessionProviders);
  const toolCalls = Array.isArray(plan?.toolCalls) ? plan.toolCalls.slice(0, 3) : [];
  const toolResults = [];

  for (const call of toolCalls) {
    const result = await executeTool(call, sessionProviders);
    toolResults.push(result);
    saveMessage(id, "tool", JSON.stringify(result.result), result.tool);
  }

  const history = getAgentThread(id)?.messages || before;
  const reply = toolResults.length
    ? await summarizeAfterTools(history, toolResults, getAppSnapshot(), sessionProviders)
    : String(plan?.reply || "I am ready to help with leads, campaigns, scraping, templates, and analytics.");

  saveMessage(id, "assistant", reply);
  return getAgentThread(id);
}
