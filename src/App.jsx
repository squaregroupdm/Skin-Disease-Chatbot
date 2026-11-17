import { useState, useEffect, useRef } from "react";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { DISEASE_IMAGES, DISEASES } from "./diseaseData.js";

// ---------- defaults ----------
const DEFAULT_CLASSES = [
  { id: "dermatology", name: "Dermatology", bn: "চর্মরোগ", specialist: "dermatologist", color: "#0F9B8E", images: true,
    chips: ["দাদ এর চিকিৎসা কী?", "How to treat acne?", "স্ক্যাবিস কীভাবে বুঝব?", "Nail fungus medicine dose"] },
  { id: "diabetes", name: "Diabetes & Endocrine", bn: "ডায়াবেটিস ও হরমোন", specialist: "diabetologist or endocrinologist", color: "#2563EB", images: false, chips: [] },
  { id: "cardiology", name: "Cardiology", bn: "হৃদরোগ", specialist: "cardiologist", color: "#DC2626", images: false, chips: [] },
  { id: "gastro", name: "Gastroenterology", bn: "পরিপাকতন্ত্র", specialist: "gastroenterologist", color: "#D97706", images: false, chips: [] },
  { id: "respiratory", name: "Respiratory", bn: "শ্বাসতন্ত্র", specialist: "pulmonologist", color: "#0891B2", images: false, chips: [] },
  { id: "antiinfective", name: "Anti-infectives", bn: "সংক্রমণ ও অ্যান্টিবায়োটিক", specialist: "doctor", color: "#7C3AED", images: false, chips: [] },
];

const DEFAULT_SETTINGS = {
  appName: "Square Health Assistant",
  tagline: "Trusted medical guidance",
  gateHeading: "Select a therapeutic area",
  gateSub: "Choose the area you want to ask about, so answers stay accurate to that specialty.",
  disclaimer: "For general information — always consult a doctor before starting any treatment.",
  accent: "#0F9B8E",
  classes: DEFAULT_CLASSES,
};

// ---------- treatment / ingredient concepts (for "where is X used?" questions) ----------
const CONCEPT_GROUPS = [
  { name: "moisturizer / emollient", terms: ["moisturizer","moisturiser","emollient","emollients","emolent","emoli","equra","ময়েশ্চারাইজার","ইমোলেন্ট","ইমোলিয়েন্ট","ময়েশ্চারাইজিং"] },
  { name: "topical steroid", terms: ["steroid","steroids","corticosteroid","topical steroid","hydrocortisone","clobetasol","halobetasol","betamethasone","fluticasone","clobetasone","স্টেরয়েড","করটিকোস্টেরয়েড","হাইড্রোকরটিসন"] },
  { name: "antifungal", terms: ["antifungal","anti-fungal","antifungals","terbinafine","itraconazole","fluconazole","clotrimazole","miconazole","luliconazole","ciclopirox","oxiconazole","ketoconazole","এন্টিফাঙ্গাল","অ্যান্টিফাঙ্গাল","টারবিনাফিন","ইট্রাকোনাজল"] },
  { name: "antibiotic", terms: ["antibiotic","antibiotics","mupirocin","fusidic","retapamulin","amoxicillin","cephalexin","clindamycin","gentamicin","neomycin","এন্টিবায়োটিক","অ্যান্টিবায়োটিক","মিউপিরোসিন","ফুসিডিক"] },
  { name: "antihistamine", terms: ["antihistamine","antihistamines","diphenhydramine","এন্টি হিস্টামিন","অ্যান্টিহিস্টামিন","হিস্টামিন"] },
  { name: "sunscreen / sunblock", terms: ["sunscreen","sunblock","sunblocks","spf","sunmask","ultraviolet","সানব্লক","সানস্ক্রিন","আল্ট্রাভায়োলেট","সানমাস্ক"] },
  { name: "salicylic acid / keratolytic", terms: ["salicylic","keratolytic","keratolytics","salicid","prosalic","স্যালিসাইলিক","কেরাটোলাইটিক","কেরাটোলাইটিক্স"] },
  { name: "tacrolimus", terms: ["tacrolimus","remus","ট্যাক্রোলিমাস","ট্যাকরোলিমাস"] },
  { name: "minoxidil", terms: ["minoxidil","splendora","মিনোক্সিডিল"] },
  { name: "retinoid", terms: ["retinoid","retinoids","tretinoin","adapalene","isotretinoin","retinoic","রেটিনয়েড","রেটিনয়িক","আইসোট্রেটিনইন"] },
  { name: "phototherapy / light treatment", terms: ["phototherapy","photochemotherapy","puva","light treatment","ফটোথেরাপি","ফটোকেমোথেরাপি","আলোকরশ্মি"] },
  { name: "cryotherapy / physical removal", terms: ["cryotherapy","electrosurgery","curettage","excision","laser","ক্রায়োথেরাপি","ইলেকট্রোসার্জারি","কিউরেটেজ","লেজার"] },
  { name: "permethrin / ivermectin", terms: ["permethrin","ivermectin","crotamiton","scabex","পারমেথ্রিন","ইভারমেকটিন","ক্রোটামিটন"] },
  { name: "vitamin D analogue", terms: ["calcipotriol","vitamin d","dyvon","ক্যালসিপোট্রিয়ল","ভিটামিন ডি"] },
];

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

const sizeLabel = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k characters` : `${n} characters`);

// ---------- text utilities ----------
const normalize = (s) =>
  s.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?"'“”‘’।]/g, " ").replace(/\s+/g, " ").trim();
const tokenize = (s) => normalize(s).split(" ").filter((w) => w.length > 1);

function chunkText(text, bookName, category) {
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
  return chunks.map((c, i) => ({ book: bookName, category, idx: i, text: c }));
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
  if (!first || first.s < 6) return null;
  if (second && second.s > 0 && first.s < second.s * 1.5) return null;
  return first.d;
}

function detectConcept(question) {
  const q = normalize(question);
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

function retrieveByConcept(group, allChunks, maxChunks = 24) {
  return allChunks.filter((c) => {
    const t = c.text.toLowerCase();
    return group.terms.some((term) => t.includes(term.toLowerCase().trim()));
  }).slice(0, maxChunks);
}

// ---------- language & typo helpers ----------
const hasBengali = (s) => /[ঀ-৿]/.test(s);

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
  if (exact.size > 0) return [];
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
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);
  const [zoom, setZoom] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [activeClassId, setActiveClassId] = useState(null); // null = show the gate

  // admin
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [passInput, setPassInput] = useState("");
  const [adminTab, setAdminTab] = useState("sources");
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadClass, setUploadClass] = useState("");
  const [draft, setDraft] = useState(DEFAULT_SETTINGS);
  const [flash, setFlash] = useState("");
  const [pasteName, setPasteName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [newClass, setNewClass] = useState({ name: "", bn: "", specialist: "" });

  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  const classes = settings.classes?.length ? settings.classes : DEFAULT_CLASSES;
  const fallbackClassId = classes[0]?.id;
  // Sources saved before therapeutic classes existed fall back to the first class.
  const bookClass = (b) => b.category || fallbackClassId;
  const activeClass = classes.find((c) => c.id === activeClassId) || null;
  const classBooks = (id) => books.filter((b) => bookClass(b) === id);

  useEffect(() => {
    (async () => {
      try {
        const { settings: s, books: b } = await apiGetData();
        const merged = { ...DEFAULT_SETTINGS, ...(s || {}) };
        if (!merged.classes?.length) merged.classes = DEFAULT_CLASSES;
        setSettings(merged); setDraft(merged); setBooks(b || []);
        setDataLoaded(true);
      } catch (e) { setLoadError(e.message); }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setZoom(null); };
    const onInstall = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeinstallprompt", onInstall); };
  }, []);

  const showFlash = (msg) => { setFlash(msg); setTimeout(() => setFlash(""), 2600); };

  const refreshBooks = async () => {
    try { const { books: b } = await apiGetData(); setBooks(b || []); } catch { /* keep current */ }
  };

  const addBook = async (name, text, category) => {
    if (!dataLoaded) { showFlash("Still loading — please wait a moment"); return false; }
    if (!category) { showFlash("Select a therapeutic class first"); return false; }
    await apiAdmin(adminPass, { action: "addBook", book: { name, text, category } });
    await refreshBooks();
    return true;
  };

  const removeBook = async (name) => {
    if (!window.confirm(`Remove "${name}" from the knowledge base?`)) return;
    try {
      await apiAdmin(adminPass, { action: "removeBook", name });
      await refreshBooks();
      showFlash("Removed");
    } catch (e) { showFlash("Remove failed: " + e.message); }
  };

  const changeBookClass = async (name, category) => {
    try {
      await apiAdmin(adminPass, { action: "setBookCategory", name, category });
      await refreshBooks();
      showFlash("Class updated");
    } catch (e) { showFlash("Update failed: " + e.message); }
  };

  const onAdminFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!uploadClass) { setUploadStatus("✕ Select a therapeutic class before uploading"); return; }
    setUploadStatus(`Processing ${f.name}…`);
    try {
      const text = await fileToText(f, setUploadStatus, adminPass);
      const name = f.name.replace(/\.[^.]+$/, "");
      const ok = await addBook(name, text, uploadClass);
      if (ok) {
        const cls = classes.find((c) => c.id === uploadClass);
        setUploadStatus(`✓ Added "${name}" (${Math.round(text.length / 1000)}k characters) to ${cls?.name || uploadClass}`);
      }
    } catch (err) { setUploadStatus(`✕ ${err.message}`); }
  };

  const saveSettings = async (overrides) => {
    const base = overrides || draft;
    const clean = { ...base, classes: (base.classes || []).map((c) => ({ ...c, chips: Array.isArray(c.chips) ? c.chips : String(c.chips || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 6) })) };
    try {
      await apiAdmin(adminPass, { action: "save", key: "settings", value: clean });
      setSettings(clean); setDraft(clean); showFlash("Saved");
    } catch (e) { showFlash("Save failed: " + e.message); }
  };

  const tryUnlock = async () => {
    try {
      await apiAdmin(passInput, { action: "verify" });
      setAdminPass(passInput); setAdminAuthed(true); setPassInput("");
      setUploadClass(classes[0]?.id || "");
    } catch { showFlash("Wrong passcode"); }
  };

  const startClass = (id) => {
    setActiveClassId(id);
    setMessages([]);
    setInput("");
  };

  const ask = async () => {
    const q = input.trim();
    if (!q || busy || !activeClass) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);

    // Only this therapeutic class's sources are searched.
    const scoped = classBooks(activeClass.id).flatMap((b) => chunkText(b.text, b.name, bookClass(b)));

    const langRule = hasBengali(q)
      ? "The user wrote in Bangla. You MUST reply entirely in natural, fluent Bangla (বাংলা)."
      : "The user wrote in Latin script. If the message is English, reply entirely in English. If it is Bangla typed with English letters (Banglish), reply in Bangla.";

    const sugg = activeClass.images ? fuzzyDiseaseSuggestions(q) : [];
    const suggNames = sugg.map((d) => `${d.en} (${d.bn})`).join(", ");

    const retrievalQuery =
      (q.length < 25 ? messages.slice(-4).map((m) => m.text).join(" ") + " " : "") +
      q +
      (sugg.length ? " " + sugg.map((d) => d.en + " " + d.bn + " " + d.keywords.join(" ")).join(" ") : "");

    const concept = detectConcept(q);
    let hits = concept ? retrieveByConcept(concept, scoped) : retrieve(retrievalQuery, scoped, 8);
    if (concept && hits.length === 0) hits = retrieve(retrievalQuery, scoped, 8);

    let context = hits.length ? hits.map((h) => h.text).join("\n\n---\n\n") : "(no matching information found)";
    if (context.length > 28000) context = context.slice(0, 28000);

    const conceptRule = concept
      ? `\nTHIS IS AN OVERVIEW QUESTION about "${concept.name}". The passages below come from across the whole knowledge base. List EVERY condition in them where this is used or recommended — do not stop at one or two. Give a one-line reason for each, group related conditions together, and start with a short plain-language explanation of what it does and why it helps. End with [topic: none] since the answer covers many conditions.\n`
      : "";

    const topicRule = activeClass.images
      ? `\n8. TOPIC TAG (required): after your complete answer, on a new final line, write exactly [topic: <id>] where <id> is the ONE condition your answer is mainly about, chosen ONLY from this list: ${DISEASES.map((d) => d.id).join(", ")}. If the message is a greeting, small talk, or your answer is not mainly about one of these conditions, write [topic: none]. This line is hidden from the user.`
      : "";

    const historyText = messages.slice(-6).map((m) => `${m.role === "user" ? "User" : "You"}: ${m.text}`).join("\n");

    const prompt = `You are the assistant behind "${settings.appName}", answering questions in the ${activeClass.name} (${activeClass.bn}) therapeutic area for users in Bangladesh. You are warm, friendly and professional.

HOW TO ANSWER:
1. Base your answer ONLY on the reference information below. Never invent facts, doses, or medicine names that are not in it.
2. Speak naturally and conversationally, like a caring pharmacist explaining things to a person. NEVER mention "the book", "the text", "excerpts", "sources", "documents" or "reference". Answer as if this is your own knowledge.
3. LANGUAGE (strict): ${langRule} Do not mix languages, except medicine/product names which may stay in English.
4. Keep answers clear and human — short paragraphs; a short list only when listing symptoms or treatment options.
5. If the user greets you or makes small talk, respond warmly and invite them to ask about this area.
6. This conversation is limited to ${activeClass.name}. If the question is about a different medical area, or is not covered by the reference information, say honestly and kindly that you don't have details on that here, and suggest consulting a ${activeClass.specialist}. Do not guess.
7. For treatment questions, you may end with one brief caring reminder to consult a doctor before using medicines, when natural — not every message.${topicRule}
${conceptRule}${sugg.length ? `IMPORTANT — POSSIBLE MISSPELLING: The user's message seems to contain a misspelled condition name. Most likely they mean: ${suggNames}. Do NOT give the full answer yet. Reply with ONE short, friendly question confirming which condition they mean (in the user's language, e.g. "আপনি কি সোরিয়াসিস (Psoriasis) বুঝাতে চেয়েছেন?" / "Did you mean Psoriasis?"). If there are multiple likely options, list them briefly. End this confirmation message with [topic: none].\n\n` : ""}${historyText ? `Conversation so far:\n${historyText}\n\n` : ""}REFERENCE INFORMATION (never mention it):
${context}

User's message: ${q}`;

    try {
      const data = await apiClaude([{ role: "user", content: prompt }]);
      let answer = (data.content || []).map((c) => (c.type === "text" ? c.text : "")).filter(Boolean).join("\n");
      let disease = null;
      const tagMatch = answer.match(/\[\s*topic\s*:\s*([a-z_]+)\s*\]\s*$/i);
      if (tagMatch) {
        answer = answer.slice(0, tagMatch.index).trim();
        const id = tagMatch[1].toLowerCase();
        if (id !== "none" && activeClass.images) disease = DISEASES.find((d) => d.id === id) || null;
      } else if (activeClass.images) {
        disease = detectDisease(q + " " + answer);
      }
      setMessages((m) => [...m, { role: "assistant", text: answer || "Something went wrong — please try again.", disease }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "I couldn't connect just now. Please check your internet and try again." }]);
    }
    setBusy(false);
  };

  // ---------- design tokens ----------
  const A = activeClass?.color || settings.accent || "#0F9B8E";
  const S = { ink: "#0B1220", body: "#334155", sub: "#64748B", line: "#E6EBF1", card: "#FFFFFF" };
  const grad = `linear-gradient(135deg, ${A}, ${A}CC)`;
  const shell = {
    minHeight: "100dvh",
    background: "radial-gradient(1200px 600px at 15% -5%, #EEF6F7 0%, transparent 60%), linear-gradient(175deg, #FBFDFE 0%, #F2F6F8 100%)",
    color: S.ink,
    fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, 'Noto Sans Bengali', sans-serif",
    display: "flex", flexDirection: "column",
  };
  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "11px 14px", border: `1px solid ${S.line}`, borderRadius: 12, fontSize: 13.5, outline: "none", fontFamily: "inherit", color: S.ink, background: "#fff" };
  const labelStyle = { fontSize: 11, fontWeight: 700, color: S.sub, textTransform: "uppercase", letterSpacing: 0.7, display: "block", margin: "16px 0 6px" };
  const miniLabel = { fontSize: 10.5, fontWeight: 650, color: "#8B98A8", letterSpacing: 0.4, display: "block", marginBottom: 4 };
  const btn = (bg, fg = "#fff") => ({ background: bg, color: fg, border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 13.5, fontWeight: 650, cursor: "pointer" });
  // Two letters from the first word, so every class tile reads the same way.
  const monogram = (c) => {
    const w = (c.name || "?").replace(/[^A-Za-z ]/g, "").trim().split(" ")[0] || "?";
    return (w[0] || "?").toUpperCase() + (w[1] || "").toLowerCase();
  };

  const globalCss = `
    @keyframes blink { 0%,80%,100%{opacity:.25;transform:translateY(0)} 40%{opacity:1;transform:translateY(-3px)} }
    @keyframes pop { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    .msg { animation: pop .26s cubic-bezier(.2,.7,.3,1) both; }
    .tile { transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease; }
    .tile:hover { transform: translateY(-3px); box-shadow: 0 14px 34px rgba(11,18,32,.10); }
    input::placeholder, textarea::placeholder { color:#94A3B8; }
    button { font-family: inherit; }
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-thumb { background: #D7DEE6; border-radius: 10px; border: 3px solid transparent; background-clip: content-box; }
  `;

  const adminLink = (
    <button onClick={() => setAdminOpen(true)}
      style={{ background: "none", border: "none", color: "#B6C2CF", fontSize: 11, cursor: "pointer", padding: "4px 6px", letterSpacing: 0.3 }}>
      Admin
    </button>
  );

  // ================= THERAPEUTIC CLASS GATE =================
  if (!activeClassId) {
    return (
      <div style={shell}>
        <style>{globalCss}</style>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
          <div style={{ width: "100%", maxWidth: 820 }}>
            <div style={{ textAlign: "center", marginBottom: 34 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 18, margin: "0 auto 16px",
                background: `linear-gradient(135deg, ${settings.accent}, ${settings.accent}BB)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 26, boxShadow: `0 10px 26px ${settings.accent}44`,
              }}>✚</div>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.6, color: S.sub, textTransform: "uppercase" }}>{settings.appName}</div>
              <h1 style={{ fontSize: 30, lineHeight: 1.2, letterSpacing: -0.6, margin: "10px 0 8px", fontWeight: 750 }}>{settings.gateHeading}</h1>
              <p style={{ fontSize: 14.5, color: S.body, maxWidth: 480, margin: "0 auto", lineHeight: 1.65 }}>{settings.gateSub}</p>
            </div>

            {loadError ? (
              <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 16, padding: "16px 20px", fontSize: 13.5, textAlign: "center" }}>
                Couldn't reach the server. Please refresh in a moment.
              </div>
            ) : !loaded ? (
              <div style={{ textAlign: "center", color: S.sub, fontSize: 13.5 }}>Loading…</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
                {classes.map((c) => {
                  const count = classBooks(c.id).length;
                  const ready = count > 0;
                  return (
                    <button key={c.id} className={ready ? "tile" : ""} disabled={!ready}
                      onClick={() => ready && startClass(c.id)}
                      style={{
                        textAlign: "left", background: S.card,
                        border: `1px solid ${ready ? S.line : "#EDF1F5"}`,
                        borderRadius: 18, padding: "18px 18px 16px", cursor: ready ? "pointer" : "default",
                        opacity: ready ? 1 : 0.55,
                        boxShadow: ready ? "0 2px 10px rgba(11,18,32,.04)" : "none",
                        display: "flex", flexDirection: "column", gap: 12, minHeight: 132,
                      }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: 13, flexShrink: 0,
                        background: ready ? `linear-gradient(135deg, ${c.color}, ${c.color}BB)` : "#E2E8F0",
                        color: "#fff", fontWeight: 750, fontSize: 15, letterSpacing: 0.5,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{monogram(c)}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15.5, letterSpacing: -0.2 }}>{c.name}</div>
                        <div style={{ fontSize: 13, color: S.sub, marginTop: 2 }}>{c.bn}</div>
                      </div>
                      <div style={{ marginTop: "auto", fontSize: 11.5, fontWeight: 650, color: ready ? c.color : "#94A3B8", letterSpacing: 0.3 }}>
                        {ready ? `${count} source${count > 1 ? "s" : ""} available` : "Content coming soon"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 28, display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11.5, color: "#94A3B8", textAlign: "center" }}>{settings.disclaimer}</span>
              {adminLink}
            </div>
          </div>
        </div>
        {adminOpen && renderAdmin()}
      </div>
    );
  }

  // ================= CHAT =================
  const chips = (activeClass.chips && activeClass.chips.length ? activeClass.chips : []).slice(0, 6);
  const hasSources = classBooks(activeClass.id).length > 0;

  return (
    <div style={shell}>
      <style>{globalCss}</style>

      <header style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "rgba(255,255,255,0.82)", backdropFilter: "blur(14px)",
        borderBottom: `1px solid ${S.line}`,
        padding: "11px 16px", paddingTop: "calc(11px + env(safe-area-inset-top))",
        display: "flex", alignItems: "center", gap: 11,
      }}>
        <div style={{ width: 38, height: 38, borderRadius: 13, background: grad, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 18, boxShadow: `0 6px 16px ${A}40`, flexShrink: 0 }}>✚</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5, letterSpacing: -0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{settings.appName}</div>
          <div style={{ fontSize: 11.5, color: S.sub }}>{settings.tagline}</div>
        </div>
        <button onClick={() => setActiveClassId(null)} title="Change therapeutic area"
          style={{
            display: "flex", alignItems: "center", gap: 7, background: `${A}12`,
            border: `1px solid ${A}33`, borderRadius: 999, padding: "7px 13px",
            fontSize: 12.5, fontWeight: 650, color: A, cursor: "pointer", maxWidth: 190,
          }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: A, flexShrink: 0 }} />
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{activeClass.name}</span>
          <span style={{ opacity: 0.65, fontSize: 11 }}>▾</span>
        </button>
        {installPrompt && (
          <button onClick={async () => { installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); }}
            style={{ ...btn(grad), padding: "8px 13px", fontSize: 12, borderRadius: 999 }}>Install</button>
        )}
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "26px 16px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {messages.length === 0 && (
            <div style={{ textAlign: "center", marginTop: 34 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 16, margin: "0 auto 14px",
                background: `${A}14`, border: `1px solid ${A}2E`, color: A,
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 750, fontSize: 16,
              }}>{monogram(activeClass)}</div>
              <div style={{ fontWeight: 720, fontSize: 21, letterSpacing: -0.4 }}>
                Ask about {activeClass.name.toLowerCase()}
              </div>
              <p style={{ fontSize: 14, color: S.body, maxWidth: 420, margin: "8px auto 20px", lineHeight: 1.65 }}>
                Symptoms, causes or treatment — English বা বাংলা, যেভাবে সুবিধা।
              </p>
              {!hasSources ? (
                <div style={{ fontSize: 13, color: S.sub, background: S.card, border: `1px solid ${S.line}`, borderRadius: 14, padding: "14px 18px", display: "inline-block" }}>
                  No content has been added for this area yet.
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  {chips.map((s) => (
                    <button key={s} onClick={() => setInput(s)} style={{
                      background: S.card, border: `1px solid ${S.line}`, borderRadius: 999,
                      padding: "9px 16px", fontSize: 13, cursor: "pointer", color: S.body,
                      boxShadow: "0 1px 3px rgba(11,18,32,.04)",
                    }}>{s}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className="msg" style={{ margin: "16px 0", display: "flex", gap: 10, justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              {m.role === "assistant" && (
                <div style={{ width: 30, height: 30, borderRadius: 11, flexShrink: 0, marginTop: 3, background: grad, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14 }}>✚</div>
              )}
              <div style={{ maxWidth: "84%" }}>
                {m.role === "assistant" && m.disease && DISEASE_IMAGES[m.disease.id] && (
                  <div onClick={() => setZoom(m.disease)} title="Tap to enlarge" style={{
                    background: S.card, border: `1px solid ${S.line}`, borderRadius: 18,
                    padding: 9, marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 12,
                    boxShadow: "0 2px 10px rgba(11,18,32,.05)", cursor: "zoom-in",
                  }}>
                    <div style={{ position: "relative" }}>
                      <img src={DISEASE_IMAGES[m.disease.id]} alt={m.disease.en}
                        style={{ width: 88, height: 88, borderRadius: 13, objectFit: "cover", display: "block" }} />
                      <div style={{ position: "absolute", right: 5, bottom: 5, width: 21, height: 21, borderRadius: 8, background: "rgba(11,18,32,0.58)", color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>⤢</div>
                    </div>
                    <div style={{ paddingRight: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.disease.en}</div>
                      <div style={{ fontSize: 12.5, color: S.sub }}>{m.disease.bn}</div>
                      <div style={{ fontSize: 11, color: "#A3AEBB", marginTop: 3 }}>Tap to enlarge</div>
                    </div>
                  </div>
                )}
                <div style={{
                  background: m.role === "user" ? grad : S.card,
                  color: m.role === "user" ? "#fff" : S.body,
                  border: m.role === "user" ? "none" : `1px solid ${S.line}`,
                  borderRadius: m.role === "user" ? "20px 20px 6px 20px" : "20px 20px 20px 6px",
                  padding: "13px 17px", fontSize: 14.5, lineHeight: 1.7, whiteSpace: "pre-wrap",
                  boxShadow: m.role === "user" ? `0 4px 14px ${A}38` : "0 2px 10px rgba(11,18,32,.05)",
                }}>{m.text}</div>
              </div>
            </div>
          ))}

          {busy && (
            <div className="msg" style={{ display: "flex", gap: 10, margin: "16px 0" }}>
              <div style={{ width: 30, height: 30, borderRadius: 11, background: grad, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14 }}>✚</div>
              <div style={{ background: S.card, border: `1px solid ${S.line}`, borderRadius: "20px 20px 20px 6px", padding: "16px 18px", display: "flex", gap: 5 }}>
                {[0, 1, 2].map((d) => <span key={d} style={{ width: 7, height: 7, borderRadius: "50%", background: A, animation: `blink 1.2s ${d * 0.2}s infinite` }} />)}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer style={{ padding: "12px 16px", paddingBottom: "calc(14px + env(safe-area-inset-bottom))" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", background: S.card, border: `1px solid ${S.line}`, borderRadius: 999, boxShadow: "0 8px 28px rgba(11,18,32,.08)", display: "flex", alignItems: "center", padding: "6px 6px 6px 20px", gap: 8 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder={hasSources ? "Ask a question… / প্রশ্ন লিখুন…" : "No content in this area yet"}
            disabled={!hasSources}
            style={{ flex: 1, border: "none", outline: "none", fontSize: 14.5, background: "transparent", color: S.ink, minWidth: 0 }} />
          <button onClick={ask} disabled={busy || !input.trim()} style={{
            width: 42, height: 42, borderRadius: "50%", border: "none",
            background: busy || !input.trim() ? "#CBD5E1" : grad,
            color: "#fff", fontSize: 16, cursor: busy || !input.trim() ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>➤</button>
        </div>
        <div style={{ maxWidth: 720, margin: "9px auto 0", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#94A3B8" }}>
          <span style={{ flex: 1, textAlign: "center" }}>{settings.disclaimer}</span>
          {adminLink}
        </div>
      </footer>

      {zoom && DISEASE_IMAGES[zoom.id] && (
        <div onClick={() => setZoom(null)} style={{
          position: "fixed", inset: 0, zIndex: 100, background: "rgba(8,13,22,0.84)", backdropFilter: "blur(7px)",
          display: "flex", alignItems: "center", justifyContent: "center", animation: "pop .18s ease both", cursor: "zoom-out", padding: 20,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 22, padding: 14, maxWidth: "min(92vw, 560px)", boxShadow: "0 24px 80px rgba(0,0,0,0.45)", cursor: "default" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{zoom.en}</div>
                <div style={{ fontSize: 13, color: S.sub }}>{zoom.bn}</div>
              </div>
              <button onClick={() => setZoom(null)} style={{ width: 34, height: 34, borderRadius: 12, border: `1px solid ${S.line}`, background: "#F8FAFC", fontSize: 15, cursor: "pointer" }}>✕</button>
            </div>
            <img src={DISEASE_IMAGES[zoom.id]} alt={zoom.en} style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 16, display: "block", background: "#F1F5F9" }} />
            <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 8, textAlign: "center" }}>Tap outside to close</div>
          </div>
        </div>
      )}

      {adminOpen && renderAdmin()}
    </div>
  );

  // ================= ADMIN PANEL =================
  function renderAdmin() {
    const unassigned = books.filter((b) => !b.category).length;
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(8,13,22,0.6)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ background: "#fff", borderRadius: 22, width: "min(94vw, 660px)", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.4)", animation: "pop .2s ease both" }}>
          <div style={{ padding: "16px 22px", borderBottom: `1px solid ${S.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 2, borderRadius: "22px 22px 0 0" }}>
            <div style={{ fontWeight: 760, fontSize: 16 }}>Admin panel</div>
            <button onClick={() => { setAdminOpen(false); setAdminAuthed(false); setAdminPass(""); setPassInput(""); }}
              style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${S.line}`, background: "#F8FAFC", cursor: "pointer" }}>✕</button>
          </div>

          {!adminAuthed ? (
            <div style={{ padding: "32px 22px 36px", textAlign: "center" }}>
              <div style={{ fontSize: 34 }}>🔐</div>
              <div style={{ fontWeight: 700, marginTop: 8 }}>Administrator access</div>
              <p style={{ fontSize: 13, color: S.sub }}>Enter the admin passcode to manage this platform.</p>
              <input type="password" value={passInput} onChange={(e) => setPassInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
                placeholder="Passcode" style={{ ...inputStyle, maxWidth: 240, margin: "10px auto 0", textAlign: "center" }} />
              <div><button onClick={tryUnlock} style={{ ...btn(`linear-gradient(135deg, ${settings.accent}, ${settings.accent}CC)`), marginTop: 12 }}>Unlock</button></div>
              {flash && <div style={{ marginTop: 10, fontSize: 12.5, color: "#B91C1C" }}>{flash}</div>}
            </div>
          ) : (
            <div style={{ padding: "16px 22px 26px" }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                {[["sources", "Sources"], ["classes", "Therapeutic classes"], ["branding", "Branding"], ["security", "Security"]].map(([id, label]) => (
                  <button key={id} onClick={() => setAdminTab(id)} style={{
                    padding: "8px 15px", borderRadius: 999, fontSize: 12.5, fontWeight: 650, cursor: "pointer",
                    border: `1px solid ${adminTab === id ? settings.accent : S.line}`,
                    background: adminTab === id ? settings.accent : "#fff", color: adminTab === id ? "#fff" : S.body,
                  }}>{label}</button>
                ))}
              </div>

              {/* ---------- SOURCES ---------- */}
              {adminTab === "sources" && (
                <div>
                  <p style={{ fontSize: 13, color: S.sub, marginTop: 0, lineHeight: 1.6 }}>
                    Every source belongs to one therapeutic class, and users only ever search within the class they pick.
                    Supported: <b>.txt, .md, .docx, .pdf, .csv, .xlsx</b>
                  </p>
                  {!dataLoaded && (
                    <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 12, padding: "10px 14px", fontSize: 12.5, marginBottom: 10 }}>
                      Couldn't load the current sources from the server. Uploading is disabled until this page loads them — please refresh.
                    </div>
                  )}
                  {unassigned > 0 && (
                    <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "10px 14px", fontSize: 12.5, marginBottom: 10, color: "#1E40AF" }}>
                      {unassigned} older source{unassigned > 1 ? "s are" : " is"} showing under <b>{classes[0]?.name}</b> by default. Set the correct class below.
                    </div>
                  )}

                  {classes.map((c) => {
                    const list = classBooks(c.id);
                    if (!list.length) return null;
                    return (
                      <div key={c.id} style={{ marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 7px" }}>
                          <span style={{ width: 9, height: 9, borderRadius: 3, background: c.color }} />
                          <span style={{ fontSize: 12, fontWeight: 720, letterSpacing: 0.4, textTransform: "uppercase", color: S.sub }}>{c.name}</span>
                        </div>
                        {list.map((b) => (
                          <div key={b.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#F8FAFC", border: `1px solid ${S.line}`, borderRadius: 14, padding: "10px 12px", marginBottom: 7, flexWrap: "wrap" }}>
                            <div style={{ minWidth: 150, flex: 1 }}>
                              <div style={{ fontWeight: 650, fontSize: 13.5 }}>{b.name}</div>
                              <div style={{ fontSize: 11.5, color: S.sub }}>{sizeLabel(b.text.length)}{!b.category && " · class not set"}</div>
                            </div>
                            <select value={bookClass(b)} onChange={(e) => changeBookClass(b.name, e.target.value)}
                              style={{ ...inputStyle, width: "auto", padding: "7px 10px", fontSize: 12.5, borderRadius: 10 }}>
                              {classes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                            <button onClick={() => removeBook(b.name)}
                              style={{ background: "transparent", border: `1px solid ${S.line}`, borderRadius: 10, padding: "7px 12px", fontSize: 12, cursor: "pointer", color: "#B91C1C" }}>Remove</button>
                          </div>
                        ))}
                      </div>
                    );
                  })}

                  {books.length === 0 && (
                    <div style={{ fontSize: 13, color: S.sub, padding: "8px 0" }}>
                      No sources yet.{" "}
                      <button onClick={async () => { try { const r = await apiAdmin(adminPass, { action: "restoreBooks" }); await refreshBooks(); showFlash(`Restored ${r.restored} source(s)`); } catch (e) { showFlash(e.message); } }}
                        style={{ background: "none", border: "none", color: settings.accent, fontWeight: 700, fontSize: 13, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                        Restore last backup
                      </button>
                    </div>
                  )}

                  <div style={{ borderTop: `1px solid ${S.line}`, marginTop: 18, paddingTop: 4 }}>
                    <label style={labelStyle}>Add a source — step 1: therapeutic class</label>
                    <select value={uploadClass} onChange={(e) => setUploadClass(e.target.value)} style={inputStyle}>
                      <option value="">Select a class…</option>
                      {classes.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.bn}</option>)}
                    </select>

                    <label style={labelStyle}>Step 2: upload a file, or paste text</label>
                    <button onClick={() => fileRef.current?.click()} disabled={!uploadClass}
                      style={{ ...btn(uploadClass ? `linear-gradient(135deg, ${settings.accent}, ${settings.accent}CC)` : "#CBD5E1"), cursor: uploadClass ? "pointer" : "default" }}>
                      Upload source file
                    </button>
                    <input ref={fileRef} type="file" accept=".txt,.md,.docx,.pdf,.csv,.xlsx,.xls" onChange={onAdminFile} style={{ display: "none" }} />
                    {uploadStatus && <div style={{ fontSize: 12.5, marginTop: 10, color: uploadStatus.startsWith("✕") ? "#B91C1C" : S.sub }}>{uploadStatus}</div>}

                    <input value={pasteName} onChange={(e) => setPasteName(e.target.value)} placeholder="Source name" style={{ ...inputStyle, marginTop: 12, marginBottom: 8 }} />
                    <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste content…" rows={4} style={{ ...inputStyle, resize: "vertical" }} />
                    <button disabled={!pasteText.trim() || !uploadClass}
                      onClick={async () => {
                        const n = pasteName.trim() || "Pasted source";
                        try { const ok = await addBook(n, pasteText, uploadClass); if (ok) { setPasteName(""); setPasteText(""); showFlash("Added"); } }
                        catch (e) { showFlash("Save failed: " + e.message); }
                      }}
                      style={{ ...btn(pasteText.trim() && uploadClass ? S.ink : "#CBD5E1"), marginTop: 8, padding: "10px 18px", fontSize: 13 }}>
                      Add pasted text
                    </button>
                    {flash && <div style={{ marginTop: 10, fontSize: 12.5, color: settings.accent, fontWeight: 650 }}>{flash}</div>}
                  </div>
                </div>
              )}

              {/* ---------- CLASSES ---------- */}
              {adminTab === "classes" && (
                <div>
                  <p style={{ fontSize: 13, color: S.sub, marginTop: 0, lineHeight: 1.6 }}>
                    These are the areas users choose from before starting a chat. A class with no sources shows as "coming soon".
                  </p>
                  {(draft.classes || []).map((c, i) => (
                    <div key={c.id} style={{ background: "#F8FAFC", border: `1px solid ${S.line}`, borderRadius: 14, padding: "12px 14px", marginBottom: 9 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                        <span style={{ width: 28, height: 28, borderRadius: 9, background: c.color, color: "#fff", fontSize: 11, fontWeight: 750, display: "flex", alignItems: "center", justifyContent: "center" }}>{monogram(c)}</span>
                        <b style={{ fontSize: 13.5, flex: 1 }}>{c.name}</b>
                        <span style={{ fontSize: 11.5, color: S.sub }}>{classBooks(c.id).length} source(s)</span>
                        <button onClick={() => {
                          if (classBooks(c.id).length) { showFlash("Remove its sources first"); return; }
                          const next = { ...draft, classes: draft.classes.filter((x) => x.id !== c.id) };
                          setDraft(next); saveSettings(next);
                        }} style={{ background: "transparent", border: `1px solid ${S.line}`, borderRadius: 9, padding: "5px 10px", fontSize: 11.5, cursor: "pointer", color: "#B91C1C" }}>Remove</button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <span style={miniLabel}>Name (English)</span>
                          <input value={c.name} onChange={(e) => { const cl = [...draft.classes]; cl[i] = { ...c, name: e.target.value }; setDraft({ ...draft, classes: cl }); }} placeholder="English name" style={{ ...inputStyle, fontSize: 12.5 }} />
                        </div>
                        <div>
                          <span style={miniLabel}>Name (বাংলা)</span>
                          <input value={c.bn} onChange={(e) => { const cl = [...draft.classes]; cl[i] = { ...c, bn: e.target.value }; setDraft({ ...draft, classes: cl }); }} placeholder="বাংলা নাম" style={{ ...inputStyle, fontSize: 12.5 }} />
                        </div>
                      </div>
                      <span style={{ ...miniLabel, marginTop: 9 }}>Refer users to this specialist</span>
                      <input value={c.specialist} onChange={(e) => { const cl = [...draft.classes]; cl[i] = { ...c, specialist: e.target.value }; setDraft({ ...draft, classes: cl }); }}
                        placeholder="e.g. dermatologist" style={{ ...inputStyle, fontSize: 12.5 }} />
                      <span style={{ ...miniLabel, marginTop: 9 }}>Suggested questions (one per line)</span>
                      <textarea value={Array.isArray(c.chips) ? c.chips.join("\n") : c.chips || ""}
                        onChange={(e) => { const cl = [...draft.classes]; cl[i] = { ...c, chips: e.target.value.split("\n") }; setDraft({ ...draft, classes: cl }); }}
                        placeholder="দাদ এর চিকিৎসা কী?" rows={3} style={{ ...inputStyle, fontSize: 12.5, resize: "vertical" }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11.5, color: S.sub }}>Colour</span>
                        {["#0F9B8E", "#2563EB", "#DC2626", "#D97706", "#0891B2", "#7C3AED", "#16A34A"].map((col) => (
                          <button key={col} onClick={() => { const cl = [...draft.classes]; cl[i] = { ...c, color: col }; setDraft({ ...draft, classes: cl }); }}
                            style={{ width: 22, height: 22, borderRadius: 7, background: col, border: c.color === col ? `3px solid ${S.ink}` : "3px solid transparent", cursor: "pointer" }} />
                        ))}
                        <label style={{ fontSize: 11.5, color: S.sub, display: "flex", alignItems: "center", gap: 5, marginLeft: "auto" }}>
                          <input type="checkbox" checked={!!c.images} onChange={(e) => { const cl = [...draft.classes]; cl[i] = { ...c, images: e.target.checked }; setDraft({ ...draft, classes: cl }); }} />
                          Show skin-disease photos
                        </label>
                      </div>
                    </div>
                  ))}

                  <button onClick={() => saveSettings()} style={{ ...btn(`linear-gradient(135deg, ${settings.accent}, ${settings.accent}CC)`), marginTop: 6 }}>Save classes</button>
                  {flash && <span style={{ marginLeft: 12, fontSize: 13, color: settings.accent, fontWeight: 650 }}>{flash}</span>}

                  <label style={labelStyle}>Add a new class</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input value={newClass.name} onChange={(e) => setNewClass({ ...newClass, name: e.target.value })} placeholder="English name" style={{ ...inputStyle, fontSize: 12.5 }} />
                    <input value={newClass.bn} onChange={(e) => setNewClass({ ...newClass, bn: e.target.value })} placeholder="বাংলা নাম" style={{ ...inputStyle, fontSize: 12.5 }} />
                  </div>
                  <input value={newClass.specialist} onChange={(e) => setNewClass({ ...newClass, specialist: e.target.value })} placeholder="Specialist to refer to" style={{ ...inputStyle, fontSize: 12.5, marginTop: 8 }} />
                  <button disabled={!newClass.name.trim()}
                    onClick={() => {
                      const id = newClass.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `class-${Date.now()}`;
                      if ((draft.classes || []).some((c) => c.id === id)) { showFlash("That class already exists"); return; }
                      const palette = ["#0F9B8E", "#2563EB", "#DC2626", "#D97706", "#0891B2", "#7C3AED", "#16A34A"];
                      const next = { ...draft, classes: [...(draft.classes || []), {
                        id, name: newClass.name.trim(), bn: newClass.bn.trim() || newClass.name.trim(),
                        specialist: newClass.specialist.trim() || "doctor",
                        color: palette[(draft.classes || []).length % palette.length], images: false, chips: [],
                      }] };
                      setDraft(next); saveSettings(next); setNewClass({ name: "", bn: "", specialist: "" });
                    }}
                    style={{ ...btn(newClass.name.trim() ? S.ink : "#CBD5E1"), marginTop: 8, padding: "10px 18px", fontSize: 13 }}>
                    Add class
                  </button>
                </div>
              )}

              {/* ---------- BRANDING ---------- */}
              {adminTab === "branding" && (
                <div>
                  <label style={labelStyle}>App name</label>
                  <input value={draft.appName} onChange={(e) => setDraft({ ...draft, appName: e.target.value })} style={inputStyle} />
                  <label style={labelStyle}>Tagline</label>
                  <input value={draft.tagline} onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} style={inputStyle} />
                  <label style={labelStyle}>Start screen heading</label>
                  <input value={draft.gateHeading} onChange={(e) => setDraft({ ...draft, gateHeading: e.target.value })} style={inputStyle} />
                  <label style={labelStyle}>Start screen subtitle</label>
                  <textarea value={draft.gateSub} onChange={(e) => setDraft({ ...draft, gateSub: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
                  <label style={labelStyle}>Disclaimer text</label>
                  <input value={draft.disclaimer} onChange={(e) => setDraft({ ...draft, disclaimer: e.target.value })} style={inputStyle} />
                  <label style={labelStyle}>Brand colour (start screen & logo)</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["#0F9B8E", "#2563EB", "#7C3AED", "#DB2777", "#EA580C", "#16A34A"].map((c) => (
                      <button key={c} onClick={() => setDraft({ ...draft, accent: c })}
                        style={{ width: 34, height: 34, borderRadius: 11, border: draft.accent === c ? `3px solid ${S.ink}` : "3px solid transparent", background: c, cursor: "pointer" }} />
                    ))}
                  </div>
                  <p style={{ fontSize: 12, color: S.sub, marginTop: 10 }}>Each therapeutic class has its own colour, set in the Therapeutic classes tab.</p>
                  <button onClick={() => saveSettings()} style={{ ...btn(`linear-gradient(135deg, ${settings.accent}, ${settings.accent}CC)`), marginTop: 10 }}>Save changes</button>
                  {flash && <span style={{ marginLeft: 12, fontSize: 13, color: settings.accent, fontWeight: 650 }}>{flash}</span>}
                </div>
              )}

              {/* ---------- SECURITY ---------- */}
              {adminTab === "security" && (
                <div style={{ fontSize: 13.5, lineHeight: 1.75, color: S.body }}>
                  <p style={{ marginTop: 0 }}>Your admin passcode is stored securely on the server, not inside this app, so users can never discover it.</p>
                  <p><b>To change it:</b> open your Vercel dashboard → your project → <b>Settings → Environment Variables</b> → edit <code>ADMIN_PASSCODE</code> → then <b>Deployments → Redeploy</b>. The new passcode takes effect in about a minute.</p>
                  <p style={{ color: S.sub }}>Your AI key and database keys are also kept server-side and never sent to users' phones.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
}
