// Admin-only: verify passcode, manage sources safely, save settings.
import { getValue, setValue } from "./_supabase.js";

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

    // Sources are edited one at a time on the server, so a stale page in a
    // browser can never overwrite the whole list.
    if (body.action === "addBook") {
      const { name, text, category } = body.book || {};
      if (!name || !text) return res.status(400).json({ error: "Source name and text are required" });
      if (!category) return res.status(400).json({ error: "Therapeutic class is required" });
      const current = await getValue("books", []);
      await setValue("books_backup", current);
      const next = [...current.filter((b) => b.name !== name), { name, text, category }];
      await setValue("books", next);
      return res.status(200).json({ ok: true });
    }

    if (body.action === "setBookCategory") {
      if (!body.name || !body.category) return res.status(400).json({ error: "Source name and class are required" });
      const current = await getValue("books", []);
      await setValue("books_backup", current);
      const next = current.map((b) => (b.name === body.name ? { ...b, category: body.category } : b));
      await setValue("books", next);
      return res.status(200).json({ ok: true });
    }

    if (body.action === "removeBook") {
      if (!body.name) return res.status(400).json({ error: "Source name is required" });
      const current = await getValue("books", []);
      await setValue("books_backup", current);
      await setValue("books", current.filter((b) => b.name !== body.name));
      return res.status(200).json({ ok: true });
    }

    if (body.action === "restoreBooks") {
      const backup = await getValue("books_backup", []);
      if (!backup.length) return res.status(400).json({ error: "No backup available" });
      await setValue("books", backup);
      return res.status(200).json({ ok: true, restored: backup.length });
    }

    if (body.action === "save" && body.key === "settings") {
      await setValue("settings", body.value);
      return res.status(200).json({ ok: true });
    }

    // Writing the whole source list from the browser is no longer allowed.
    if (body.action === "save" && body.key === "books") {
      return res.status(400).json({ error: "Use addBook / removeBook instead" });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Save failed" });
  }
}
