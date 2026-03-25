"use client";
import { useEffect, useMemo, useState } from "react";
import { Globe, Play, RefreshCw, Square, WandSparkles } from "lucide-react";
import { Card, CardTitle, Btn, Input, Select, Badge, Spinner } from "../ui";

const COUNTRY_OPTIONS = ["all", "USA", "UK", "Canada", "Germany", "Nigeria", "India"];
const REGION_OPTIONS = ["all", "North America", "Europe", "Africa", "Asia"];
const INDUSTRY_OPTIONS = ["all", "Developers", "Designers", "Founders", "Freelancers", "Agencies", "Marketers"];

export default function Scraping({ notify }) {
  const [seedUrls, setSeedUrls] = useState("https://github.com/topics/javascript");
  const [country, setCountry] = useState("all");
  const [region, setRegion] = useState("all");
  const [industry, setIndustry] = useState("Developers");
  const [maxPages, setMaxPages] = useState("50");
  const [depthLevel, setDepthLevel] = useState("medium");
  const [speed, setSpeed] = useState("normal");
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [leads, setLeads] = useState([]);
  const [suggestions, setSuggestions] = useState({ source: [], country: [], industry: [], quality: [] });

  async function loadAll() {
    const [j, l, s] = await Promise.all([
      fetch("/api/scrape/jobs").then((r) => r.json()),
      fetch("/api/scrape/leads?limit=40").then((r) => r.json()),
      fetch("/api/scrape/suggestions").then((r) => r.json()),
    ]);
    setJobs(j.jobs || []);
    setLeads(l.leads || []);
    setSuggestions(s.suggestions || { source: [], country: [], industry: [], quality: [] });
  }

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 2500);
    return () => clearInterval(t);
  }, []);

  async function startJob() {
    const urls = seedUrls.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!urls.length) {
      notify("Add at least one seed URL");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/scrape/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seedUrls: urls,
          country,
          region,
          industry,
          maxPages: Number(maxPages || 50),
          depthLevel,
          speed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to queue scrape");
      notify(`Scrape job #${data.id} queued`);
      loadAll();
    } catch (e) {
      notify(e.message || "Failed to queue scrape");
    } finally {
      setLoading(false);
    }
  }

  async function cancelJob(id) {
    await fetch(`/api/scrape/jobs/${id}/cancel`, { method: "POST" });
    notify(`Job #${id} cancellation requested`);
    loadAll();
  }

  const running = useMemo(() => jobs.filter((j) => j.status === "running").length, [jobs]);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card>
          <CardTitle icon={<Globe size={14} />} color="var(--cyan)">Scraping Controls</CardTitle>
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 600 }}>
                Seed URLs (one per line)
              </div>
              <textarea
                value={seedUrls}
                onChange={(e) => setSeedUrls(e.target.value)}
                rows={6}
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--text-primary)",
                  width: "100%",
                  padding: "9px 11px",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  outline: "none",
                  resize: "vertical",
                }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <Select label="Country" value={country} onChange={setCountry} options={COUNTRY_OPTIONS.map((x) => ({ value: x, label: x }))} />
              <Select label="Region" value={region} onChange={setRegion} options={REGION_OPTIONS.map((x) => ({ value: x, label: x }))} />
              <Select label="Industry" value={industry} onChange={setIndustry} options={INDUSTRY_OPTIONS.map((x) => ({ value: x, label: x }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <Input label="Max Pages" value={maxPages} onChange={setMaxPages} placeholder="50" />
              <Select label="Depth" value={depthLevel} onChange={setDepthLevel} options={[
                { value: "shallow", label: "Shallow" },
                { value: "medium", label: "Medium" },
                { value: "deep", label: "Deep" },
              ]} />
              <Select label="Speed" value={speed} onChange={setSpeed} options={[
                { value: "slow", label: "Slow (safe)" },
                { value: "normal", label: "Normal" },
                { value: "aggressive", label: "Aggressive" },
              ]} />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Btn variant="primary" onClick={startJob} disabled={loading}>
                {loading ? <Spinner /> : <Play size={12} />}
                {loading ? "Queueing..." : "Start Scrape Job"}
              </Btn>
              <Btn onClick={loadAll}><RefreshCw size={12} />Refresh</Btn>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
                Running jobs: <strong style={{ color: "var(--accent)" }}>{running}</strong>
              </span>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle icon={<WandSparkles size={14} />} color="var(--violet)">AI Suggestions</CardTitle>
          <div style={{ display: "grid", gap: 10 }}>
            {[
              ["Top Sources", suggestions.source?.map((x) => `${x.value} (${x.freq})`) || []],
              ["Top Countries", suggestions.country?.map((x) => `${x.value} (${x.freq})`) || []],
              ["Top Industries", suggestions.industry?.map((x) => `${x.value} (${x.freq})`) || []],
              ["Quality Tips", suggestions.quality?.map((x) => x.value) || []],
            ].map(([title, items]) => (
              <div key={title} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--bg-elevated)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 600 }}>{title}</div>
                <div style={{ display: "grid", gap: 4 }}>
                  {items.length ? items.slice(0, 3).map((it) => (
                    <div key={it} style={{ fontSize: 12, color: "var(--text-secondary)" }}>{it}</div>
                  )) : <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No suggestions yet</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card>
          <CardTitle>Scrape Jobs</CardTitle>
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {jobs.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: 12 }}>No scrape jobs yet.</div>}
            {jobs.map((j) => (
              <div key={j.id} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>Job #{j.id}</div>
                  <Badge status={j.status} />
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>{j.created_at?.slice(0, 19).replace("T", " ")}</span>
                </div>
                <div style={{ marginTop: 5, fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 12 }}>
                  <span>Scanned: {j.progress?.scanned || 0}/{j.progress?.maxPages || j.config?.maxPages || "-"}</span>
                  <span>Inserted: {j.progress?.inserted || 0}</span>
                  <span>Dupes: {j.progress?.duplicates || 0}</span>
                  <span>Captcha: {j.progress?.captcha || 0}</span>
                </div>
                {(j.status === "running" || j.status === "queued") && (
                  <div style={{ marginTop: 7 }}>
                    <Btn variant="danger" size="sm" onClick={() => cancelJob(j.id)}><Square size={10} />Cancel</Btn>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>Recent Scraped Leads</CardTitle>
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {leads.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: 12 }}>No scraped leads yet.</div>}
            {leads.map((lead) => (
              <div key={lead.id} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{lead.email}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {lead.name || "Unknown"} {lead.country ? `• ${lead.country}` : ""} • {lead.source}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>Score {lead.score}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{lead.created_at?.slice(0, 10)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
