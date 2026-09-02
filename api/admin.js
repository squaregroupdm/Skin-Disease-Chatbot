// Admin-only: verify passcode and save settings/sources.
import { setValue } from "./_supabase.js";

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = readBody(req);
  const passcode = req.headers["x-admin-passcode"] || body.passcode;
  if (!process.env.ADMIN_PASSCODE || passcode !== process.env.ADMIN_PASSCODE) {
    return res.status(401).json({ error: "Invalid passcode" });
  }
  try {
    if (body.action === "verify") return res.status(200).json({ ok: true });
    if (body.action === "save" && ["settings", "books"].includes(body.key)) {
      await setValue(body.key, body.value);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Save failed" });
  }
}
