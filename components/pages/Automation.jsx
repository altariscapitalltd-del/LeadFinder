"use client";

import { useEffect, useState } from "react";
import { Activity, Clock, Plus, Trash2, Zap } from "lucide-react";
import { Btn, EmptyState, Input, Modal, Select, Surface, Toggle } from "../ui";

const ACTION_TYPES = [
  { value: "run_campaign", label: "Run campaign batch" },
  { value: "validate_contacts", label: "Validate contacts" },
  { value: "import_contacts", label: "Import from source" },
  { value: "send_followups", label: "Send follow-ups" },
  { value: "score_contacts", label: "AI score new contacts" },
  { value: "generate_report", label: "Generate analytics report" },
];

const TRIGGER_TYPES = [
  { value: "schedule", label: "Scheduled" },
  { value: "event", label: "Event-based" },
];

export default function Automation({ notify, compact = false }) {
  const [rules, setRules] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    trigger_type: "schedule",
    schedule: "Daily at 09:00",
    event_type: "",
    action_type: "run_campaign",
    action_config: "{}",
  });

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    const res = await fetch("/api/automations");
    const data = await res.json();
    setRules(data.automations || []);
  }

  async function saveRule() {
    if (!form.name || !form.action_type) {
      notify("Name and action are required");
      return;
    }
    const res = await fetch("/api/automations", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      notify(data.error || "Failed to save rule");
      return;
    }
    notify("Automation rule saved");
    setShowModal(false);
    setForm({ name: "", trigger_type: "schedule", schedule: "Daily at 09:00", event_type: "", action_type: "run_campaign", action_config: "{}" });
    loadRules();
  }

  async function toggleRule(id, active) {
    await fetch("/api/automations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: active ? 1 : 0 }),
    });
    notify(`Rule ${active ? "enabled" : "disabled"}`);
    loadRules();
  }

  async function deleteRule(id) {
    await fetch(`/api/automations?id=${id}`, { method: "DELETE" });
    notify("Rule deleted");
    loadRules();
  }

  return (
    <div className="page-shell">
      {!compact && (
        <div className="page-hero">
          <div>
            <div className="eyebrow">Automation Layer</div>
            <h1 className="page-title">Automation</h1>
            <p className="page-subtitle">Keep recurring tasks visible and editable instead of burying scheduling behind hidden settings.</p>
          </div>
          <div className="hero-stat">
            <span className="eyebrow">Rules</span>
            <strong>{rules.length}</strong>
            <span className="muted-small">saved workflow rules</span>
          </div>
        </div>
      )}

      <Surface>
        <div className="section-toolbar">
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Automation Rules</div>
            <div className="muted-small">Save event-based or scheduled rules so repetitive work stays organized.</div>
          </div>
          <Btn variant="primary" onClick={() => setShowModal(true)}>
            <Plus size={14} />
            New Rule
          </Btn>
        </div>

        {rules.length === 0 && (
          <EmptyState
            icon={<Activity size={34} />}
            title="No automation rules yet"
            sub="Create rules for recurring sends, scoring, imports, or reporting."
            action={<Btn variant="primary" onClick={() => setShowModal(true)}><Plus size={14} />New Rule</Btn>}
          />
        )}

        <div className="list-stack">
          {rules.map((rule) => (
            <div key={rule.id} className="data-card horizontal">
              <div className="data-icon">{rule.trigger_type === "schedule" ? <Clock size={18} /> : <Zap size={18} />}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{rule.name}</div>
                <div className="muted-small" style={{ marginTop: 4 }}>
                  {rule.trigger_type === "schedule" ? rule.schedule || "No schedule" : rule.event_type || "No event type"} · {ACTION_TYPES.find((item) => item.value === rule.action_type)?.label || rule.action_type}
                </div>
              </div>
              <div className="rule-meta">
                {rule.last_run && <div>Last: {rule.last_run.slice(0, 16)}</div>}
                {rule.next_run && <div>Next: {rule.next_run.slice(0, 16)}</div>}
              </div>
              <Toggle value={!!rule.active} onChange={(value) => toggleRule(rule.id, value)} />
              <Btn variant="danger" size="icon" onClick={() => deleteRule(rule.id)}><Trash2 size={14} /></Btn>
            </div>
          ))}
        </div>
      </Surface>

      {showModal && (
        <Modal title="Create Automation Rule" onClose={() => setShowModal(false)} width={680}>
          <div style={{ display: "grid", gap: 12 }}>
            <Input label="Rule name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} placeholder="Daily campaign send" />
            <Select label="Trigger type" value={form.trigger_type} onChange={(value) => setForm((current) => ({ ...current, trigger_type: value }))} options={TRIGGER_TYPES} />
            {form.trigger_type === "schedule" ? (
              <Input label="Schedule" value={form.schedule} onChange={(value) => setForm((current) => ({ ...current, schedule: value }))} placeholder="Daily at 09:00" />
            ) : (
              <Input label="Event type" value={form.event_type} onChange={(value) => setForm((current) => ({ ...current, event_type: value }))} placeholder="contact_replied" />
            )}
            <Select label="Action" value={form.action_type} onChange={(value) => setForm((current) => ({ ...current, action_type: value }))} options={ACTION_TYPES} />
            <div className="insight-card">
              <div className="muted-small">
                These rules are stored and displayed in the app. Background execution still depends on your deployment calling the automation runtime on a schedule.
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn onClick={() => setShowModal(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={saveRule}><Plus size={14} />Save Rule</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
