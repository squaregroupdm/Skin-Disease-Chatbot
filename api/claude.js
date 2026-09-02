// Secure proxy to the Anthropic API. The API key never leaves the server.
const ALLOWED_MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"];

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = readBody(req);
  const model = ALLOWED_MODELS.includes(body.model) ? body.model : ALLOWED_MODELS[0];
  const max_tokens = Math.min(Number(body.max_tokens) || 1000, 1500);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) return res.status(400).json({ error: "messages required" });

  // PDF/document uploads are only allowed for the admin (they cost more).
  const hasDocument = JSON.stringify(messages).includes('"type":"document"');
  if (hasDocument && req.headers["x-admin-passcode"] !== process.env.ADMIN_PASSCODE) {
    return res.status(401).json({ error: "Admin passcode required for document processing" });
  }
  // Basic abuse guard: cap request size for normal chat.
  if (!hasDocument && JSON.stringify(messages).length > 60000) {
    return res.status(413).json({ error: "Request too large" });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens, messages }),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Upstream error" });
  }
}
