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

    // --- Sources are edited ONE AT A TIME, server-side. ---
    // The browser never sends the whole list, so a stale or empty page
    // can no longer wipe existing sources.
    if (body.action === "addBook") {
      const { name, text } = body.book || {};
      if (!name || !text) return res.status(400).json({ error: "Book name and text required" });
      const current = await getValue("books", []);
      await setValue("books_backup", current); // keep a restore point
      const next = [...current.filter((b) => b.name !== name), { name, text }];
      await setValue("books", next);
      return res.status(200).json({ ok: true, books: next.map((b) => ({ name: b.name, size: b.text.length })) });
    }

    if (body.action === "removeBook") {
      if (!body.name) return res.status(400).json({ error: "Book name required" });
      const current = await getValue("books", []);
      await setValue("books_backup", current); // keep a restore point
      const next = current.filter((b) => b.name !== body.name);
      await setValue("books", next);
      return res.status(200).json({ ok: true, books: next.map((b) => ({ name: b.name, size: b.text.length })) });
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

    // Writing the whole book list from the browser is no longer allowed.
    if (body.action === "save" && body.key === "books") {
      return res.status(400).json({ error: "Use addBook/removeBook instead" });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Save failed" });
  }
}
