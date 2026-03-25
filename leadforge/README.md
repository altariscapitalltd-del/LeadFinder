# LeadForge AI — Setup Guide

A real, production-ready email outreach platform. Runs locally or on any Node.js host.

---

## Quick Start (5 minutes)

### 1. Install dependencies

```bash
cd leadforge
npm install
```

### 2. Create your environment file

```bash
cp .env.example .env.local
```

You don't *need* to put anything in `.env.local` right now —
API keys and SMTP passwords are saved inside the app via the Settings page
and stored in your local SQLite database (`leadforge.db`).

Optionally pre-fill your Anthropic key:
```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### 3. Run the app

```bash
npm run dev
```

Open **http://localhost:3000**

The SQLite database (`leadforge.db`) is created automatically on first run.

---

## First-time Setup (inside the app)

### Step 1 — Add SMTP Account (Settings page)

Go to **Settings → Add SMTP Account**

| Field | Example |
|-------|---------|
| SMTP Host | `smtp.gmail.com` |
| Port | `587` |
| Email | `you@gmail.com` |
| Password | Your **App Password** (NOT your real Gmail password) |
| Daily Limit | `200` |

**Gmail App Password:**
1. Enable 2-Factor Authentication on your Google Account
2. Go to: Google Account → Security → 2-Step Verification → App Passwords
3. Select "Mail" → Generate → Copy the 16-character password
4. Use that password in LeadForge

**Outlook/Office 365:**
- Host: `smtp.office365.com`, Port: `587`
- Use your normal email + password

**Custom SMTP (e.g. Mailgun, SendGrid, Brevo):**
- Use the SMTP credentials from your provider dashboard

Click **Test Connection** to verify before saving.

---

### Step 2 — Add AI API Key (Settings page)

Go to **Settings → AI Provider Keys**

| Provider | Where to get key |
|----------|-----------------|
| Anthropic (Claude) | https://console.anthropic.com |
| OpenAI | https://platform.openai.com/api-keys |
| Groq (free) | https://console.groq.com |

Select your provider, paste the key, check **"Set as active provider"**, click **Save API Key**.

---

### Step 3 — Import Contacts (Leads page)

Go to **Leads → Import CSV**

Your CSV must have at minimum:
```
email
john@example.com
jane@company.io
```

Optional columns: `name`, `country`, `region`

The app will:
- Validate email syntax
- Classify as personal or business automatically
- Skip duplicates
- Skip anyone already on your DNC list

---

### Step 4 — Create an Email Template (Templates page)

Go to **Templates → New Template**

Use the **AI Generator** — type your goal and click Generate. The AI will write:
- Subject line
- HTML body
- Variables like `{{name}}`, `{{company}}`

Or write your own HTML. Available variables:
- `{{name}}` — contact name
- `{{email}}` — contact email
- `{{country}}` — contact country
- `{{company}}` — name or company

---

### Step 5 — Launch a Campaign (Campaigns page)

Go to **Campaigns → New Campaign**

1. Give it a name
2. Pick your template
3. Pick your SMTP account
4. Set daily limit (start low — 50–100/day recommended)
5. Click **Create Campaign**
6. Click **Send Batch** to send immediately

Each batch sends up to 20 emails with a randomized delay between each send (default 30–90 seconds). This makes sends look natural and avoids spam triggers.

---

## Sending One Email (Leads page)

In the Leads table, click the **Send** button on any contact row.
Choose your SMTP account, pick a template or write custom subject/body, click **Send Now**.

---

## Compliance Features (always on)

- **Unsubscribe link** — automatically appended to every email
- **DNC list** — anyone who unsubscribes is blocked from all future sends
- **Bounce handling** — bounced addresses are marked and excluded
- **Consent note** — you can record how you obtained each contact's permission
- **Daily caps** — per-account daily send limits you control

---

## Deploying to Production

### Vercel (recommended)

```bash
npm install -g vercel
vercel --prod
```

Note: Vercel's serverless environment doesn't support SQLite. For Vercel, switch the DB layer to **Neon** (serverless Postgres) or **PlanetScale**.

### VPS / Ubuntu server

```bash
npm run build
npm start
# Or use PM2:
pm2 start npm --name leadforge -- start
```

SQLite works perfectly on a VPS. Your `leadforge.db` file persists on disk.

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## File Structure

```
leadforge/
├── app/
│   ├── api/
│   │   ├── smtp/          # SMTP account management
│   │   ├── contacts/      # Contact CRUD + CSV import
│   │   ├── campaigns/     # Campaign management + batch send
│   │   ├── templates/     # Email template CRUD
│   │   ├── send/          # Single email send
│   │   ├── ai/            # AI generation endpoints
│   │   ├── automations/   # Automation rules
│   │   ├── analytics/     # Stats from DB
│   │   └── unsubscribe/   # Unsubscribe handler (linked from emails)
│   ├── page.js
│   └── layout.js
├── components/
│   ├── Shell.jsx          # App layout + navigation
│   ├── ui.jsx             # Shared UI components
│   └── pages/
│       ├── Dashboard.jsx
│       ├── Leads.jsx
│       ├── Campaigns.jsx
│       ├── Templates.jsx
│       ├── Automation.jsx
│       ├── Analytics.jsx
│       └── SettingsPage.jsx
├── lib/
│   ├── db.js              # SQLite setup + schema
│   ├── mailer.js          # Nodemailer + send logic
│   └── ai.js              # Multi-provider AI client
├── leadforge.db           # Auto-created SQLite database
└── .env.local             # Your secrets (never commit this)
```

---

## Troubleshooting

**"Cannot find module better-sqlite3"**
```bash
npm install better-sqlite3
# If on Windows and build fails:
npm install --global windows-build-tools
```

**Gmail: "Username and Password not accepted"**
- You must use an App Password, not your Gmail password
- Make sure 2FA is enabled on your Google account

**Emails going to spam**
- Start with low daily limits (50/day)
- Warm up your sending address gradually
- Make sure your domain has SPF/DKIM records set up
- Avoid spam trigger words in subject lines

**"No AI provider configured"**
- Go to Settings → add at least one AI API key and mark it as active
