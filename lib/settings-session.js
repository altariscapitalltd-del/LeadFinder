const COOKIE_NAME = "leadforge_app_settings";

const BOOLEAN_KEYS = [
  "unsubscribe_link",
  "dnc_enforced",
  "spam_check",
  "consent_tracking",
  "send_delay_random",
  "bounce_handling",
];

const DEFAULT_SETTINGS = {
  unsubscribe_link: true,
  dnc_enforced: true,
  spam_check: true,
  consent_tracking: true,
  send_delay_random: true,
  bounce_handling: false,
};

export function getSettingsCookieName() {
  return COOKIE_NAME;
}

export function getBooleanSettingKeys() {
  return new Set(BOOLEAN_KEYS);
}

export function parseSettingsSession(rawValue) {
  if (!rawValue) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(Buffer.from(String(rawValue), "base64url").toString("utf8"));
    return {
      ...DEFAULT_SETTINGS,
      ...Object.fromEntries(
        Object.entries(parsed || {})
          .filter(([key]) => BOOLEAN_KEYS.includes(key))
          .map(([key, value]) => [key, Boolean(value)])
      ),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function serializeSettingsSession(settings) {
  const normalized = Object.fromEntries(
    BOOLEAN_KEYS.map((key) => [key, Boolean(settings?.[key])])
  );
  return Buffer.from(JSON.stringify(normalized), "utf8").toString("base64url");
}

