import { useState, useEffect, useRef } from "react";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { DISEASE_IMAGES, DISEASES } from "./diseaseData.js";

const DEFAULT_SETTINGS = {
  appName: "Skin Care Assistant",
  tagline: "Your trusted dermatology guide",
  welcome: "How can I help your skin today?",
  welcomeSub: "Ask me about any skin condition — symptoms, causes or treatment. English বা বাংলা, যেভাবে সুবিধা।",
  chips: ["দাদ এর চিকিৎসা কী?", "How to treat acne?", "স্ক্যাবিস কীভাবে বুঝব?", "Nail fungus medicine dose"],
  disclaimer: "For general information — always consult a doctor before starting any treatment.",
  accent: "#0F9B8E",
};

// ---------- backend helpers ----------
async function apiGetData() {
  const r = await fetch("/api/data");
  if (!r.ok) throw new Error("Could not load data");
  return r.json();
}
async function apiAdmin(passcode, payload) {
  const r = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-passcode": passcode },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
async function apiClaude(messages, extraHeaders = {}) {
  const r = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages }),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message || data.error || "AI request failed");
  return data;
}

// ---------- text utilities ----------
const normalize = (s) =>
  s.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?"'“”‘’।]/g, " ").replace(/\s+/g, " ").trim();
const tokenize = (s) => normalize(s).split(" ").filter((w) => w.length > 1);

function chunkText(text, bookName) {
  const paras = text.split(/\n\s*\n|\r\n\s*\r\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = "";
  for (const p of paras) {
    if ((buf + "\n\n" + p).length > 1200 && buf) {
      chunks.push(buf);
      buf = buf.slice(-180) + "\n\n" + p;
    } else buf = buf ? buf + "\n\n" + p : p;
  }
  if (buf.trim()) chunks.push(buf);
  return chunks.map((c, i) => ({ book: bookName, idx: i, text: c }));
}

function retrieve(question, allChunks, topK = 8) {
  const qTerms = [...new Set(tokenize(question))];
  if (!qTerms.length || !allChunks.length) return [];
  const N = allChunks.length;
  const df = {};
  const chunkTokens = allChunks.map((c) => {
    const toks = tokenize(c.text);
    const seen = new Set(toks);
    for (const t of seen) if (qTerms.includes(t)) df[t] = (df[t] || 0) + 1;
    return toks;
  });
  const scored = allChunks.map((c, i) => {
    let score = 0;
    for (const t of qTerms) {
      const tf = chunkTokens[i].filter((x) => x === t).length;
      if (tf > 0) score += (1 + Math.log(tf)) * Math.log(1 + N / (df[t] || 1));
    }
    return { ...c, score };
  });
  return scored.filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);
}

// Fallback topic detection (used only if the AI doesn't tag its answer).
// Counts occurrences and demands a clear winner — ambiguous cases show no image.
function detectDisease(text) {
  const t = text.toLowerCase();
  const scored = DISEASES.map((d) => {
    let s = 0;
    for (const kw of d.keywords) {
      const k = kw.toLowerCase();
      let idx = t.indexOf(k), count = 0;
      while (idx !== -1 && count < 5) { count++; idx = t.indexOf(k, idx + k.length); }
      s += count * Math.max(kw.trim().length, 3);
    }
    return { d, s };
  }).sort((a, b) => b.s - a.s);
  const first = scored[0], second = scored[1];
  if (!first || first.s < 6) return null;                     // too weak a signal
  if (second && second.s > 0 && first.s < second.s * 1.5) return null; // ambiguous
  return first.d;
}

// ---------- treatment / ingredient concepts (for "where is X used?" questions) ----------
// When someone asks about a treatment rather than a disease, we gather EVERY passage
// that mentions it, so the answer can list all the conditions it applies to.
const CONCEPT_GROUPS = [
  { name: "moisturizer / emollient", terms: ["moisturizer","moisturiser","emollient","emollients","emolent","emoli","equra","ময়েশ্চারাইজার","ইমোলেন্ট","ইমোলিয়েন্ট","ময়েশ্চারাইজিং"] },
  { name: "topical steroid", terms: ["steroid","steroids","corticosteroid","topical steroid","hydrocortisone","clobetasol","halobetasol","betamethasone","fluticasone","clobetasone","স্টেরয়েড","স্টেরয়েড","করটিকোস্টেরয়েড","হাইড্রোকরটিসন"] },
  { name: "antifungal", terms: ["antifungal","anti-fungal","antifungals","terbinafine","itraconazole","fluconazole","clotrimazole","miconazole","luliconazole","ciclopirox","oxiconazole","ketoconazole","এন্টিফাঙ্গাল","অ্যান্টিফাঙ্গাল","টারবিনাফিন","ইট্রাকোনাজল"] },
  { name: "antibiotic", terms: ["antibiotic","antibiotics","mupirocin","fusidic","retapamulin","amoxicillin","cephalexin","clindamycin","gentamicin","neomycin","এন্টিবায়োটিক","অ্যান্টিবায়োটিক","মিউপিরোসিন","ফুসিডিক"] },
  { name: "antihistamine", terms: ["antihistamine","antihistamines","diphenhydramine","এন্টি হিস্টামিন","অ্যান্টিহিস্টামিন","হিস্টামিন"] },
  { name: "sunscreen / sunblock", terms: ["sunscreen","sunblock","sunblocks","spf","sunmask","ultraviolet","uv ","সানব্লক","সানস্ক্রিন","আল্ট্রাভায়োলেট","সানমাস্ক"] },
  { name: "salicylic acid / keratolytic", terms: ["salicylic","keratolytic","keratolytics","salicid","prosalic","স্যালিসাইলিক","কেরাটোলাইটিক","কেরাটোলাইটিক্স"] },
  { name: "tacrolimus", terms: ["tacrolimus","remus","ট্যাক্রোলিমাস","ট্যাকরোলিমাস"] },
  { name: "minoxidil", terms: ["minoxidil","splendora","মিনোক্সিডিল"] },
  { name: "retinoid", terms: ["retinoid","retinoids","tretinoin","adapalene","isotretinoin","retinoic","রেটিনয়েড","রেটিনয়িক","আইসোট্রেটিনইন"] },
  { name: "phototherapy / light treatment", terms: ["phototherapy","photochemotherapy","puva","light treatment","ফটোথেরাপি","ফটোকেমোথেরাপি","আলোকরশ্মি"] },
  { name: "cryotherapy / physical removal", terms: ["cryotherapy","electrosurgery","curettage","excision","laser","ক্রায়োথেরাপি","ইলেকট্রোসার্জারি","কিউরেটেজ","লেজার"] },
  { name: "permethrin / ivermectin", terms: ["permethrin","ivermectin","crotamiton","scabex","alice","পারমেথ্রিন","ইভারমেকটিন","ক্রোটামিটন"] },
  { name: "vitamin D analogue", terms: ["calcipotriol","vitamin d","dyvon","ক্যালসিপোট্রিয়ল","ভিটামিন ডি"] },
];

// Returns a concept if the question is about a treatment/ingredient rather than one disease.
function detectConcept(question) {
  const q = normalize(question);
  // If a specific disease is clearly named, treat it as a normal question.
  for (const d of DISEASES) {
    for (const kw of d.keywords) {
      const k = kw.toLowerCase().trim();
      if (k.length >= 4 && q.includes(k)) return null;
    }
  }
  for (const g of CONCEPT_GROUPS) {
    if (g.terms.some((t) => q.includes(t.toLowerCase().trim()))) return g;
  }
  return null;
}

// Every passage mentioning the concept — not just the top few.
function retrieveByConcept(group, allChunks, maxChunks = 24) {
  const hits = allChunks.filter((c) => {
    const t = c.text.toLowerCase();
    return group.terms.some((term) => t.includes(term.toLowerCase().trim()));
  });
  return hits.slice(0, maxChunks);
}

// ---------- language & typo helpers ----------
const hasBengali = (s) => /[\u0980-\u09FF]/.test(s);

// tiny edit-distance for typo detection
function editDist(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}

// If the question contains a near-miss of a disease name (typo), suggest it.
function fuzzyDiseaseSuggestions(question) {
  const qNorm = normalize(question);
  const toks = qNorm.split(" ").filter((w) => w.length > 2);
  const bigrams = toks.slice(0, -1).map((w, i) => w + " " + toks[i + 1]);
  const candidates = [...toks, ...bigrams];
  const exact = new Set();
  const near = new Map();
  for (const d of DISEASES) {
    for (const kw of d.keywords) {
      const k = kw.toLowerCase().trim();
      if (qNorm.includes(k)) { exact.add(d.id); continue; }
      if (k.length < 4) continue;
      const tol = k.length >= 8 ? 2 : 1;
      for (const c of candidates) {
        const dist = editDist(c, k);
        if (dist <= tol) {
          const prev = near.get(d.id);
          if (!prev || prev.dist > dist) near.set(d.id, { d, dist });
        }
      }
    }
  }
  if (exact.size > 0) return []; // condition clearly named — no need to double-check
  return [...near.values()].sort((a, b) => a.dist - b.dist).slice(0, 3).map((x) => x.d);
}


// ---------- multi-format file parsing ----------
async function fileToText(file, onStatus, adminPass) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (["txt", "md"].includes(ext)) return await file.text();
  if (ext === "csv") {
    const parsed = Papa.parse(await file.text(), { skipEmptyLines: true });
    return parsed.data.map((row) => row.join(" | ")).join("\n");
  }
  if (ext === "docx") {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }
  if (["xlsx", "xls"].includes(ext)) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    return wb.SheetNames.map((n) => `Sheet: ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join("\n\n");
  }
  if (ext === "pdf") {
    onStatus && onStatus("Reading PDF with AI — this may take a few minutes for large files…");
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1]);
      r.onerror = () => rej(new Error("Read failed"));
      r.readAsDataURL(file);
    });
    let msgs = [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
        { type: "text", text: "Transcribe the COMPLETE text content of this document as plain text, in reading order, section by section. Include headings, descriptions, symptom lists, treatments and product names. If any text appears in Bengali, transcribe it in proper Unicode Bengali. Output ONLY the transcribed text — no commentary." },
      ],
    }];
    let full = "";
    for (let i = 0; i < 80; i++) {
      const data = await apiClaude(msgs, { "x-admin-passcode": adminPass });
      const t = (data.content || []).map((c) => (c.type === "text" ? c.text : "")).filter(Boolean).join("");
      full += t;
      onStatus && onStatus(`Extracting PDF text… ${Math.round(full.length / 1000)}k characters so far`);
      if (data.stop_reason !== "max_tokens") break;
      msgs = [...msgs, { role: "assistant", content: t }, { role: "user", content: "Continue transcribing exactly where you left off. Output only the continuation text." }];
    }
    if (!full.trim()) throw new Error("No text could be extracted from this PDF");
    return full;
  }
  throw new Error(`Unsupported file type: .${ext}`);
}

// ==================================================================
export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [books, setBooks] = useState([]);
  const [chunks, setChunks] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false); // true only after a successful load
  const [zoom, setZoom] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);

  // admin
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [passInput, setPassInput] = useState("");
  const [adminTab, setAdminTab] = useState("sources");
  const [uploadStatus, setUploadStatus] = useState("");
  const [draft, setDraft] = useState(DEFAULT_SETTINGS);
  const [flash, setFlash] = useState("");
  const [pasteName, setPasteName] = useState("");
  const [pasteText, setPasteText] = useState("");

  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const { settings: s, books: b } = await apiGetData();
        const merged = { ...DEFAULT_SETTINGS, ...(s || {}) };
        setSettings(merged); setDraft(merged); setBooks(b || []);
        setDataLoaded(true);
      } catch (e) { setLoadError(e.message); }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { setChunks(books.flatMap((b) => chunkText(b.text, b.name))); }, [books]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setZoom(null); };
    const onInstall = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeinstallprompt", onInstall); };
  }, []);

  const showFlash = (msg) => { setFlash(msg); setTimeout(() => setFlash(""), 2500); };

  // Sources are added/removed one at a time on the server, so this browser
  // can never overwrite the whole list (which previously wiped sources when
  // the page had loaded during a backend hiccup).
  const refreshBooks = async () => {
    try { const { books: b } = await apiGetData(); setBooks(b || []); } catch { /* keep current */ }
  };

  const addBook = async (name, text) => {
    if (!dataLoaded) { showFlash("Still loading — please wait a moment"); return false; }
    await apiAdmin(adminPass, { action: "addBook", book: { name, text } });
    await refreshBooks();
    return true;
  };

  const removeBook = async (name) => {
    if (!window.confirm(`Remove "${name}" from the knowledge base?`)) return;
    try {
      await apiAdmin(adminPass, { action: "removeBook", name });
      await refreshBooks();
      showFlash("Removed ✓");
    } catch (e) { showFlash("Remove failed: " + e.message); }
  };

  const onAdminFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploadStatus(`Processing ${f.name}…`);
    try {
      const text = await fileToText(f, setUploadStatus, adminPass);
      const name = f.name.replace(/\.[^.]+$/, "");
      const ok = await addBook(name, text);
      if (ok) setUploadStatus(`✓ Added "${name}" (${Math.round(text.length / 1000)}k characters) — saved permanently`);
    } catch (err) { setUploadStatus(`✕ ${err.message}`); }
  };

  const saveSettings = async () => {
    const clean = { ...draft, chips: (Array.isArray(draft.chips) ? draft.chips : String(draft.chips).split("\n")).map((c) => c.trim()).filter(Boolean).slice(0, 6) };
    try {
      await apiAdmin(adminPass, { action: "save", key: "settings", value: clean });
      setSettings(clean); showFlash("Saved ✓");
    } catch (e) { showFlash("Save failed: " + e.message); }
  };

  const tryUnlock = async () => {
    try {
      await apiAdmin(passInput, { action: "verify" });
      setAdminPass(passInput); setAdminAuthed(true); setPassInput("");
    } catch { showFlash("Wrong passcode"); }
  };

  const ask = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);

    // Language of this message (decided here, not left to the AI)
    const langRule = hasBengali(q)
      ? "The user wrote in Bangla. You MUST reply entirely in natural, fluent Bangla (বাংলা)."
      : "The user wrote in Latin script. If the message is English, reply entirely in English. If it is Bangla typed with English letters (Banglish), reply in Bangla.";

    // Possible misspelled disease name → prepare a confirmation flow
    const sugg = fuzzyDiseaseSuggestions(q);
    const suggNames = sugg.map((d) => `${d.en} (${d.bn})`).join(", ");

    // For short follow-ups ("yes", "হ্যাঁ") include recent turns so retrieval still finds the right topic;
    // if a typo was detected, also search using the corrected names.
    const retrievalQuery =
      (q.length < 25 ? messages.slice(-4).map((m) => m.text).join(" ") + " " : "") +
      q +
      (sugg.length ? " " + sugg.map((d) => d.en + " " + d.bn + " " + d.keywords.join(" ")).join(" ") : "");

    // "Where is X used?" style questions get every relevant passage, not just the top few.
    const concept = detectConcept(q);
    let hits = concept ? retrieveByConcept(concept, chunks) : retrieve(retrievalQuery, chunks, 8);
    if (concept && hits.length === 0) hits = retrieve(retrievalQuery, chunks, 8);

    let context = hits.length ? hits.map((h) => h.text).join("\n\n---\n\n") : "(no matching information found)";
    if (context.length > 28000) context = context.slice(0, 28000);

    const conceptRule = concept
      ? `\nTHIS IS AN OVERVIEW QUESTION about "${concept.name}". The passages below come from across the whole knowledge base. List EVERY condition in them where this is used or recommended — do not stop at one or two. Give a one-line reason for each, group related conditions together, and start with a short plain-language explanation of what it does and why it helps. End with [topic: none] since the answer covers many conditions.\n`
      : "";
    const historyText = messages.slice(-6).map((m) => `${m.role === "user" ? "User" : "You"}: ${m.text}`).join("\n");

    const prompt = `You are the assistant behind "${settings.appName}" — a warm, friendly and professional skin-health guide for users in Bangladesh.

HOW TO ANSWER:
1. Base your answer ONLY on the reference information below. Never invent facts, doses, or medicine names that are not in it.
2. Speak naturally and conversationally, like a caring pharmacist explaining things to a person. NEVER mention "the book", "the text", "excerpts", "sources", "documents" or "reference". Answer as if this is your own knowledge.
3. LANGUAGE (strict): ${langRule} Do not mix languages, except medicine/product names which may stay in English.
4. Keep answers clear and human — short paragraphs; a short list only when listing symptoms or treatment options.
5. If the user greets you or makes small talk, respond warmly and invite them to ask about any skin condition.
6. If the question is not covered by the reference information, say honestly and kindly that you don't have details on that and suggest consulting a dermatologist. Do not guess.
7. For treatment questions, you may end with one brief caring reminder to consult a doctor before using medicines, when natural — not every message.
8. TOPIC TAG (required): after your complete answer, on a new final line, write exactly [topic: <id>] where <id> is the ONE condition your answer is mainly about, chosen ONLY from this list: impetigo, tinea_pedis, tinea_corporis, tinea_cruris, tinea_capitis, tinea_faciei, tinea_manuum, onychomycosis, tinea_versicolor, scabies, atopic_eczema, seborrheic_eczema, discoid_eczema, pompholyx, contact_dermatitis, varicose_eczema, lichen_simplex, lichen_planus, insect_bites, psoriasis, scalp_psoriasis, melasma, acne, warts, corns_calluses, alopecia, vitiligo, dry_skin, sunburn, hirsutism. If the message is a greeting, small talk, or your answer is not mainly about one of these conditions, write [topic: none]. This line is hidden from the user.

${conceptRule}${sugg.length ? `IMPORTANT — POSSIBLE MISSPELLING: The user's message seems to contain a misspelled condition name. Most likely they mean: ${suggNames}. Do NOT give the full answer yet. Reply with ONE short, friendly question confirming which condition they mean (in the user's language, e.g. "আপনি কি সোরিয়াসিস (Psoriasis) বুঝাতে চেয়েছেন?" / "Did you mean Psoriasis?"). If there are multiple likely options, list them briefly. End this confirmation message with [topic: none].\n\n` : ""}${historyText ? `Conversation so far:\n${historyText}\n\n` : ""}REFERENCE INFORMATION (never mention it):\n${context}\n\nUser's message: ${q}`;

    try {
      const data = await apiClaude([{ role: "user", content: prompt }]);
      let answer = (data.content || []).map((c) => (c.type === "text" ? c.text : "")).filter(Boolean).join("\n");
      let disease = null;
      const tagMatch = answer.match(/\[\s*topic\s*:\s*([a-z_]+)\s*\]\s*$/i);
      if (tagMatch) {
        answer = answer.slice(0, tagMatch.index).trim();
        const id = tagMatch[1].toLowerCase();
        if (id !== "none") disease = DISEASES.find((d) => d.id === id) || null;
      } else {
        disease = detectDisease(q + " " + answer);
      }
            setMessages((m) => [...m, { role: "assistant", text: answer || "Hmm, something went wrong — please try again.", disease: disease || null }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "I couldn't connect just now. Please check your internet and try again." }]);
    }
    setBusy(false);
  };

  const A = settings.accent || "#0F9B8E";
  const S = { ink: "#0F172A", sub: "#64748B", border: "#E5EBF0" };
  const grad = `linear-gradient(135deg, ${A}, ${A}CC)`;
  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "10px 14px", border: `1px solid ${S.border}`, borderRadius: 12, fontSize: 13.5, outline: "none", fontFamily: "inherit" };
  const labelStyle = { fontSize: 12, fontWeight: 700, color: S.sub, textTransform: "uppercase", letterSpacing: 0.5, display: "block", margin: "14px 0 6px" };

  return (
    <div style={{
      minHeight: "100vh", minHeight: "100dvh",
      background: "linear-gradient(160deg, #FAFCFD 0%, #F0F7F6 55%, #EDF4F8 100%)",
      color: S.ink, fontFamily: "'Segoe UI', system-ui, -apple-system, 'Noto Sans Bengali', sans-serif",
      display: "flex", flexDirection: "column",
    }}>
      <style>{`
        @keyframes blink { 0%,80%,100%{opacity:.25;transform:translateY(0)} 40%{opacity:1;transform:translateY(-3px)} }
        @keyframes pop { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .msg { animation: pop .25s ease both; }
        input::placeholder, textarea::placeholder { color:#94A3B8; }
        button { font-family: inherit; }
      `}</style>

      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 20, background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${S.border}`, padding: "12px 20px", paddingTop: "calc(12px + env(safe-area-inset-top))",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{ width: 40, height: 40, borderRadius: 14, background: grad, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 20, boxShadow: `0 4px 12px ${A}55` }}>✚</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: -0.2 }}>{settings.appName}</div>
          <div style={{ fontSize: 12, color: S.sub }}>{settings.tagline}</div>
        </div>
        {installPrompt && (
          <button onClick={async () => { installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); }}
            style={{ background: grad, color: "#fff", border: "none", borderRadius: 999, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            ⬇ Install app
          </button>
        )}
      </header>

      {/* Chat */}
      <main style={{ flex: 1, overflowY: "auto", padding: "24px 16px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {messages.length === 0 && loaded && (
            <div style={{ textAlign: "center", marginTop: 40 }}>
              <div style={{ fontSize: 44 }}>🩺</div>
              <div style={{ fontWeight: 700, fontSize: 21, marginTop: 8, letterSpacing: -0.3 }}>{settings.welcome}</div>
              <p style={{ fontSize: 14, color: S.sub, maxWidth: 420, margin: "8px auto 18px", lineHeight: 1.6 }}>{settings.welcomeSub}</p>
              {loadError ? (
                <div style={{ fontSize: 13, color: "#B91C1C", background: "#fff", border: `1px solid ${S.border}`, borderRadius: 14, padding: "14px 18px", display: "inline-block" }}>
                  Couldn't reach the server. Please refresh in a moment.
                </div>
              ) : books.length === 0 ? (
                <div style={{ fontSize: 13, color: S.sub, background: "#fff", border: `1px solid ${S.border}`, borderRadius: 14, padding: "14px 18px", display: "inline-block" }}>
                  ⏳ The knowledge base is being set up. Please check back soon.
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  {settings.chips.map((s) => (
                    <button key={s} onClick={() => setInput(s)} style={{ background: "#fff", border: `1px solid ${S.border}`, borderRadius: 999, padding: "8px 16px", fontSize: 13, cursor: "pointer", color: S.ink, boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>{s}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className="msg" style={{ margin: "16px 0", display: "flex", gap: 10, justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              {m.role === "assistant" && (
                <div style={{ width: 32, height: 32, borderRadius: 12, flexShrink: 0, marginTop: 2, background: grad, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15 }}>✚</div>
              )}
              <div style={{ maxWidth: "82%" }}>
                {m.role === "assistant" && m.disease && DISEASE_IMAGES[m.disease.id] && (
                  <div onClick={() => setZoom(m.disease)} title="Tap to enlarge" style={{ background: "#fff", border: `1px solid ${S.border}`, borderRadius: 18, padding: 10, marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 12, boxShadow: "0 2px 10px rgba(15,23,42,0.05)", cursor: "zoom-in" }}>
                    <div style={{ position: "relative" }}>
                      <img src={DISEASE_IMAGES[m.disease.id]} alt={m.disease.en} style={{ width: 92, height: 92, borderRadius: 14, objectFit: "cover", display: "block" }} />
                      <div style={{ position: "absolute", right: 5, bottom: 5, width: 22, height: 22, borderRadius: 8, background: "rgba(15,23,42,0.55)", color: "#fff", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>🔍</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.disease.en}</div>
                      <div style={{ fontSize: 12.5, color: S.sub }}>{m.disease.bn}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>Tap to enlarge</div>
                    </div>
                  </div>
                )}
                <div style={{
                  background: m.role === "user" ? grad : "#fff", color: m.role === "user" ? "#fff" : S.ink,
                  border: m.role === "user" ? "none" : `1px solid ${S.border}`,
                  borderRadius: m.role === "user" ? "20px 20px 6px 20px" : "20px 20px 20px 6px",
                  padding: "13px 17px", fontSize: 14.5, lineHeight: 1.65, whiteSpace: "pre-wrap",
                  boxShadow: m.role === "user" ? `0 3px 12px ${A}40` : "0 2px 10px rgba(15,23,42,0.05)",
                }}>{m.text}</div>
              </div>
            </div>
          ))}

          {busy && (
            <div className="msg" style={{ display: "flex", gap: 10, margin: "16px 0" }}>
              <div style={{ width: 32, height: 32, borderRadius: 12, background: grad, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15 }}>✚</div>
              <div style={{ background: "#fff", border: `1px solid ${S.border}`, borderRadius: "20px 20px 20px 6px", padding: "16px 18px", display: "flex", gap: 5 }}>
                {[0, 1, 2].map((d) => <span key={d} style={{ width: 7, height: 7, borderRadius: "50%", background: A, animation: `blink 1.2s ${d * 0.2}s infinite` }} />)}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input */}
      <footer style={{ padding: "12px 16px", paddingBottom: "calc(14px + env(safe-area-inset-bottom))" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", background: "#fff", border: `1px solid ${S.border}`, borderRadius: 999, boxShadow: "0 6px 24px rgba(15,23,42,0.08)", display: "flex", alignItems: "center", padding: "6px 6px 6px 20px", gap: 8 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder={books.length ? "Ask about any skin problem… / প্রশ্ন লিখুন…" : "Knowledge base is being prepared…"}
            disabled={!books.length}
            style={{ flex: 1, border: "none", outline: "none", fontSize: 14.5, background: "transparent", color: S.ink, minWidth: 0 }} />
          <button onClick={ask} disabled={busy || !input.trim()} style={{ width: 42, height: 42, borderRadius: "50%", border: "none", background: busy || !input.trim() ? "#CBD5E1" : grad, color: "#fff", fontSize: 17, cursor: busy || !input.trim() ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>➤</button>
        </div>
        <div style={{ maxWidth: 720, margin: "8px auto 0", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#94A3B8" }}>
          <span style={{ flex: 1, textAlign: "center" }}>{settings.disclaimer}</span>
          <button onClick={() => setAdminOpen(true)} style={{ background: "none", border: "none", color: "#CBD5E1", fontSize: 11, cursor: "pointer", padding: "2px 4px" }}>Admin</button>
        </div>
      </footer>

      {/* ===================== ADMIN PANEL ===================== */}
      {adminOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(10,15,25,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 22, width: "min(94vw, 640px)", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.4)", animation: "pop .2s ease both" }}>
            <div style={{ padding: "16px 22px", borderBottom: `1px solid ${S.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 2, borderRadius: "22px 22px 0 0" }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>⚙️ Admin Panel</div>
              <button onClick={() => { setAdminOpen(false); setAdminAuthed(false); setAdminPass(""); setPassInput(""); }} style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${S.border}`, background: "#F8FAFC", cursor: "pointer" }}>✕</button>
            </div>

            {!adminAuthed ? (
              <div style={{ padding: "30px 22px 34px", textAlign: "center" }}>
                <div style={{ fontSize: 36 }}>🔐</div>
                <div style={{ fontWeight: 700, marginTop: 8 }}>Administrator access</div>
                <p style={{ fontSize: 13, color: S.sub }}>Enter the admin passcode to manage this platform.</p>
                <input type="password" value={passInput} onChange={(e) => setPassInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
                  placeholder="Passcode" style={{ ...inputStyle, maxWidth: 240, margin: "10px auto 0", textAlign: "center" }} />
                <div>
                  <button onClick={tryUnlock} style={{ marginTop: 12, background: grad, color: "#fff", border: "none", borderRadius: 12, padding: "10px 26px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>Unlock</button>
                </div>
                {flash && <div style={{ marginTop: 10, fontSize: 12.5, color: "#B91C1C" }}>{flash}</div>}
              </div>
            ) : (
              <div style={{ padding: "16px 22px 26px" }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                  {[["sources", "📚 Sources"], ["branding", "🎨 Branding"], ["security", "🔐 Security"]].map(([id, label]) => (
                    <button key={id} onClick={() => setAdminTab(id)} style={{ padding: "8px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${adminTab === id ? A : S.border}`, background: adminTab === id ? A : "#fff", color: adminTab === id ? "#fff" : S.ink }}>{label}</button>
                  ))}
                </div>

                {adminTab === "sources" && (
                  <div>
                    <p style={{ fontSize: 13, color: S.sub, marginTop: 0 }}>These files power every user's answers. Supported: <b>.txt, .md, .docx, .pdf, .csv, .xlsx</b></p>
                    {!dataLoaded && (
                      <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 12, padding: "10px 14px", fontSize: 12.5, marginBottom: 10 }}>
                        ⚠️ Couldn't load the current sources from the server. Uploading is disabled until this page loads them successfully — please refresh.
                      </div>
                    )}
                    {books.map((b) => (
                      <div key={b.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#F8FAFC", border: `1px solid ${S.border}`, borderRadius: 14, padding: "10px 14px", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 18 }}>📗</span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{b.name}</div>
                            <div style={{ fontSize: 11.5, color: S.sub }}>{Math.round(b.text.length / 1000)}k characters</div>
                          </div>
                        </div>
                        <button onClick={() => removeBook(b.name)} style={{ background: "transparent", border: `1px solid ${S.border}`, borderRadius: 10, padding: "6px 12px", fontSize: 12, cursor: "pointer", color: "#B91C1C" }}>Remove</button>
                      </div>
                    ))}
                    {books.length === 0 && (
                      <div style={{ fontSize: 13, color: S.sub, padding: "8px 0" }}>
                        No sources yet.{" "}
                        <button onClick={async () => { try { const r = await apiAdmin(adminPass, { action: "restoreBooks" }); await refreshBooks(); showFlash(`Restored ${r.restored} source(s) ✓`); } catch (e) { showFlash(e.message); } }}
                          style={{ background: "none", border: "none", color: A, fontWeight: 700, fontSize: 13, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                          Restore last backup
                        </button>
                      </div>
                    )}
                    <button onClick={() => fileRef.current?.click()} style={{ background: grad, color: "#fff", border: "none", borderRadius: 12, padding: "10px 18px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", marginTop: 6 }}>⬆ Upload source file</button>
                    <input ref={fileRef} type="file" accept=".txt,.md,.docx,.pdf,.csv,.xlsx,.xls" onChange={onAdminFile} style={{ display: "none" }} />
                    {uploadStatus && <div style={{ fontSize: 12.5, marginTop: 10, color: uploadStatus.startsWith("✕") ? "#B91C1C" : S.sub }}>{uploadStatus}</div>}

                    <label style={labelStyle}>Or paste text directly</label>
                    <input value={pasteName} onChange={(e) => setPasteName(e.target.value)} placeholder="Source name" style={{ ...inputStyle, marginBottom: 8 }} />
                    <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste content…" rows={4} style={{ ...inputStyle, resize: "vertical" }} />
                    <button disabled={!pasteText.trim()}
                      onClick={async () => { const n = pasteName.trim() || "Pasted source"; try { const ok = await addBook(n, pasteText); if (ok) { setPasteName(""); setPasteText(""); showFlash("Added ✓"); } } catch (e) { showFlash("Save failed: " + e.message); } }}
                      style={{ marginTop: 8, background: pasteText.trim() ? S.ink : "#CBD5E1", color: "#fff", border: "none", borderRadius: 12, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: pasteText.trim() ? "pointer" : "default" }}>Add pasted text</button>
                    {flash && <div style={{ marginTop: 10, fontSize: 12.5, color: A, fontWeight: 600 }}>{flash}</div>}
                  </div>
                )}

                {adminTab === "branding" && (
                  <div>
                    <label style={labelStyle}>App name</label>
                    <input value={draft.appName} onChange={(e) => setDraft({ ...draft, appName: e.target.value })} style={inputStyle} />
                    <label style={labelStyle}>Tagline</label>
                    <input value={draft.tagline} onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} style={inputStyle} />
                    <label style={labelStyle}>Welcome heading</label>
                    <input value={draft.welcome} onChange={(e) => setDraft({ ...draft, welcome: e.target.value })} style={inputStyle} />
                    <label style={labelStyle}>Welcome subtitle</label>
                    <textarea value={draft.welcomeSub} onChange={(e) => setDraft({ ...draft, welcomeSub: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
                    <label style={labelStyle}>Suggested questions (one per line, max 6)</label>
                    <textarea value={Array.isArray(draft.chips) ? draft.chips.join("\n") : draft.chips} onChange={(e) => setDraft({ ...draft, chips: e.target.value })} rows={4} style={{ ...inputStyle, resize: "vertical" }} />
                    <label style={labelStyle}>Disclaimer text</label>
                    <input value={draft.disclaimer} onChange={(e) => setDraft({ ...draft, disclaimer: e.target.value })} style={inputStyle} />
                    <label style={labelStyle}>Theme color</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {["#0F9B8E", "#2563EB", "#7C3AED", "#DB2777", "#EA580C", "#16A34A"].map((c) => (
                        <button key={c} onClick={() => setDraft({ ...draft, accent: c })} style={{ width: 34, height: 34, borderRadius: 12, border: draft.accent === c ? `3px solid ${S.ink}` : "3px solid transparent", background: c, cursor: "pointer" }} />
                      ))}
                    </div>
                    <button onClick={saveSettings} style={{ marginTop: 18, background: grad, color: "#fff", border: "none", borderRadius: 12, padding: "10px 22px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>Save changes</button>
                    {flash && <span style={{ marginLeft: 12, fontSize: 13, color: A, fontWeight: 600 }}>{flash}</span>}
                  </div>
                )}

                {adminTab === "security" && (
                  <div style={{ fontSize: 13.5, lineHeight: 1.7, color: S.ink }}>
                    <p style={{ marginTop: 0 }}>Your admin passcode is stored securely on the server — not in this app — so users can never discover it.</p>
                    <p><b>To change it:</b> open your Vercel dashboard → your project → <b>Settings → Environment Variables</b> → edit <code>ADMIN_PASSCODE</code> → then <b>Deployments → Redeploy</b>. The new passcode takes effect in about a minute.</p>
                    <p style={{ color: S.sub }}>Your AI key and database keys are also kept server-side and never sent to users' phones.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {zoom && DISEASE_IMAGES[zoom.id] && (
        <div onClick={() => setZoom(null)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(10,15,25,0.82)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pop .18s ease both", cursor: "zoom-out", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 22, padding: 14, maxWidth: "min(92vw, 560px)", boxShadow: "0 24px 80px rgba(0,0,0,0.45)", cursor: "default" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{zoom.en}</div>
                <div style={{ fontSize: 13, color: S.sub }}>{zoom.bn}</div>
              </div>
              <button onClick={() => setZoom(null)} style={{ width: 34, height: 34, borderRadius: 12, border: `1px solid ${S.border}`, background: "#F8FAFC", fontSize: 15, cursor: "pointer" }}>✕</button>
            </div>
            <img src={DISEASE_IMAGES[zoom.id]} alt={zoom.en} style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 16, display: "block", background: "#F1F5F9" }} />
            <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 8, textAlign: "center" }}>Tap outside to close</div>
          </div>
        </div>
      )}
    </div>
  );
}
