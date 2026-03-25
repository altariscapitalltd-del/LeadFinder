"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Compass,
  Copy,
  Download,
  Filter,
  Globe,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Square,
} from "lucide-react";
import { Btn, Card, CardTitle, DatalistInput, Input, Select, Spinner } from "../ui";
import { COUNTRIES, INDUSTRIES } from "../../lib/catalogs";

const REGION_OPTIONS = ["all", "North America", "Europe", "Africa", "Asia"];
const FILTER_OPTIONS = [
  { value: "all", label: "All emails" },
  { value: "gmail_only", label: "Gmail only" },
  { value: "personal", label: "Personal emails" },
  { value: "business", label: "Business emails" },
];

function TypingText({ text }) {
  const [visible, setVisible] = useState("");

  useEffect(() => {
    let index = 0;
    setVisible("");
    const timer = setInterval(() => {
      index += 4;
      setVisible(text.slice(0, index));
      if (index >= text.length) clearInterval(timer);
    }, 14);
    return () => clearInterval(timer);
  }, [text]);

  return <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{visible || text}</div>;
}

function eventToMessage(event) {
  const meta = event.meta || {};
  if (event.event_type === "crawl_expansion") return event.message;
  if (event.event_type === "email_found") return `${event.message} from ${meta.sourceUrl || "source"}`;
  if (event.event_type === "filter_applied") return `${event.message}`;
  if (event.event_type === "task_complete") return event.message;
  return event.message;
}

export default function Scraping({ notify }) {
  const [keyword, setKeyword] = useState("crypto");
  const [seedUrls, setSeedUrls] = useState("");
  const [country, setCountry] = useState("United States");
  const [region, setRegion] = useState("all");
  const [industry, setIndustry] = useState("Crypto");
  const [emailFilter, setEmailFilter] = useState("business");
  const [targetEmails, setTargetEmails] = useState("100");
  const [maxPages, setMaxPages] = useState("300");
  const [depthLevel, setDepthLevel] = useState("deep");
  const [speed, setSpeed] = useState("normal");
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [suggestions, setSuggestions] = useState({ source: [], country: [], industry: [], quality: [] });
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [results, setResults] = useState([]);
  const eventSourceRef = useRef(null);

  async function loadSummary() {
    const [j, s] = await Promise.all([
      fetch("/api/scrape/jobs").then((r) => r.json()),
      fetch("/api/scrape/suggestions").then((r) => r.json()),
    ]);
    const nextJobs = j.jobs || [];
    setJobs(nextJobs);
    setSuggestions(s.suggestions || { source: [], country: [], industry: [], quality: [] });
    const preferredId = selectedJobId || nextJobs[0]?.id || null;
    if (preferredId && preferredId !== selectedJobId) setSelectedJobId(preferredId);
  }

  async function loadJob(id) {
    const [jobRes, leadsRes] = await Promise.all([
      fetch(`/api/scrape/jobs/${id}`).then((r) => r.json()),
      fetch(`/api/scrape/leads?jobId=${id}&limit=150`).then((r) => r.json()),
    ]);
    setSelectedJob(jobRes.job || null);
    setResults(leadsRes.leads || []);
  }

  useEffect(() => {
    loadSummary().catch((error) => notify(error.message));
    const timer = setInterval(() => loadSummary().catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedJobId) return;
    loadJob(selectedJobId).catch((error) => notify(error.message));

    if (eventSourceRef.current) eventSourceRef.current.close();
    const source = new EventSource(`/api/scrape/jobs/${selectedJobId}/stream`);
    eventSourceRef.current = source;
    source.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      setSelectedJob(payload.job);
      fetch(`/api/scrape/leads?jobId=${selectedJobId}&limit=150`)
        .then((r) => r.json())
        .then((data) => setResults(data.leads || []))
        .catch(() => {});
    });
    source.addEventListener("done", (event) => {
      const payload = JSON.parse(event.data);
      setSelectedJob(payload.job);
      fetch(`/api/scrape/leads?jobId=${selectedJobId}&limit=150`)
        .then((r) => r.json())
        .then((data) => setResults(data.leads || []))
        .catch(() => {});
      source.close();
    });
    source.onerror = () => {};
    return () => source.close();
  }, [selectedJobId]);

  async function startJob() {
    const urls = seedUrls.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (!keyword.trim() && !urls.length) {
      notify("Add a keyword or at least one seed URL");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/scrape/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword,
          seedUrls: urls,
          country,
          region,
          industry,
          emailFilter,
          targetEmails: Number(targetEmails || 100),
          maxPages: Number(maxPages || 300),
          depthLevel,
          speed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to queue discovery");
      setSelectedJobId(data.id);
      await loadSummary();
      notify(`Discovery job #${data.id} queued`);
    } catch (error) {
      notify(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function cancelJob(id) {
    await fetch(`/api/scrape/jobs/${id}/cancel`, { method: "POST" });
    notify(`Job #${id} cancellation requested`);
    loadSummary();
  }

  const metrics = useMemo(() => ({
    scanned: selectedJob?.progress?.scanned || 0,
    found: selectedJob?.progress?.inserted || 0,
    filtered: selectedJob?.progress?.filteredOut || 0,
    task: selectedJob?.progress?.currentTask || (selectedJob?.status === "running" ? "Discovering..." : "Idle"),
  }), [selectedJob]);

  const humanEvents = useMemo(() => (selectedJob?.events || []).slice().reverse(), [selectedJob]);

  function exportCsv() {
    const rows = [
      ["email", "type", "confidence", "source_url"],
      ...results.map((item) => [item.email, item.type, item.classification_confidence, item.source_url || ""]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, "\"\"")}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `leadforge-job-${selectedJobId || "results"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyEmails() {
    await navigator.clipboard.writeText(results.map((item) => item.email).join("\n"));
    notify("Emails copied");
  }

  return (
    <div className="page-shell">
      <div className="page-hero">
        <div>
          <div className="eyebrow">Deep Discovery Studio</div>
          <h1 className="page-title">AI-Powered Email Harvest</h1>
          <p className="page-subtitle">
            Give the system a keyword or agent-style task and watch it expand sources, scan pages, filter emails, and stream back what it is doing in real time.
          </p>
        </div>
        <div className="hero-stat">
          <span>Current task</span>
          <strong style={{ fontSize: "1.1rem", lineHeight: 1.5 }}>{metrics.task}</strong>
        </div>
      </div>

      <div className="scrape-premium-grid">
        <Card>
          <CardTitle icon={<Search size={14} />} color="var(--accent)">Command Input</CardTitle>
          <div style={{ display: "grid", gap: 12 }}>
            <Input label="Keyword or intent" value={keyword} onChange={setKeyword} placeholder="crypto companies" />
            <div>
              <div className="field-label">Optional seed URLs</div>
              <textarea
                className="app-textarea"
                rows={5}
                value={seedUrls}
                onChange={(event) => setSeedUrls(event.target.value)}
                placeholder="https://example.com/directory"
              />
            </div>
            <div className="responsive-three">
              <DatalistInput label="Country" value={country} onChange={setCountry} options={COUNTRIES} placeholder="Search country" listId="scrape-country-list" />
              <Select label="Region" value={region} onChange={setRegion} options={REGION_OPTIONS.map((value) => ({ value, label: value }))} />
              <DatalistInput label="Industry" value={industry} onChange={setIndustry} options={INDUSTRIES} placeholder="Search industry" listId="scrape-industry-list" />
            </div>
            <div className="responsive-three">
              <Select label="Email filter" value={emailFilter} onChange={setEmailFilter} options={FILTER_OPTIONS} />
              <Input label="Target emails" value={targetEmails} onChange={setTargetEmails} placeholder="100" />
              <Input label="Max pages" value={maxPages} onChange={setMaxPages} placeholder="300" />
            </div>
            <div className="responsive-three">
              <Select label="Depth" value={depthLevel} onChange={setDepthLevel} options={[
                { value: "shallow", label: "Shallow" },
                { value: "medium", label: "Medium" },
                { value: "deep", label: "Deep" },
              ]} />
              <Select label="Speed" value={speed} onChange={setSpeed} options={[
                { value: "slow", label: "Slow" },
                { value: "normal", label: "Normal" },
                { value: "aggressive", label: "Aggressive" },
              ]} />
              <div className="insight-card" style={{ padding: 12 }}>
                <div className="field-label">Routing</div>
                <div className="muted-small">JS-heavy pages can fall back to browser rendering automatically.</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn variant="primary" onClick={startJob} disabled={loading}>
                {loading ? <Spinner /> : <Play size={14} />}
                {loading ? "Queueing..." : "Start Deep Discovery"}
              </Btn>
              <Btn onClick={() => loadSummary().catch((error) => notify(error.message))}><RefreshCw size={14} />Refresh</Btn>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle icon={<Filter size={14} />} color="var(--accent-2)">Live Metrics</CardTitle>
          <div className="metric-grid">
            {[
              { label: "Pages scanned", value: metrics.scanned },
              { label: "Emails stored", value: metrics.found },
              { label: "Emails filtered", value: metrics.filtered },
              { label: "Queued pages", value: selectedJob?.progress?.queue?.queued || 0 },
            ].map((item) => (
              <div key={item.label} className="metric-card">
                <div className="field-label">{item.label}</div>
                <div className="metric-value">{item.value}</div>
              </div>
            ))}
          </div>
          {selectedJob?.progress?.summary && (
            <div className="insight-card" style={{ marginTop: 12 }}>
              <div className="field-label">AI Summary</div>
              <div className="muted-small" style={{ lineHeight: 1.7 }}>{selectedJob.progress.summary}</div>
            </div>
          )}
          <div className="insight-stack" style={{ marginTop: 12 }}>
            <div className="insight-card">
              <div className="field-label">Top sources</div>
              {(suggestions.source || []).slice(0, 5).map((item) => (
                <div key={item.value} className="insight-row"><span>{item.value}</span><strong>{item.freq}</strong></div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="scrape-premium-grid">
        <Card className="agent-main">
          <CardTitle icon={<Bot size={14} />} color="var(--accent-3)">Agent Activity</CardTitle>
          <div className="agent-messages">
            {humanEvents.length === 0 && <div className="muted-small">No live agent activity yet. Start a job to stream actions here.</div>}
            {humanEvents.map((event) => (
              <div key={event.id} className={`agent-bubble agent-${event.level === "error" ? "tool" : "assistant"}`}>
                <div className="agent-role">{event.event_type.replace(/_/g, " ")}</div>
                <TypingText text={eventToMessage(event)} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle icon={<Compass size={14} />}>Jobs</CardTitle>
          <div style={{ display: "grid", gap: 10 }}>
            {jobs.map((job) => (
              <button key={job.id} className="job-card job-button" data-active={selectedJobId === job.id} onClick={() => setSelectedJobId(job.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 700 }}>Job #{job.id}</div>
                    <div className="muted-small">{job.config?.keyword || "seed crawl"} · {job.config?.emailFilter || "all"} · target {job.config?.targetEmails || 0}</div>
                  </div>
                  <div className={`status-chip ${job.status}`}>{job.status}</div>
                </div>
                <div className="job-meta">
                  <span>{job.progress?.scanned || 0} scanned</span>
                  <span>{job.progress?.inserted || 0} stored</span>
                  <span>{job.progress?.filteredOut || 0} filtered</span>
                </div>
                {(job.status === "running" || job.status === "queued") && (
                  <div style={{ marginTop: 8, textAlign: "left" }}>
                    <Btn variant="danger" size="sm" onClick={(event) => { event.stopPropagation(); cancelJob(job.id); }}>
                      <Square size={11} />Cancel
                    </Btn>
                  </div>
                )}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="scrape-premium-grid">
        <Card>
          <CardTitle icon={<Globe size={14} />} color="var(--accent)">Results</CardTitle>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <Btn onClick={exportCsv}><Download size={14} />Export CSV</Btn>
            <Btn onClick={copyEmails}><Copy size={14} />Copy Emails</Btn>
          </div>
          <div className="results-table">
            {results.length === 0 && <div className="muted-small">No results yet for this job.</div>}
            {results.map((lead) => (
              <div key={lead.id} className="result-row">
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{lead.email}</div>
                  <div className="muted-small">{lead.source_url || lead.source}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="mini-chip">{lead.type}</div>
                  <div className="muted-small">confidence {Math.round(Number(lead.classification_confidence || 0) * 100)}%</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle icon={<Sparkles size={14} />} color="var(--accent-2)">Frontier Preview</CardTitle>
          <div className="results-table">
            {(selectedJob?.pages || []).length === 0 && <div className="muted-small">No pages queued yet.</div>}
            {(selectedJob?.pages || []).slice(0, 25).map((page) => (
              <div key={page.id} className="result-row">
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{page.page_kind || "page"} · depth {page.depth}</div>
                  <div className="muted-small">{page.url}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className={`status-chip ${page.status}`}>{page.status}</div>
                  <div className="muted-small">priority {Number(page.priority || 0).toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
