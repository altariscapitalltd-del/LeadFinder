import { getDb } from "../db.js";

export function getScrapeSuggestions(limit = 8) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT kind, value, AVG(confidence) as confidence, COUNT(*) as freq
    FROM scrape_suggestions
    WHERE created_at >= datetime('now', '-14 days')
    GROUP BY kind, value
    ORDER BY freq DESC, confidence DESC
    LIMIT ?
  `).all(limit * 3);

  const groups = { source: [], country: [], industry: [], quality: [] };
  for (const row of rows) {
    if (!groups[row.kind]) continue;
    groups[row.kind].push({
      value: row.value,
      confidence: Math.round(Number(row.confidence || 0)),
      freq: row.freq,
    });
  }

  return {
    source: groups.source.slice(0, limit),
    country: groups.country.slice(0, limit),
    industry: groups.industry.slice(0, limit),
    quality: [
      { value: "If many developers found, try deeper GitHub profile paths", confidence: 75 },
      { value: "Filter out role accounts to improve reply rate", confidence: 82 },
      { value: "Target countries with highest valid-rate first", confidence: 70 },
    ],
  };
}
