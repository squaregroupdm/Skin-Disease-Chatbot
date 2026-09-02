// Public: returns the app settings (without secrets) and the knowledge sources.
import { getValue } from "./_supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const [settings, books] = await Promise.all([getValue("settings", {}), getValue("books", [])]);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ settings, books });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Failed to load data" });
  }
}
