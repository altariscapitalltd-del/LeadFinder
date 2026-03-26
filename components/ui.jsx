"use client";

export function Badge({ status }) {
  const map = {
    new: "bg-blue-500/15 text-blue-300",
    ready: "bg-cyan-500/15 text-cyan-300",
    contacted: "bg-violet-500/15 text-violet-300",
    replied: "bg-emerald-500/15 text-emerald-300",
    followup: "bg-amber-500/15 text-amber-300",
    bounced: "bg-rose-500/15 text-rose-300",
    unsubscribed: "bg-slate-500/15 text-slate-300",
    dnc: "bg-rose-500/15 text-rose-300",
    business: "bg-cyan-500/15 text-cyan-300",
    personal: "bg-violet-500/15 text-violet-300",
    unknown: "bg-slate-500/15 text-slate-300",
    active: "bg-emerald-500/15 text-emerald-300",
    paused: "bg-amber-500/15 text-amber-300",
    draft: "bg-slate-500/15 text-slate-300",
    scheduled: "bg-blue-500/15 text-blue-300",
    completed: "bg-emerald-500/15 text-emerald-300",
    stopped: "bg-rose-500/15 text-rose-300",
    queued: "bg-slate-500/15 text-slate-300",
    running: "bg-cyan-500/15 text-cyan-300",
    failed: "bg-rose-500/15 text-rose-300",
    cancelled: "bg-amber-500/15 text-amber-300",
  };
  const dots = {
    new: "#60a5fa",
    ready: "#22d3ee",
    contacted: "#a78bfa",
    replied: "#4ade80",
    followup: "#fbbf24",
    bounced: "#fb7185",
    unsubscribed: "#94a3b8",
    dnc: "#fb7185",
    business: "#22d3ee",
    personal: "#a78bfa",
    unknown: "#94a3b8",
    active: "#4ade80",
    paused: "#fbbf24",
    draft: "#94a3b8",
    scheduled: "#60a5fa",
    completed: "#4ade80",
    stopped: "#fb7185",
    queued: "#94a3b8",
    running: "#22d3ee",
    failed: "#fb7185",
    cancelled: "#fbbf24",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] ${map[status] || "bg-slate-500/15 text-slate-300"}`}
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: dots[status] || "#94a3b8",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {String(status || "unknown").toUpperCase()}
    </span>
  );
}

export function ScoreBar({ score }) {
  const numeric = Number(score || 0);
  const color = numeric >= 80 ? "#4ade80" : numeric >= 60 ? "#fbbf24" : "#fb7185";

  return (
    <div className="flex items-center gap-2">
      <div
        style={{
          width: 64,
          height: 6,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${Math.max(0, Math.min(100, numeric))}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color }}>{numeric}</span>
    </div>
  );
}

export function Btn({ children, onClick, variant = "ghost", size = "sm", disabled, className = "", type = "button" }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[18px] border font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = {
    sm: "px-3.5 py-2 text-[11px]",
    md: "px-4.5 py-2.5 text-[12px]",
    lg: "px-5 py-3 text-[13px]",
    icon: "p-2.5 text-[11px]",
  };
  const variants = {
    primary: "border-transparent text-[#071019] shadow-[0_14px_34px_rgba(154,230,255,0.22)] hover:translate-y-[-1px]",
    ghost: "border-[var(--border-light)] bg-[rgba(255,255,255,0.02)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
    danger: "border-rose-500/20 bg-rose-500/10 text-rose-200 hover:bg-rose-500/16",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/16",
    violet: "border-violet-400/20 bg-violet-500/12 text-violet-200 hover:bg-violet-500/18",
  };

  return (
    <button
      type={type}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      onClick={onClick}
      disabled={disabled}
      style={variant === "primary" ? { background: "linear-gradient(135deg, #f8fafc 0%, #9ae6ff 58%, #67e8f9 100%)" } : undefined}
    >
      {children}
    </button>
  );
}

function fieldLabel(label) {
  if (!label) return null;
  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--text-muted)",
        marginBottom: 6,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  );
}

const baseFieldStyle = {
  width: "100%",
  borderRadius: 18,
  border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.03)",
  color: "var(--text-primary)",
  padding: "13px 15px",
  fontSize: 13,
  outline: "none",
  fontFamily: "var(--font-body)",
  transition: "border-color 0.15s ease, background 0.15s ease",
};

export function Input({ label, value, onChange, placeholder, type = "text", className = "", required }) {
  return (
    <div className={className}>
      {fieldLabel(label)}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        style={baseFieldStyle}
        onFocus={(event) => {
          event.target.style.borderColor = "rgba(154,230,255,0.55)";
          event.target.style.background = "rgba(255,255,255,0.05)";
        }}
        onBlur={(event) => {
          event.target.style.borderColor = "var(--border)";
          event.target.style.background = "rgba(255,255,255,0.03)";
        }}
      />
    </div>
  );
}

export function DatalistInput({ label, value, onChange, options, placeholder, listId, className = "" }) {
  const id = listId || `list-${label || "options"}`.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={className}>
      {fieldLabel(label)}
      <input
        list={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={baseFieldStyle}
      />
      <datalist id={id}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}

export function Select({ label, value, onChange, options, className = "" }) {
  return (
    <div className={className}>
      {fieldLabel(label)}
      <select value={value} onChange={(event) => onChange(event.target.value)} style={{ ...baseFieldStyle, cursor: "pointer" }}>
        {options.map((option) => (
          <option key={option.value || option} value={option.value || option}>
            {option.label || option}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      style={{
        width: 42,
        height: 24,
        borderRadius: 999,
        border: "1px solid transparent",
        cursor: "pointer",
        position: "relative",
        background: value ? "linear-gradient(135deg, rgba(154,230,255,0.95), rgba(103,232,249,0.8))" : "rgba(255,255,255,0.12)",
        transition: "background 0.2s ease",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: value ? 20 : 2,
          width: 18,
          height: 18,
          background: value ? "#071019" : "#ffffff",
          borderRadius: "50%",
          transition: "left 0.2s ease",
        }}
      />
    </button>
  );
}

export function Card({ children, className = "" }) {
  return (
    <div
      className={className}
      style={{
        background: "linear-gradient(180deg, rgba(20,20,20,0.98), rgba(12,12,12,0.95))",
        border: "1px solid var(--border)",
        borderRadius: 24,
        padding: 20,
        boxShadow: "0 18px 44px rgba(0,0,0,0.22)",
      }}
    >
      {children}
    </div>
  );
}

export function Surface({ children, className = "" }) {
  return (
    <div
      className={className}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid var(--border)",
        borderRadius: 20,
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, icon, color = "var(--accent)" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 16,
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: 15,
        color: "var(--text-primary)",
      }}
    >
      {icon && <span style={{ color, display: "inline-flex" }}>{icon}</span>}
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <div
      className="animate-spin"
      style={{
        width: 16,
        height: 16,
        border: "2px solid rgba(255,255,255,0.14)",
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
      }}
    />
  );
}

export function Toast({ msg, onClose }) {
  return (
    <div
      className="animate-slide"
      style={{
        position: "fixed",
        top: 18,
        right: 18,
        zIndex: 1000,
        maxWidth: 360,
        background: "rgba(11,11,11,0.96)",
        border: "1px solid var(--border-light)",
        borderRadius: 18,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
        color: "var(--text-primary)",
        boxShadow: "0 18px 44px rgba(0,0,0,0.32)",
      }}
    >
      <span style={{ width: 8, height: 8, background: "var(--green)", borderRadius: "50%", flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{msg}</span>
      <button
        type="button"
        onClick={onClose}
        style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}
      >
        x
      </button>
    </div>
  );
}

export function Modal({ title, children, onClose, width = 480 }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 500,
        backdropFilter: "blur(6px)",
        padding: 16,
      }}
    >
      <div
        className="animate-fade"
        style={{
          background: "linear-gradient(180deg, rgba(20,20,20,0.98), rgba(10,10,10,0.97))",
          border: "1px solid var(--border-light)",
          borderRadius: 28,
          padding: 24,
          width,
          maxWidth: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 32px 120px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--text-primary)" }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}
          >
            x
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, sub, action }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-muted)" }}>
      <div style={{ opacity: 0.36, marginBottom: 14, display: "flex", justifyContent: "center" }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>{title}</div>
      {sub && <div style={{ fontSize: 12, marginBottom: 16, lineHeight: 1.6 }}>{sub}</div>}
      {action}
    </div>
  );
}
