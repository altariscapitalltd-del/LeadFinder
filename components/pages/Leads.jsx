"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckSquare, ChevronLeft, ChevronRight, Mail, Plus, RefreshCw, Search, Send, Trash2, Upload, Users } from "lucide-react";
import { Badge, Btn, EmptyState, Input, Modal, ScoreBar, Select, Spinner, Surface } from "../ui";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "ready", label: "Ready" },
  { key: "contacted", label: "Contacted" },
  { key: "replied", label: "Replied" },
  { key: "followup", label: "Follow-up" },
  { key: "bounced", label: "Bounced" },
  { key: "unsubscribed", label: "Unsubscribed" },
];

export default function Leads({ notify }) {
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterCountry, setFilterCountry] = useState("all");
  const [selected, setSelected] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(null);
  const [smtpAccounts, setSmtpAccounts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [importing, setImporting] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef(null);

  const [addForm, setAddForm] = useState({ email: "", name: "", country: "", region: "", source: "Manual", consent_note: "" });
  const [sendForm, setSendForm] = useState({ smtpAccountId: "", templateId: "", customSubject: "", customBody: "" });

  useEffect(() => {
    loadContacts();
  }, [tab, search, filterType, filterCountry, page]);

  useEffect(() => {
    loadMeta();
  }, []);

  async function loadMeta() {
    const [smtpRes, templatesRes] = await Promise.all([fetch("/api/smtp"), fetch("/api/templates")]);
    const smtpData = await smtpRes.json();
    const templateData = await templatesRes.json();
    setSmtpAccounts(smtpData.accounts || []);
    setTemplates(templateData.templates || []);
  }

  async function loadContacts() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (tab !== "all") params.set("status", tab);
      if (filterType !== "all") params.set("type", filterType);
      if (filterCountry !== "all") params.set("country", filterCountry);
      if (search) params.set("search", search);

      const res = await fetch(`/api/contacts?${params.toString()}`);
      const data = await res.json();
      setContacts(data.contacts || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } finally {
      setLoading(false);
    }
  }

  async function addContact() {
    if (!addForm.email) {
      notify("Email is required");
      return;
    }

    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    const data = await res.json();
    if (!res.ok) {
      notify(data.error || "Failed to add contact");
      return;
    }

    notify("Contact added");
    setShowAddModal(false);
    setAddForm({ email: "", name: "", country: "", region: "", source: "Manual", consent_note: "" });
    loadContacts();
  }

  async function importCsv(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/contacts", { method: "POST", body: formData });
      const data = await res.json();
      notify(`Imported ${data.inserted || 0} contacts, skipped ${data.skipped || 0}`);
      loadContacts();
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  }

  async function bulkDelete() {
    if (!selected.length) return;
    await fetch("/api/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selected }),
    });
    notify(`Deleted ${selected.length} contacts`);
    setSelected([]);
    loadContacts();
  }

  async function bulkStatus(status) {
    if (!selected.length) return;
    await fetch("/api/contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selected, status }),
    });
    notify(`Marked ${selected.length} as ${status}`);
    setSelected([]);
    loadContacts();
  }

  async function sendEmail() {
    if (!sendForm.smtpAccountId) {
      notify("Select an SMTP account");
      return;
    }
    const selectedTemplate = templates.find((item) => item.id === Number(sendForm.templateId));
    const subject = sendForm.customSubject || selectedTemplate?.subject || "(no subject)";
    const htmlBody = sendForm.customBody || selectedTemplate?.body_html || "";
    if (!htmlBody) {
      notify("Add a message body or select a template");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: showSendModal.id,
          smtpAccountId: Number(sendForm.smtpAccountId),
          subject,
          htmlBody,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify(`Send failed: ${data.error || data.message || `HTTP ${res.status}`}`);
        return;
      }
      notify(`Email sent to ${showSendModal.email}`);
      setShowSendModal(null);
      loadContacts();
    } catch (error) {
      notify(error.message || "Send failed");
    } finally {
      setSending(false);
    }
  }

  const summary = useMemo(() => {
    const ready = contacts.filter((item) => item.status === "ready").length;
    const business = contacts.filter((item) => item.type === "business").length;
    return [
      { label: "Visible contacts", value: contacts.length },
      { label: "Ready to contact", value: ready },
      { label: "Business emails", value: business },
      { label: "Selected", value: selected.length },
    ];
  }, [contacts, selected]);

  const allSelected = contacts.length > 0 && selected.length === contacts.length;

  function toggleSelect(id) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleAll() {
    setSelected(allSelected ? [] : contacts.map((item) => item.id));
  }

  return (
    <div className="page-shell">
      <div className="page-hero">
        <div>
          <div className="eyebrow">Contact Workspace</div>
          <h1 className="page-title">Lead Vault</h1>
          <p className="page-subtitle">
            Manage imports, search your list, send one-off emails, and batch-update lead status without the cramped spreadsheet feel.
          </p>
        </div>
        <div className="responsive-three" style={{ minWidth: "min(100%, 420px)" }}>
          {summary.slice(0, 3).map((item) => (
            <div key={item.label} className="hero-stat">
              <span className="eyebrow">{item.label}</span>
              <strong>{item.value}</strong>
              <span className="muted-small">live from current filters</span>
            </div>
          ))}
        </div>
      </div>

      <Surface>
        <div className="segment-bar compact">
          {STATUS_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className="segment-chip"
              data-active={tab === item.key}
              onClick={() => {
                setTab(item.key);
                setPage(1);
                setSelected([]);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Surface>

      <Surface>
        <div className="section-toolbar">
          <div className="search-pill">
            <Search size={15} />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search email or name" />
          </div>
          <Select
            value={filterType}
            onChange={(value) => { setFilterType(value); setPage(1); }}
            options={[
              { value: "all", label: "All types" },
              { value: "business", label: "Business" },
              { value: "personal", label: "Personal" },
            ]}
            className="toolbar-select"
          />
          <Input value={filterCountry === "all" ? "" : filterCountry} onChange={(value) => { setFilterCountry(value || "all"); setPage(1); }} placeholder="Country filter" className="toolbar-input" />
          <Btn onClick={loadContacts}><RefreshCw size={14} />Refresh</Btn>
          <input ref={fileRef} type="file" accept=".csv" onChange={importCsv} style={{ display: "none" }} />
          <Btn onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? <Spinner /> : <Upload size={14} />}
            {importing ? "Importing" : "Import CSV"}
          </Btn>
          <Btn variant="primary" onClick={() => setShowAddModal(true)}>
            <Plus size={14} />
            Add Contact
          </Btn>
        </div>

        {selected.length > 0 && (
          <div className="bulk-bar">
            <span>{selected.length} selected</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn onClick={() => bulkStatus("ready")}>Mark Ready</Btn>
              <Btn variant="danger" onClick={() => bulkStatus("dnc")}>Mark DNC</Btn>
              <Btn variant="danger" onClick={bulkDelete}><Trash2 size={14} />Delete</Btn>
            </div>
          </div>
        )}

        <div className="desktop-table">
          <div className="table-shell">
            <table className="app-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="plain-icon" onClick={toggleAll}>
                      <CheckSquare size={15} color={allSelected ? "var(--accent)" : "var(--text-muted)"} />
                    </button>
                  </th>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Country</th>
                  <th>Score</th>
                  <th>Source</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: 40 }}>
                      <Spinner />
                    </td>
                  </tr>
                )}
                {!loading && contacts.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState
                        icon={<Users size={30} />}
                        title="No contacts found"
                        sub="Import a CSV or add contacts manually to start building your lead list."
                        action={<Btn variant="primary" onClick={() => setShowAddModal(true)}><Plus size={14} />Add Contact</Btn>}
                      />
                    </td>
                  </tr>
                )}
                {!loading && contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      <button type="button" className="plain-icon" onClick={() => toggleSelect(contact.id)}>
                        <CheckSquare size={15} color={selected.includes(contact.id) ? "var(--accent)" : "var(--text-muted)"} />
                      </button>
                    </td>
                    <td className="mono-cell">{contact.email}</td>
                    <td>{contact.name || "—"}</td>
                    <td><Badge status={contact.type} /></td>
                    <td><Badge status={contact.status} /></td>
                    <td>{contact.country || "—"}</td>
                    <td><ScoreBar score={contact.score} /></td>
                    <td>{contact.source || "—"}</td>
                    <td>
                      <Btn
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setShowSendModal(contact);
                          setSendForm({ smtpAccountId: "", templateId: "", customSubject: "", customBody: "" });
                        }}
                      >
                        <Send size={13} />
                        Send
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mobile-card-list">
          {loading && <div style={{ display: "flex", justifyContent: "center", padding: 30 }}><Spinner /></div>}
          {!loading && contacts.length === 0 && (
            <EmptyState
              icon={<Users size={30} />}
              title="No contacts found"
              sub="Import a CSV or add contacts manually."
              action={<Btn variant="primary" onClick={() => setShowAddModal(true)}><Plus size={14} />Add Contact</Btn>}
            />
          )}
          {!loading && contacts.map((contact) => (
            <div key={contact.id} className="data-card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div>
                  <div className="mono-cell" style={{ fontSize: 12 }}>{contact.email}</div>
                  <div style={{ fontWeight: 700, marginTop: 6 }}>{contact.name || "Unnamed contact"}</div>
                </div>
                <button type="button" className="plain-icon" onClick={() => toggleSelect(contact.id)}>
                  <CheckSquare size={16} color={selected.includes(contact.id) ? "var(--accent)" : "var(--text-muted)"} />
                </button>
              </div>
              <div className="chip-wrap">
                <span className="mini-chip">{contact.country || "No country"}</span>
                <Badge status={contact.type} />
                <Badge status={contact.status} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <ScoreBar score={contact.score} />
                <Btn
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setShowSendModal(contact);
                    setSendForm({ smtpAccountId: "", templateId: "", customSubject: "", customBody: "" });
                  }}
                >
                  <Mail size={13} />
                  Send
                </Btn>
              </div>
            </div>
          ))}
        </div>

        <div className="pager-row">
          <span className="muted-small">Page {page} of {pages} · {total} contacts</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}><ChevronLeft size={14} />Prev</Btn>
            <Btn onClick={() => setPage((current) => Math.min(pages, current + 1))} disabled={page === pages}>Next<ChevronRight size={14} /></Btn>
          </div>
        </div>
      </Surface>

      {showAddModal && (
        <Modal title="Add Contact" onClose={() => setShowAddModal(false)}>
          <div className="form-grid-two">
            <Input label="Email *" type="email" value={addForm.email} onChange={(value) => setAddForm((current) => ({ ...current, email: value }))} placeholder="contact@example.com" />
            <Input label="Full Name" value={addForm.name} onChange={(value) => setAddForm((current) => ({ ...current, name: value }))} placeholder="Jane Doe" />
            <Input label="Country" value={addForm.country} onChange={(value) => setAddForm((current) => ({ ...current, country: value }))} placeholder="United States" />
            <Input label="Region" value={addForm.region} onChange={(value) => setAddForm((current) => ({ ...current, region: value }))} placeholder="North America" />
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <Input label="Source" value={addForm.source} onChange={(value) => setAddForm((current) => ({ ...current, source: value }))} placeholder="Manual, referral, event..." />
            <Input label="Consent Note" value={addForm.consent_note} onChange={(value) => setAddForm((current) => ({ ...current, consent_note: value }))} placeholder="Why this contact can be emailed" />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn onClick={() => setShowAddModal(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={addContact}><Plus size={14} />Add Contact</Btn>
            </div>
          </div>
        </Modal>
      )}

      {showSendModal && (
        <Modal title={`Send Email to ${showSendModal.email}`} onClose={() => setShowSendModal(null)} width={680}>
          <div style={{ display: "grid", gap: 12 }}>
            <Select
              label="SMTP account"
              value={sendForm.smtpAccountId}
              onChange={(value) => setSendForm((current) => ({ ...current, smtpAccountId: value }))}
              options={[{ value: "", label: "Select account..." }, ...smtpAccounts.map((item) => ({ value: String(item.id), label: `${item.label} (${item.user})` }))]}
            />
            <Select
              label="Template"
              value={sendForm.templateId}
              onChange={(value) => {
                const selectedTemplate = templates.find((item) => item.id === Number(value));
                setSendForm((current) => ({
                  ...current,
                  templateId: value,
                  customSubject: selectedTemplate?.subject || current.customSubject,
                  customBody: selectedTemplate?.body_html || current.customBody,
                }));
              }}
              options={[{ value: "", label: "No template — write custom" }, ...templates.map((item) => ({ value: String(item.id), label: item.name }))]}
            />
            <Input label="Subject" value={sendForm.customSubject} onChange={(value) => setSendForm((current) => ({ ...current, customSubject: value }))} placeholder="Quick note for {{name}}" />
            <div>
              <div className="field-label">Body (HTML or plain)</div>
              <textarea
                className="app-textarea"
                rows={8}
                value={sendForm.customBody}
                onChange={(event) => setSendForm((current) => ({ ...current, customBody: event.target.value }))}
                placeholder={"Hi {{name}},\n\nYour message here...\n\nBest regards"}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn onClick={() => setShowSendModal(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={sendEmail} disabled={sending || !sendForm.smtpAccountId}>
                {sending ? <Spinner /> : <Send size={14} />}
                {sending ? "Sending" : "Send Now"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
