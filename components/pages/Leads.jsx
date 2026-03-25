"use client";
import { useState, useEffect, useRef } from "react";
import { Search, Upload, Plus, Send, Trash2, Eye, CheckSquare, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Badge, ScoreBar, Btn, Input, Select, Modal, Spinner, EmptyState } from "../ui";

const TABS = [
  {key:"all",label:"All"},
  {key:"new",label:"New"},
  {key:"ready",label:"Ready"},
  {key:"contacted",label:"Contacted"},
  {key:"replied",label:"Replied"},
  {key:"followup",label:"Follow-ups"},
  {key:"bounced",label:"Bounced"},
  {key:"unsubscribed",label:"Unsubscribed"},
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
  const [showSendModal, setShowSendModal] = useState(null); // contact object
  const [smtpAccounts, setSmtpAccounts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef();

  // Add contact form
  const [addForm, setAddForm] = useState({ email:"", name:"", country:"", region:"", source:"Manual", consent_note:"" });

  // Send email form
  const [sendForm, setSendForm] = useState({ smtpAccountId:"", templateId:"", customSubject:"", customBody:"" });
  const [sending, setSending] = useState(false);

  useEffect(() => { loadContacts(); }, [tab, search, filterType, filterCountry, page]);
  useEffect(() => { loadSmtp(); loadTemplates(); }, []);

  async function loadContacts() {
    setLoading(true);
    const params = new URLSearchParams({ page, limit:50 });
    if (tab !== "all") params.set("status", tab);
    if (filterType !== "all") params.set("type", filterType);
    if (filterCountry !== "all") params.set("country", filterCountry);
    if (search) params.set("search", search);

    const res = await fetch(`/api/contacts?${params}`);
    const data = await res.json();
    setContacts(data.contacts || []);
    setTotal(data.total || 0);
    setPages(data.pages || 1);
    setLoading(false);
  }

  async function loadSmtp() {
    const res = await fetch("/api/smtp");
    const d = await res.json();
    setSmtpAccounts(d.accounts || []);
  }

  async function loadTemplates() {
    const res = await fetch("/api/templates");
    const d = await res.json();
    setTemplates(d.templates || []);
  }

  async function addContact() {
    if (!addForm.email) { notify("Email is required"); return; }
    const res = await fetch("/api/contacts", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify(addForm)
    });
    const data = await res.json();
    if (data.error) { notify("Error: " + data.error); return; }
    notify("Contact added");
    setShowAddModal(false);
    setAddForm({ email:"", name:"", country:"", region:"", source:"Manual", consent_note:"" });
    loadContacts();
  }

  async function importCsv(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/contacts", { method:"POST", body:formData });
    const data = await res.json();
    notify(`Imported ${data.inserted} contacts, ${data.skipped} skipped`);
    setImporting(false);
    loadContacts();
    e.target.value = "";
  }

  async function bulkDelete() {
    if (!selected.length) return;
    if (!confirm(`Delete ${selected.length} contacts?`)) return;
    await fetch("/api/contacts", {
      method:"DELETE", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ ids:selected })
    });
    notify(`Deleted ${selected.length} contacts`);
    setSelected([]);
    loadContacts();
  }

  async function bulkStatus(status) {
    if (!selected.length) return;
    await fetch("/api/contacts", {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ ids:selected, status })
    });
    notify(`Marked ${selected.length} as ${status}`);
    setSelected([]);
    loadContacts();
  }

  async function sendEmail() {
    if (!sendForm.smtpAccountId) { notify("Select an SMTP account"); return; }
    const tpl = templates.find(t => t.id === parseInt(sendForm.templateId));
    const subject = sendForm.customSubject || tpl?.subject || "(no subject)";
    const htmlBody = sendForm.customBody || tpl?.body_html || "";
    if (!htmlBody) { notify("Add a message body or select a template"); return; }

    setSending(true);
    try {
      const res = await fetch("/api/send", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ contactId:showSendModal.id, smtpAccountId:parseInt(sendForm.smtpAccountId), subject, htmlBody })
      });
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (res.ok && data.success) {
        notify(`Email sent to ${showSendModal.email}`);
        setShowSendModal(null);
        loadContacts();
      } else {
        notify("Send failed: " + (data.error || data.message || data.reason || data.code || `HTTP ${res.status}`));
      }
    } catch (e) {
      notify("Send failed: " + (e.message || "network error"));
    } finally {
      setSending(false);
    }
  }

  const toggleSelect = id => setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s,id]);
  const toggleAll = () => setSelected(selected.length===contacts.length ? [] : contacts.map(c=>c.id));

  return (
    <div style={{padding:20}}>
      {/* Tabs */}
      <div style={{display:"flex",gap:2,marginBottom:16}}>
        {TABS.map(t => (
          <div key={t.key} onClick={()=>{setTab(t.key);setPage(1);setSelected([])}}
            style={{padding:"7px 14px",borderRadius:6,fontSize:12,fontWeight:500,cursor:"pointer",
              color:tab===t.key?"var(--accent)":"var(--text-muted)",
              background:tab===t.key?"var(--accent-dim)":"transparent"}}>
            {t.label}
          </div>
        ))}
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <input type="file" accept=".csv" ref={fileRef} onChange={importCsv} style={{display:"none"}}/>
          <Btn onClick={()=>fileRef.current.click()} disabled={importing}>
            {importing ? <Spinner/> : <Upload size={11}/>}
            {importing ? "Importing..." : "Import CSV"}
          </Btn>
          <Btn variant="primary" onClick={()=>setShowAddModal(true)}><Plus size={11}/>Add Contact</Btn>
        </div>
      </div>

      {/* Table */}
      <div style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
        {/* Toolbar */}
        <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,background:"var(--bg-elevated)",
            border:"1px solid var(--border)",borderRadius:7,padding:"6px 11px",flex:1,maxWidth:240}}>
            <Search size={12} color="var(--text-muted)"/>
            <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}
              placeholder="Search email or name..."
              style={{background:"none",border:"none",outline:"none",fontSize:12,
                color:"var(--text-primary)",width:"100%",fontFamily:"var(--font-body)"}}/>
          </div>

          <select value={filterType} onChange={e=>{setFilterType(e.target.value);setPage(1)}}
            style={{background:"var(--bg-elevated)",border:"1px solid var(--border)",
              borderRadius:7,padding:"6px 10px",fontSize:12,color:"var(--text-secondary)",fontFamily:"var(--font-body)"}}>
            <option value="all">All types</option>
            <option value="business">Business</option>
            <option value="personal">Personal</option>
          </select>

          <select value={filterCountry} onChange={e=>{setFilterCountry(e.target.value);setPage(1)}}
            style={{background:"var(--bg-elevated)",border:"1px solid var(--border)",
              borderRadius:7,padding:"6px 10px",fontSize:12,color:"var(--text-secondary)",fontFamily:"var(--font-body)"}}>
            <option value="all">All countries</option>
            {["USA","UK","Germany","France","India","Nigeria","Australia","Canada"].map(c=>(
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <Btn size="icon" onClick={loadContacts} title="Refresh"><RefreshCw size={12}/></Btn>

          {selected.length > 0 && (
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{fontSize:11,color:"var(--accent)"}}>{selected.length} selected</span>
              <Btn size="sm" onClick={()=>bulkStatus("ready")}>Mark Ready</Btn>
              <Btn size="sm" onClick={()=>bulkStatus("dnc")} variant="danger">Mark DNC</Btn>
              <Btn size="sm" variant="danger" onClick={bulkDelete}><Trash2 size={11}/>Delete</Btn>
            </div>
          )}

          <span style={{marginLeft:"auto",fontSize:11,color:"var(--text-muted)"}}>{total} contacts</span>
        </div>

        {/* Table */}
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"var(--bg-elevated)"}}>
                <th style={th}><div style={{cursor:"pointer"}} onClick={toggleAll}><CheckSquare size={13} color={selected.length===contacts.length&&contacts.length>0?"var(--accent)":"var(--text-muted)"}/></div></th>
                <th style={th}>Email</th>
                <th style={th}>Name</th>
                <th style={th}>Type</th>
                <th style={th}>Country</th>
                <th style={th}>Status</th>
                <th style={th}>Score</th>
                <th style={th}>Last Contacted</th>
                <th style={th}>Source</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} style={{padding:40,textAlign:"center"}}><Spinner/></td></tr>
              )}
              {!loading && contacts.length === 0 && (
                <tr><td colSpan={10}>
                  <EmptyState icon={<Search size={32}/>} title="No contacts found"
                    sub="Import a CSV or add contacts manually"
                    action={<Btn variant="primary" onClick={()=>setShowAddModal(true)}><Plus size={11}/>Add Contact</Btn>}/>
                </td></tr>
              )}
              {!loading && contacts.map(c => (
                <tr key={c.id} style={{borderBottom:"1px solid var(--border)"}}>
                  <td style={td}><div style={{cursor:"pointer"}} onClick={()=>toggleSelect(c.id)}><CheckSquare size={13} color={selected.includes(c.id)?"var(--accent)":"var(--text-muted)"}/></div></td>
                  <td style={{...td,fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-primary)",fontWeight:500}}>{c.email}</td>
                  <td style={td}>{c.name||<span style={{color:"var(--text-muted)"}}>—</span>}</td>
                  <td style={td}><Badge status={c.type}/></td>
                  <td style={td}>{c.country||"—"}</td>
                  <td style={td}><Badge status={c.status}/></td>
                  <td style={td}><ScoreBar score={c.score}/></td>
                  <td style={{...td,fontFamily:"var(--font-mono)",fontSize:10}}>{c.last_contacted ? c.last_contacted.slice(0,10) : <span style={{color:"var(--text-muted)"}}>Never</span>}</td>
                  <td style={{...td,fontSize:11}}>{c.source||"—"}</td>
                  <td style={td}>
                    <div style={{display:"flex",gap:4}}>
                      <Btn size="icon" variant="primary" title="Send email now" onClick={()=>{setShowSendModal(c);setSendForm({smtpAccountId:"",templateId:"",customSubject:"",customBody:""})}}>
                        <Send size={11}/>
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{padding:"10px 16px",borderTop:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,color:"var(--text-muted)"}}>Page {page} of {pages} · {total} total</span>
          <div style={{display:"flex",gap:6}}>
            <Btn size="sm" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}><ChevronLeft size={12}/>Prev</Btn>
            <Btn size="sm" onClick={()=>setPage(p=>Math.min(pages,p+1))} disabled={page===pages}>Next<ChevronRight size={12}/></Btn>
          </div>
        </div>
      </div>

      {/* Add Contact Modal */}
      {showAddModal && (
        <Modal title="Add Contact" onClose={()=>setShowAddModal(false)}>
          <div style={{display:"grid",gap:12}}>
            <Input label="Email *" type="email" value={addForm.email} onChange={v=>setAddForm(f=>({...f,email:v}))} placeholder="contact@example.com"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Input label="Full Name" value={addForm.name} onChange={v=>setAddForm(f=>({...f,name:v}))} placeholder="Jane Doe"/>
              <Input label="Country" value={addForm.country} onChange={v=>setAddForm(f=>({...f,country:v}))} placeholder="USA"/>
            </div>
            <Input label="Source" value={addForm.source} onChange={v=>setAddForm(f=>({...f,source:v}))} placeholder="Manual, Referral, Event..."/>
            <Input label="Consent Note" value={addForm.consent_note} onChange={v=>setAddForm(f=>({...f,consent_note:v}))} placeholder="How/why you have permission to contact this person"/>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
              <Btn onClick={()=>setShowAddModal(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={addContact}>Add Contact</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Send Email Modal */}
      {showSendModal && (
        <Modal title={`Send Email → ${showSendModal.email}`} onClose={()=>setShowSendModal(null)}>
          <div style={{display:"grid",gap:12}}>
            {smtpAccounts.length === 0
              ? <div style={{padding:12,background:"var(--amber-dim)",borderRadius:8,fontSize:12,color:"var(--amber)"}}>
                  No SMTP accounts configured. Go to Settings → Add SMTP Account first.
                </div>
              : <Select label="Send From (SMTP Account)"
                  value={sendForm.smtpAccountId}
                  onChange={v=>setSendForm(f=>({...f,smtpAccountId:v}))}
                  options={[{value:"",label:"Select account..."},...smtpAccounts.map(a=>({value:String(a.id),label:`${a.label} (${a.user})`}))]}
                />
            }
            <Select label="Use Template (optional)"
              value={sendForm.templateId}
              onChange={v=>{
                setSendForm(f=>({...f,templateId:v}));
                const tpl = templates.find(t=>t.id===parseInt(v));
                if(tpl) setSendForm(f=>({...f,templateId:v,customSubject:tpl.subject,customBody:tpl.body_html}));
              }}
              options={[{value:"",label:"No template — write custom"},...templates.map(t=>({value:String(t.id),label:t.name}))]}
            />
            <Input label="Subject" value={sendForm.customSubject} onChange={v=>setSendForm(f=>({...f,customSubject:v}))} placeholder="Your subject line — use {{name}}, {{company}}"/>
            <div>
              <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.8px",fontWeight:600}}>Body (HTML or plain)</div>
              <textarea value={sendForm.customBody} onChange={e=>setSendForm(f=>({...f,customBody:e.target.value}))}
                rows={7} placeholder={`Hi {{name}},\n\nYour message here...\n\nBest regards`}
                style={{background:"var(--bg-elevated)",border:"1px solid var(--border)",borderRadius:7,
                  padding:"8px 12px",fontSize:12,color:"var(--text-primary)",outline:"none",
                  width:"100%",fontFamily:"var(--font-mono)",resize:"vertical",lineHeight:1.6}}
                onFocus={e=>e.target.style.borderColor="var(--accent)"}
                onBlur={e=>e.target.style.borderColor="var(--border)"}/>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
              <Btn onClick={()=>setShowSendModal(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={sendEmail} disabled={sending || !sendForm.smtpAccountId}>
                {sending ? <Spinner/> : <Send size={11}/>}
                {sending ? "Sending..." : "Send Now"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

const th = { padding:"9px 14px",textAlign:"left",fontSize:10,fontWeight:600,
  letterSpacing:"0.8px",color:"var(--text-muted)",textTransform:"uppercase",
  borderBottom:"1px solid var(--border)" };
const td = { padding:"10px 14px",fontSize:12,color:"var(--text-secondary)" };
