"use client";
// components/ui.jsx — shared design system components

export function Badge({ status }) {
  const map = {
    new:          "bg-blue-500/15 text-blue-400",
    ready:        "bg-cyan-500/15 text-cyan-400",
    contacted:    "bg-violet-500/15 text-violet-400",
    replied:      "bg-green-500/15 text-green-400",
    followup:     "bg-amber-500/15 text-amber-400",
    bounced:      "bg-red-500/15 text-red-400",
    unsubscribed: "bg-slate-500/20 text-slate-500",
    dnc:          "bg-red-900/30 text-red-600",
    business:     "bg-cyan-500/15 text-cyan-400",
    personal:     "bg-violet-500/15 text-violet-400",
    unknown:      "bg-slate-500/15 text-slate-400",
    active:       "bg-green-500/15 text-green-400",
    paused:       "bg-amber-500/15 text-amber-400",
    draft:        "bg-slate-500/15 text-slate-400",
    scheduled:    "bg-blue-500/15 text-blue-400",
    completed:    "bg-green-500/15 text-green-400",
    stopped:      "bg-red-500/15 text-red-400",
    queued:       "bg-slate-500/15 text-slate-400",
    running:      "bg-cyan-500/15 text-cyan-400",
    failed:       "bg-red-500/15 text-red-400",
    cancelled:    "bg-amber-500/15 text-amber-400",
  };
  const dots = {
    new:"#4F8EF7", ready:"#06B6D4", contacted:"#A855F7", replied:"#22C55E",
    followup:"#F59E0B", bounced:"#EF4444", unsubscribed:"#64748b",
    dnc:"#dc2626", business:"#06B6D4", personal:"#A855F7", unknown:"#64748b",
    active:"#22C55E", paused:"#F59E0B", draft:"#64748b", scheduled:"#4F8EF7",
    completed:"#22C55E", stopped:"#EF4444", queued:"#64748b", running:"#06B6D4",
    failed:"#EF4444", cancelled:"#F59E0B",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${map[status] || "bg-slate-500/15 text-slate-400"}`}
      style={{fontFamily:"var(--font-mono)"}}>
      <span style={{width:5,height:5,borderRadius:"50%",background:dots[status]||"#64748b",display:"inline-block",flexShrink:0}}/>
      {status?.toUpperCase()}
    </span>
  );
}

export function ScoreBar({ score }) {
  const color = score >= 80 ? "#22C55E" : score >= 60 ? "#F59E0B" : "#EF4444";
  return (
    <div className="flex items-center gap-2">
      <div style={{width:48,height:4,background:"var(--border)",borderRadius:2,overflow:"hidden"}}>
        <div style={{width:`${score}%`,height:"100%",background:color,borderRadius:2}}/>
      </div>
      <span style={{fontSize:11,fontFamily:"var(--font-mono)",color}}>{score}</span>
    </div>
  );
}

export function Btn({ children, onClick, variant="ghost", size="sm", disabled, className="" }) {
  const base = "inline-flex items-center gap-1.5 rounded-lg font-semibold cursor-pointer transition-all duration-150 border-0 font-[Inter] disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = { sm:"px-3 py-1.5 text-[11px]", md:"px-4 py-2 text-[12px]", lg:"px-5 py-2.5 text-[13px]", icon:"p-1.5 text-[11px]" };
  const variants = {
    primary: "bg-blue-500 text-white hover:bg-blue-400",
    ghost:   "bg-transparent text-[var(--text-secondary)] border border-[var(--border-light)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
    danger:  "bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25",
    success: "bg-green-500/15 text-green-400 border border-green-500/20 hover:bg-green-500/25",
    violet:  "bg-violet-500/15 text-violet-400 border border-violet-500/20 hover:bg-violet-500/25",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Input({ label, value, onChange, placeholder, type="text", className="", required }) {
  return (
    <div className={className}>
      {label && <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.8px",fontWeight:600}}>{label}</div>}
      <input
        type={type} value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder} required={required}
        style={{
          background:"var(--bg-elevated)",border:"1px solid var(--border)",
          borderRadius:7,padding:"8px 12px",fontSize:12,
          color:"var(--text-primary)",outline:"none",width:"100%",
          fontFamily:"var(--font-body)",transition:"border-color 0.15s"
        }}
        onFocus={e=>e.target.style.borderColor="var(--accent)"}
        onBlur={e=>e.target.style.borderColor="var(--border)"}
      />
    </div>
  );
}

export function DatalistInput({ label, value, onChange, options, placeholder, listId, className="" }) {
  const id = listId || `list-${label || "options"}`.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={className}>
      {label && <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.8px",fontWeight:600}}>{label}</div>}
      <input
        list={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background:"var(--bg-elevated)",border:"1px solid var(--border)",
          borderRadius:7,padding:"8px 12px",fontSize:12,
          color:"var(--text-primary)",outline:"none",width:"100%",
          fontFamily:"var(--font-body)",transition:"border-color 0.15s"
        }}
      />
      <datalist id={id}>
        {options.map((option) => <option key={option} value={option} />)}
      </datalist>
    </div>
  );
}

export function Select({ label, value, onChange, options, className="" }) {
  return (
    <div className={className}>
      {label && <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.8px",fontWeight:600}}>{label}</div>}
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{
          background:"var(--bg-elevated)",border:"1px solid var(--border)",
          borderRadius:7,padding:"8px 12px",fontSize:12,
          color:"var(--text-primary)",outline:"none",width:"100%",
          fontFamily:"var(--font-body)",cursor:"pointer"
        }}>
        {options.map(o => <option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
      </select>
    </div>
  );
}

export function Toggle({ value, onChange }) {
  return (
    <div onClick={()=>onChange(!value)} style={{
      width:34,height:18,borderRadius:10,cursor:"pointer",position:"relative",
      background:value?"var(--accent)":"var(--border-light)",
      transition:"background 0.2s",flexShrink:0
    }}>
      <div style={{
        position:"absolute",top:2,width:14,height:14,background:"white",
        borderRadius:"50%",transition:"left 0.2s",
        left:value?18:2
      }}/>
    </div>
  );
}

export function Card({ children, className="" }) {
  return (
    <div style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:12,padding:18}}
      className={className}>
      {children}
    </div>
  );
}

export function CardTitle({ children, icon, color="var(--accent)" }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,
      fontFamily:"var(--font-display)",fontWeight:600,fontSize:14,color:"var(--text-primary)"}}>
      {icon && <span style={{color}}>{icon}</span>}
      {children}
    </div>
  );
}

export function Spinner() {
  return <div className="animate-spin" style={{width:14,height:14,border:"2px solid var(--border-light)",borderTopColor:"var(--accent)",borderRadius:"50%"}}/>
}

export function Toast({ msg, onClose }) {
  return (
    <div className="animate-slide" style={{
      position:"fixed",top:20,right:20,zIndex:1000,
      background:"var(--bg-elevated)",border:"1px solid var(--border-light)",
      borderRadius:10,padding:"11px 16px",display:"flex",alignItems:"center",
      gap:10,fontSize:13,color:"var(--text-primary)",
      boxShadow:"0 8px 32px rgba(0,0,0,0.4)"
    }}>
      <span style={{width:6,height:6,background:"var(--green)",borderRadius:"50%"}}/>
      {msg}
      <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-muted)",marginLeft:8,padding:0}}>✕</button>
    </div>
  );
}

export function Modal({ title, children, onClose, width=480 }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",
      alignItems:"center",justifyContent:"center",zIndex:500,backdropFilter:"blur(4px)"}}>
      <div className="animate-fade" style={{background:"var(--bg-card)",border:"1px solid var(--border-light)",
        borderRadius:16,padding:24,width,maxWidth:"92vw",maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:17,color:"var(--text-primary)"}}>{title}</div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-muted)",padding:4}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, sub, action }) {
  return (
    <div style={{textAlign:"center",padding:"48px 24px",color:"var(--text-muted)"}}>
      <div style={{opacity:0.3,marginBottom:14,display:"flex",justifyContent:"center"}}>{icon}</div>
      <div style={{fontSize:14,fontWeight:600,color:"var(--text-secondary)",marginBottom:6}}>{title}</div>
      {sub && <div style={{fontSize:12,marginBottom:16}}>{sub}</div>}
      {action}
    </div>
  );
}
