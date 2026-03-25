"use client";

import { useEffect, useMemo, useState } from "react";
import { Cpu, KeyRound, Mail, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { Btn, Card, CardTitle, Input, Modal, Spinner, Toggle } from "../ui";

const PROVIDERS = [
  { value: "openai", label: "OpenAI", placeholder: "sk-...", provider_type: "openai" },
  { value: "openrouter", label: "OpenRouter", placeholder: "sk-or-...", provider_type: "openai", base_url: "https://openrouter.ai/api/v1" },
  { value: "gemini", label: "Gemini", placeholder: "AIza...", provider_type: "gemini" },
  { value: "groq", label: "Groq", placeholder: "gsk_...", provider_type: "openai", base_url: "https://api.groq.com/openai/v1" },
  { value: "anthropic", label: "Anthropic", placeholder: "sk-ant-...", provider_type: "anthropic" },
  { value: "compatible", label: "OpenAI Compatible", placeholder: "api-key", provider_type: "openai" },
];

export default function SettingsPage({ notify }) {
  const [smtpAccounts, setSmtpAccounts] = useState([]);
  const [aiProviders, setAiProviders] = useState([]);
  const [showSmtpModal, setShowSmtpModal] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState({});
  const [form, setForm] = useState({ label: "", host: "smtp.gmail.com", port: "587", secure: false, user: "", password: "", from_name: "", daily_limit: "200" });
  const [aiForm, setAiForm] = useState({ provider: "openai", provider_type: "openai", api_key: "", base_url: "" });
  const [compliance, setCompliance] = useState({
    unsubscribe_link: true,
    dnc_enforced: true,
    spam_check: true,
    consent_tracking: true,
    send_delay_random: true,
    bounce_handling: true,
  });

  const providerInfo = useMemo(() => PROVIDERS.find((provider) => provider.value === aiForm.provider), [aiForm.provider]);

  useEffect(() => {
    loadSmtp();
    loadAi();
  }, []);

  async function loadSmtp() {
    const res = await fetch("/api/smtp");
    const data = await res.json();
    setSmtpAccounts(data.accounts || []);
  }

  async function loadAi() {
    setLoadingAi(true);
    try {
      const res = await fetch("/api/ai");
      const data = await res.json();
      setAiProviders(data.providers || []);
    } finally {
      setLoadingAi(false);
    }
  }

  async function saveSmtp() {
    if (!form.host || !form.user || !form.password) {
      notify("Host, email and password are required");
      return;
    }
    const res = await fetch("/api/smtp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, port: parseInt(form.port, 10), daily_limit: parseInt(form.daily_limit, 10) }),
    });
    const data = await res.json();
    if (data.error) {
      notify(data.error);
      return;
    }
    notify("SMTP account saved");
    setShowSmtpModal(false);
    setForm({ label: "", host: "smtp.gmail.com", port: "587", secure: false, user: "", password: "", from_name: "", daily_limit: "200" });
    loadSmtp();
  }

  async function testSmtp(id) {
    setTestingId(id);
    setTestResult((current) => ({ ...current, [id]: null }));
    try {
      const res = await fetch("/api/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      setTestResult((current) => ({ ...current, [id]: data }));
      notify(data.success ? "SMTP connection successful" : (data.message || "SMTP test failed"));
    } catch (error) {
      setTestResult((current) => ({ ...current, [id]: { success: false, message: error.message } }));
      notify(error.message);
    } finally {
      setTestingId(null);
    }
  }

  async function deleteSmtp(id) {
    await fetch(`/api/smtp?id=${id}`, { method: "DELETE" });
    notify("SMTP account removed");
    loadSmtp();
  }

  async function saveProvider() {
    if (!aiForm.api_key) {
      notify("API key is required");
      return;
    }
    const payload = {
      provider: aiForm.provider,
      provider_type: providerInfo?.provider_type || aiForm.provider_type,
      api_key: aiForm.api_key,
      base_url: aiForm.provider === "compatible" ? aiForm.base_url : providerInfo?.base_url || "",
    };
    const res = await fetch("/api/ai/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      notify(data.error || "Failed to save provider");
      return;
    }
    notify(data.warning ? `${data.message}. ${data.warning}` : data.message);
    setAiForm({ provider: "openai", provider_type: "openai", api_key: "", base_url: "" });
    loadAi();
  }

  async function deleteProvider(provider) {
    await fetch(`/api/ai/providers?provider=${provider}`, { method: "DELETE" });
    notify(`${provider} removed`);
    loadAi();
  }

  return (
    <div className="page-shell">
      <div className="page-hero">
        <div>
          <div className="eyebrow">Production Controls</div>
          <h1 className="page-title">Delivery and AI Routing</h1>
          <p className="page-subtitle">
            Connect providers once and the app will discover models, score them, and route requests automatically without asking users to pick models manually.
          </p>
        </div>
        <Btn onClick={loadAi}><RefreshCw size={14} />Refresh Status</Btn>
      </div>

      <div className="discovery-grid">
        <Card>
          <CardTitle icon={<Cpu size={14} />} color="var(--accent-2)">AI Router</CardTitle>
          <div style={{ display: "grid", gap: 12 }}>
            <div className="responsive-three">
              {PROVIDERS.map((provider) => (
                <Btn
                  key={provider.value}
                  variant={aiForm.provider === provider.value ? "primary" : "ghost"}
                  onClick={() => setAiForm({ provider: provider.value, provider_type: provider.provider_type, api_key: "", base_url: provider.base_url || "" })}
                >
                  {provider.label}
                </Btn>
              ))}
            </div>
            <Input label="API Key" type="password" value={aiForm.api_key} onChange={(value) => setAiForm((current) => ({ ...current, api_key: value }))} placeholder={providerInfo?.placeholder || "API key"} />
            {aiForm.provider === "compatible" && (
              <Input label="Base URL" value={aiForm.base_url} onChange={(value) => setAiForm((current) => ({ ...current, base_url: value }))} placeholder="https://your-provider.example/v1" />
            )}
            <Btn variant="primary" onClick={saveProvider}><KeyRound size={14} />Connect Provider</Btn>
          </div>

          <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
            {loadingAi && <div className="muted-small">Loading router status...</div>}
            {!loadingAi && aiProviders.length === 0 && <div className="muted-small">No AI providers connected yet.</div>}
            {aiProviders.map((provider) => (
              <div key={provider.provider} className="job-card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{provider.provider}</div>
                    <div className="muted-small">{provider.models?.length || 0} models discovered · {provider.last_error ? `Issue: ${provider.last_error}` : "Healthy"}</div>
                  </div>
                  <Btn variant="danger" size="icon" onClick={() => deleteProvider(provider.provider)}><Trash2 size={12} /></Btn>
                </div>
                <div className="chip-wrap">
                  {(provider.models || []).slice(0, 8).map((model) => (
                    <span key={model.model_id} className="mini-chip">{model.model_id}</span>
                  ))}
                </div>
                <div className="muted-small" style={{ marginTop: 8 }}>
                  Auto-routing uses model performance, latency, and task type to choose the best option silently.
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle icon={<Mail size={14} />} color="var(--accent)">SMTP Accounts</CardTitle>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div className="muted-small">Delivery stays separated from routing, so provider failover never affects SMTP configuration.</div>
            <Btn variant="primary" onClick={() => setShowSmtpModal(true)}><Plus size={12} />Add</Btn>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {smtpAccounts.length === 0 && <div className="muted-small">No SMTP accounts yet.</div>}
            {smtpAccounts.map((account) => (
              <div key={account.id} className="job-card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{account.label}</div>
                    <div className="muted-small">{account.user} · {account.host}:{account.port}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn size="sm" onClick={() => testSmtp(account.id)} disabled={testingId === account.id}>
                      {testingId === account.id ? <Spinner /> : "Test"}
                    </Btn>
                    <Btn variant="danger" size="icon" onClick={() => deleteSmtp(account.id)}><Trash2 size={12} /></Btn>
                  </div>
                </div>
                {testResult[account.id] && <div className="muted-small" style={{ marginTop: 8 }}>{testResult[account.id].message || (testResult[account.id].success ? "Connection successful" : "Connection failed")}</div>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="discovery-grid">
        <Card>
          <CardTitle icon={<ShieldCheck size={14} />} color="var(--accent-3)">Safety Rules</CardTitle>
          {[
            { key: "unsubscribe_link", label: "Unsubscribe link in every email" },
            { key: "dnc_enforced", label: "DNC enforcement" },
            { key: "spam_check", label: "Spam score review" },
            { key: "consent_tracking", label: "Consent tracking" },
            { key: "send_delay_random", label: "Randomized delays" },
            { key: "bounce_handling", label: "Bounce handling" },
          ].map((item) => (
            <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 600 }}>{item.label}</div>
              <Toggle value={compliance[item.key]} onChange={(value) => setCompliance((current) => ({ ...current, [item.key]: value }))} />
            </div>
          ))}
        </Card>

        <Card>
          <CardTitle icon={<Cpu size={14} />}>Router Behavior</CardTitle>
          <div className="insight-stack">
            <div className="insight-card">
              <div className="field-label">Automatic discovery</div>
              <div className="muted-small">New provider keys trigger model discovery and caching automatically.</div>
            </div>
            <div className="insight-card">
              <div className="field-label">Failover logic</div>
              <div className="muted-small">The router retries once, moves to the next model on the same provider, then fails across providers without exposing errors to end users.</div>
            </div>
            <div className="insight-card">
              <div className="field-label">Task-aware routing</div>
              <div className="muted-small">Chat favors speed, agent work favors reasoning, and long-form tasks prefer larger context windows automatically.</div>
            </div>
          </div>
        </Card>
      </div>

      {showSmtpModal && (
        <Modal title="Add SMTP Account" onClose={() => setShowSmtpModal(false)}>
          <div style={{ display: "grid", gap: 12 }}>
            <Input label="Label" value={form.label} onChange={(value) => setForm((current) => ({ ...current, label: value }))} placeholder="Primary Gmail" />
            <div className="responsive-three" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
              <Input label="Host" value={form.host} onChange={(value) => setForm((current) => ({ ...current, host: value }))} placeholder="smtp.gmail.com" />
              <Input label="Port" value={form.port} onChange={(value) => setForm((current) => ({ ...current, port: value }))} placeholder="587" />
              <Input label="Daily Limit" value={form.daily_limit} onChange={(value) => setForm((current) => ({ ...current, daily_limit: value }))} placeholder="200" />
            </div>
            <Input label="Email / Username" value={form.user} onChange={(value) => setForm((current) => ({ ...current, user: value }))} placeholder="you@example.com" />
            <Input label="App Password" type="password" value={form.password} onChange={(value) => setForm((current) => ({ ...current, password: value }))} placeholder="app password" />
            <Input label="From Name" value={form.from_name} onChange={(value) => setForm((current) => ({ ...current, from_name: value }))} placeholder="LeadForge" />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="muted-small">Use SSL / port 465 if your provider requires it.</div>
              <Toggle value={form.secure} onChange={(value) => setForm((current) => ({ ...current, secure: value }))} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn onClick={() => setShowSmtpModal(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={saveSmtp}>Save Account</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
