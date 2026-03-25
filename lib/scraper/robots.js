import robotsParser from "robots-parser";

const robotsCache = new Map();

async function loadRobots(origin, fetchFn) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  const robotsUrl = `${origin}/robots.txt`;
  try {
    const res = await fetchFn(robotsUrl);
    if (!res.ok) {
      robotsCache.set(origin, null);
      return null;
    }
    const text = await res.text();
    const parsed = robotsParser(robotsUrl, text);
    robotsCache.set(origin, parsed);
    return parsed;
  } catch {
    robotsCache.set(origin, null);
    return null;
  }
}

export async function isAllowedByRobots(url, userAgent, fetchFn) {
  try {
    const u = new URL(url);
    const parser = await loadRobots(u.origin, fetchFn);
    if (!parser) return true;
    return parser.isAllowed(url, userAgent);
  } catch {
    return false;
  }
}
