"use client";
import { useState, useEffect } from "react";
import { Key, Mail, Shield, Layers, CheckCircle, XCircle, Loader, Trash2, Plus } from "lucide-react";
import { Card, CardTitle, Btn, Input, Select, Toggle, Spinner, Modal } from "../ui";

const PROVIDERS = [
  { value:"anthropic", label:"Anthropic (Claude)", placeholder:"sk-ant-api03-...", modelDefault:"claude-sonnet-4-20250514",
    models:["claude-sonnet-4-20250514","claude-opus-4-5-20251101","claude-haiku-4-5-20251001"] },
  { value:"openai",    label:"OpenAI",             placeholder:"sk-...",             modelDefault:"gpt-4o",
    models:["gpt-4o","gpt-4o-mini","gpt-4-turbo"] },
  { value:"groq",      label:"Groq",               placeholder:"gsk_...",            modelDefault:"llama-3.3-70b-versatile",
    models:["llama-3.3-70b-versatile","mixtral-8x7b-32768","gemma2-9b-it"] },
];

export default function SettingsPage({ notify }) {
  const [smtpAccounts, setSmtpAccounts] = useState([]);
  const [aiProviders, setAiProviders] = useState([]);
  const [showSmtpModal, setShowSmtpModal] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState({});

  // SMTP form state
  const [form, setForm] = useState({ label:"", host:"smtp.gmail.com", port:"587", secure:false, user:"", password:"", from_name:"", daily_limit:"200" });

  // AI form state
  const [aiForm, setAiForm] = useState({ provider:"anthropic", api_key:"", model:"claude-sonnet-4-20250514", make_active:true });

  // Compliance toggles
  const [compliance, setCompliance] = useState({
    unsubscribe_link:true, dnc_enforced:true,
    spam_check:true, consent_tracking:true,
    send_delay_random:true, bounce_handling:true
  });

  useEffect(() => { loadSmtp(); loadAi(); }, []);

  async function loadSmtp() {
    const res = await fetch("/api/smtp");
    const data = await res.json();
    setSmtpAccounts(data.accounts || []);
  }

  async function loadAi() {
    const res = await fetch("/api/ai");
    const data = await res.json();
    setAiProviders(data.providers || []);
  }

  async function saveSmtp() {
    if (!form.host || !form.user || !form.password) { notify("Host, email and password are required"); return; }
    const res = await fetch("/api/smtp", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ ...form, port: parseInt(form.port), daily_limit: parseInt(form.daily_limit) })
    });
    const data = await res.json();
    if (data.error) { notify("Error: " + data.error); return; }
    notify("SMTP account saved");
    setShowSmtpModal(false);
    setForm({ label:"", host:"smtp.gmail.com", port:"587", secure:false, user:"", password:"", from_name:"", daily_limit:"200" });
    loadSmtp();
  }

  async function testSmtp(id) {
    setTestingId(id);
    setTestResult(r => ({ ...r, [id]: null }));
    try {
      const res = await fetch("/api/smtp/test", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      setTestResult(r => ({ ...r, [id]: data }));
    } catch(e) {
      setTestResult(r => ({ ...r, [id]: { success:false, message:e.message } }));
    }
    setTestingId(null);
  }

  async function deleteSmtp(id) {
    await fetch(`/api/smtp?id=${id}`, { method:"DELETE" });
    notify("SMTP account removed");
    loadSmtp();
  }

  async function saveAiKey() {
    if (!aiForm.api_key) { notify("API key is required"); return; }
    const res = await fetch("/api/ai/providers", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify(aiForm)
    });
    const data = await res.json();
    if (data.error) { notify("Error: " + data.error); return; }
    notify(data.message);
    setAiForm(f => ({ ...f, api_key:"" }));
    loadAi();
  }

  async function deleteAiProvider(provider) {
    await fetch(`/api/ai/providers?provider=${provider}`, { method:"DELETE" });
    notify(`${provider} removed`);
    loadAi();
  }

  async function activateProvider(provider) {
    const existing = aiProviders.find(p => p.provider === provider);
    if (!existing) return;
    await fetch("/api/ai/providers", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ provider, api_key:existing.api_key||"(unchanged)", model:existing.model, make_active:true })
    });
    notify(`${provider} is now the active AI provider`);
    loadAi();
  }

  const providerInfo = PROVIDERS.find(p => p.value === aiForm.provider);

  return (
    <div style={{padding:20}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>

        {/* ── SMTP Accounts ─────────────────────────────────────────── */}
        <Card>
          <CardTitle icon={<Mail size={14}/>} color="var(--accent)">
            SMTP Sending Accounts
            <Btn variant="primary" size="sm" onClick={()=>setShowSmtpModal(true)} className="ml-auto">
              <Plus size={11}/>Add Account
            </Btn>
          </CardTitle>

          {smtpAccounts.length === 0 && (
            <div style={{textAlign:"center",padding:"24px 0",color:"var(--text-muted)",fontSize:12}}>
              No SMTP accounts yet. Add your Gmail, Outlook, or custom SMTP.
            </div>
          )}

          {smtpAccounts.map(acc => (
            <div key={acc.id} style={{padding:"12px 0",borderBottom:"1px solid var(--border)"}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontWeight:600,fontSize:13,color:"var(--text-primary)"}}>{acc.label}</div>
                  <div style={{fontSize:11,color:"var(--text-muted)",fontFamily:"var(--font-mono)",marginTop:2}}>
                    {acc.user} · {acc.host}:{acc.port}
                  </div>
                  <div style={{fontSize:10,color:"var(--text-muted)",marginTop:3}}>
                    Daily cap: <span style={{color:"var(--text-secondary)"}}>{acc.daily_limit}</span>
                    {" "}· Sent today: <span style={{color:"var(--accent)"}}>{acc.sent_today}</span>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  {testResult[acc.id] && (
                    testResult[acc.id].success
                      ? <span style={{fontSize:10,color:"var(--green)",display:"flex",alignItems:"center",gap:3}}><CheckCircle size={11}/>OK</span>
                      : <span style={{fontSize:10,color:"var(--red)",display:"flex",alignItems:"center",gap:3}} title={testResult[acc.id].message}><XCircle size={11}/>Failed</span>
                  )}
                  <Btn size="sm" onClick={()=>testSmtp(acc.id)} disabled={testingId===acc.id}>
                    {testingId===acc.id ? <Spinner/> : "Test"}
                  </Btn>
                  <Btn variant="danger" size="icon" onClick={()=>deleteSmtp(acc.id)}><Trash2 size={11}/></Btn>
                </div>
              </div>
            </div>
          ))}
        </Card>

        {/* ── AI Provider Keys ───────────────────────────────────────── */}
        <Card>
          <CardTitle icon={<Key size={14}/>} color="var(--violet)">AI Provider Keys</CardTitle>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            {PROVIDERS.map(p => (
              <Btn key={p.value} variant={aiForm.provider===p.value?"violet":"ghost"} size="sm"
                onClick={()=>setAiForm(f=>({...f,provider:p.value,model:p.modelDefault}))}>
                {p.label}
              </Btn>
            ))}
          </div>

          <Input label="API Key" type="password" value={aiForm.api_key}
            onChange={v=>setAiForm(f=>({...f,api_key:v}))}
            placeholder={providerInfo?.placeholder || "Enter API key..."} className="mb-3"/>

          <Select label="Model" value={aiForm.model}
            onChange={v=>setAiForm(f=>({...f,model:v}))}
            options={providerInfo?.models.map(m=>({value:m,label:m}))||[]}
            className="mb-3"/>

          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <Toggle value={aiForm.make_active} onChange={v=>setAiForm(f=>({...f,make_active:v}))}/>
            <span style={{fontSize:12,color:"var(--text-secondary)"}}>Set as active provider</span>
          </div>

          <Btn variant="primary" size="md" onClick={saveAiKey}>Save API Key</Btn>

          {aiProviders.length > 0 && (
            <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid var(--border)"}}>
              <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.8px",fontWeight:600}}>Saved Providers</div>
              {aiProviders.map(p => (
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px solid var(--border)"}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:p.active?"var(--green)":"var(--border-light)"}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:500,color:"var(--text-primary)"}}>{p.provider}</div>
                    <div style={{fontSize:10,color:"var(--text-muted)",fontFamily:"var(--font-mono)"}}>{p.model}</div>
                  </div>
                  {p.active
                    ? <span style={{fontSize:10,color:"var(--green)",background:"var(--green-dim)",padding:"1px 7px",borderRadius:10}}>Active</span>
                    : <Btn size="sm" onClick={()=>activateProvider(p.provider)}>Activate</Btn>
                  }
                  <Btn variant="danger" size="icon" onClick={()=>deleteAiProvider(p.provider)}><Trash2 size={11}/></Btn>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Compliance ────────────────────────────────────────────── */}
        <Card>
          <CardTitle icon={<Shield size={14}/>} color="var(--green)">Compliance & Safety</CardTitle>
          {[
            { key:"unsubscribe_link",  label:"Unsubscribe link in every email",   desc:"Appended automatically to all outgoing emails" },
            { key:"dnc_enforced",      label:"Do Not Contact list enforced",       desc:"Blocks sending to any address on the DNC list" },
            { key:"spam_check",        label:"Spam score check before send",       desc:"Warns when email content may trigger spam filters" },
            { key:"consent_tracking",  label:"Consent source tracking",            desc:"Records how and when each contact was acquired" },
            { key:"send_delay_random", label:"Randomize send delay",               desc:"Spaces sends randomly between min/max delay settings" },
            { key:"bounce_handling",   label:"Auto-handle bounces",                desc:"Marks bounced contacts, removes from active campaigns" },
          ].map(s => (
            <div key={s.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"12px 0",borderBottom:"1px solid var(--border)"}}>
              <div>
                <div style={{fontSize:12,fontWeight:500,color:"var(--text-primary)"}}>{s.label}</div>
                <div style={{fontSize:10,color:"var(--text-muted)",marginTop:2}}>{s.desc}</div>
              </div>
              <Toggle value={compliance[s.key]} onChange={v=>{
                setCompliance(c=>({...c,[s.key]:v}));
                notify(`${s.label}: ${v?"enabled":"disabled"}`);
              }}/>
            </div>
          ))}
        </Card>

        {/* ── Quick Help ────────────────────────────────────────────── */}
        <Card>
          <CardTitle icon={<Layers size={14}/>} color="var(--cyan)">Quick Setup Guide</CardTitle>
          {[
            ["1","Add an SMTP account","Use Gmail App Password (not your real password). Go to Google Account → Security → App Passwords → Generate."],
            ["2","Add an AI API key","Get your Claude key from console.anthropic.com, OpenAI from platform.openai.com, or Groq from console.groq.com."],
            ["3","Import contacts","Go to Leads → Import CSV. CSV must have an 'email' column. Name, country, region are optional."],
            ["4","Create a template","Go to Templates → New Template. Use the AI generator or write your own. Use {{name}}, {{company}} variables."],
            ["5","Launch a campaign","Go to Campaigns → New Campaign. Pick a template + SMTP account, set daily limit, and click Start."],
          ].map(([n,title,desc]) => (
            <div key={n} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:"1px solid var(--border)"}}>
              <div style={{width:22,height:22,borderRadius:"50%",background:"var(--accent-dim)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:11,fontWeight:700,color:"var(--accent)",flexShrink:0}}>{n}</div>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:"var(--text-primary)"}}>{title}</div>
                <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2,lineHeight:1.5}}>{desc}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* ── SMTP Modal ─────────────────────────────────────────────── */}
      {showSmtpModal && (
        <Modal title="Add SMTP Account" onClose={()=>setShowSmtpModal(false)}>
          <div style={{display:"grid",gap:12}}>
            <Input label="Label (e.g. Gmail Work)" value={form.label} onChange={v=>setForm(f=>({...f,label:v}))} placeholder="My Gmail Account"/>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10}}>
              <Input label="SMTP Host" value={form.host} onChange={v=>setForm(f=>({...f,host:v}))} placeholder="smtp.gmail.com"/>
              <Input label="Port" value={form.port} onChange={v=>setForm(f=>({...f,port:v}))} placeholder="587"/>
            </div>
            <Input label="Email / Username" type="email" value={form.user} onChange={v=>setForm(f=>({...f,user:v}))} placeholder="you@gmail.com"/>
            <Input label="App Password" type="password" value={form.password} onChange={v=>setForm(f=>({...f,password:v}))} placeholder="xxxx xxxx xxxx xxxx"/>
            <Input label="From Name (optional)" value={form.from_name} onChange={v=>setForm(f=>({...f,from_name:v}))} placeholder="John from Acme"/>
            <Input label="Daily Sending Limit" value={form.daily_limit} onChange={v=>setForm(f=>({...f,daily_limit:v}))} placeholder="200"/>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <Toggle value={form.secure} onChange={v=>setForm(f=>({...f,secure:v}))}/>
              <span style={{fontSize:12,color:"var(--text-secondary)"}}>Use SSL (port 465)</span>
            </div>
            <div style={{background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:8,padding:12,fontSize:11,color:"#b45309",lineHeight:1.6}}>
              <strong>Gmail users:</strong> You must use an App Password, not your real Gmail password.
              Enable 2FA → Google Account → Security → App Passwords → Mail → Generate.
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
              <Btn onClick={()=>setShowSmtpModal(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={saveSmtp}>Save Account</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
