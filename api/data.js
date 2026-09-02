// Public: returns the app settings (without secrets) and the knowledge sources.
import { getValue } from "./_supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // Report configuration problems clearly instead of a generic 500.
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const problems = [];
  if (!url) problems.push("SUPABASE_URL is missing");
  else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url.trim()))
    problems.push(`SUPABASE_URL looks wrong (should be https://xxxx.supabase.co) — got "${url.slice(0, 40)}"`);
  if (!key) problems.push("SUPABASE_SERVICE_ROLE_KEY is missing");
  else if (!key.trim().startsWith("eyJ"))
    problems.push(`SUPABASE_SERVICE_ROLE_KEY looks wrong (should start with eyJ) — got "${key.slice(0, 14)}…"`);
  if (!process.env.ANTHROPIC_API_KEY) problems.push("ANTHROPIC_API_KEY is missing");
  if (!process.env.ADMIN_PASSCODE) problems.push("ADMIN_PASSCODE is missing");

  if (problems.length) {
    console.error("CONFIG PROBLEM:", problems.join(" | "));
    return res.status(500).json({ error: "Configuration problem", problems });
  }

  try {
    const [settings, books] = await Promise.all([getValue("settings", {}), getValue("books", [])]);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ settings, books });
  } catch (e) {
    const detail = e?.message || String(e);
    console.error("SUPABASE ERROR:", detail);
    return res.status(500).json({ error: "Database error", detail });
  }
}
