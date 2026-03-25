"use client";
import { useState } from "react";
import {
  LayoutDashboard, Users, Database, Zap, FileText,
  Inbox, Activity, BarChart3, Settings, Bell, Plus,
  ChevronDown, Globe
} from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Campaigns from "./pages/Campaigns";
import Templates from "./pages/Templates";
import Automation from "./pages/Automation";
import Analytics from "./pages/Analytics";
import SettingsPage from "./pages/SettingsPage";
import Scraping from "./pages/Scraping";
import { Toast } from "./ui";

const NAV = [
  { section: "Overview" },
  { key: "dashboard",  label: "Dashboard",   icon: LayoutDashboard, badge: null },
  { section: "Contacts" },
  { key: "leads",      label: "Leads",        icon: Users,     badgeKey: "contacts" },
  { section: "Outreach" },
  { key: "campaigns",  label: "Campaigns",    icon: Zap,       badgeKey: "campaigns" },
  { key: "templates",  label: "Templates",    icon: FileText },
  { section: "Automation" },
  { key: "scraping",   label: "Scraping",     icon: Globe },
  { key: "automation", label: "Automation",   icon: Activity },
  { key: "analytics",  label: "Analytics",    icon: BarChart3 },
  { section: "System" },
  { key: "settings",   label: "Settings",     icon: Settings },
];

const TITLES = {
  dashboard:"Dashboard", leads:"Leads", campaigns:"Campaigns",
  templates:"Templates", scraping:"Scraping", automation:"Automation",
  analytics:"Analytics", settings:"Settings",
};

export default function Shell() {
  const [page, setPage] = useState("dashboard");
  const [toast, setToast] = useState(null);

  const notify = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const pages = { dashboard:<Dashboard notify={notify}/>, leads:<Leads notify={notify}/>,
    campaigns:<Campaigns notify={notify}/>, templates:<Templates notify={notify}/>,
    scraping:<Scraping notify={notify}/>, automation:<Automation notify={notify}/>, analytics:<Analytics/>,
    settings:<SettingsPage notify={notify}/> };

  return (
    <div style={{display:"flex",height:"100vh",overflow:"hidden",background:"var(--bg-base)"}}>

      {/* ── Sidebar ── */}
      <aside style={{width:216,minWidth:216,background:"var(--bg-surface)",
        borderRight:"1px solid var(--border)",display:"flex",flexDirection:"column"}}>

        {/* Logo */}
        <div style={{padding:"18px 16px 14px",borderBottom:"1px solid var(--border)",
          display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,#4F8EF7,#A855F7)",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontFamily:"var(--font-display)",fontWeight:800,fontSize:13,color:"white"}}>LF</div>
          <span style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:15,
            color:"var(--text-primary)",letterSpacing:"-0.3px"}}>
            Lead<span style={{color:"var(--accent)"}}>Forge</span>
          </span>
        </div>

        {/* Nav */}
        <div style={{flex:1,overflowY:"auto",padding:"6px 0"}}>
          {NAV.map((item, i) => {
            if (item.section) return (
              <div key={i} style={{padding:"10px 18px 3px",fontSize:9,fontWeight:600,
                letterSpacing:"1.4px",color:"var(--text-muted)",textTransform:"uppercase"}}>
                {item.section}
              </div>
            );
            const Icon = item.icon;
            const active = page === item.key;
            return (
              <div key={item.key} style={{padding:"0 8px"}}>
                <div onClick={() => setPage(item.key)} style={{
                  display:"flex",alignItems:"center",gap:9,padding:"8px 10px",
                  borderRadius:7,cursor:"pointer",transition:"all 0.15s",
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  background: active ? "var(--accent-dim)" : "transparent",
                  fontSize:13,fontWeight:500,position:"relative"
                }}>
                  {active && <div style={{position:"absolute",left:0,top:"20%",height:"60%",
                    width:3,background:"var(--accent)",borderRadius:"0 2px 2px 0"}}/>}
                  <Icon size={14}/>
                  {item.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* User */}
        <div style={{padding:10,borderTop:"1px solid var(--border)"}}>
          <div style={{display:"flex",alignItems:"center",gap:9,padding:8,
            borderRadius:8,background:"var(--bg-elevated)",cursor:"pointer"}}>
            <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,
              background:"linear-gradient(135deg,#4F8EF7,#A855F7)",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:11,fontWeight:700,color:"white"}}>M</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:600,color:"var(--text-primary)"}}>Marne</div>
              <div style={{fontSize:10,color:"var(--accent)"}}>Pro Plan</div>
            </div>
            <ChevronDown size={12} color="var(--text-muted)"/>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

        {/* Topbar */}
        <div style={{height:50,minHeight:50,background:"var(--bg-surface)",
          borderBottom:"1px solid var(--border)",display:"flex",
          alignItems:"center",padding:"0 20px",gap:12}}>
          <span style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:16,color:"var(--text-primary)"}}>
            {TITLES[page]}
          </span>
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
            <button style={{background:"none",border:"1px solid var(--border-light)",borderRadius:7,
              padding:"6px 8px",cursor:"pointer",color:"var(--text-muted)",position:"relative"}}
              onClick={()=>notify("No new notifications")}>
              <Bell size={13}/>
            </button>
            <div style={{width:1,height:20,background:"var(--border)"}}/>
            <button onClick={()=>setPage("leads")} style={{
              display:"inline-flex",alignItems:"center",gap:6,padding:"7px 14px",
              borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",
              background:"var(--accent)",color:"white",border:"none"}}>
              <Plus size={12}/>Add Contact
            </button>
          </div>
        </div>

        {/* Page content */}
        <div style={{flex:1,overflowY:"auto"}}>
          {pages[page]}
        </div>
      </div>

      {toast && <Toast msg={toast} onClose={()=>setToast(null)}/>}
    </div>
  );
}
