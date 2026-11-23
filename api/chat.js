// XAgent — AI backend (Vercel Serverless Function)
// Provider chain: OpenAI (if OPENAI_API_KEY set) -> Gemini (if GEMINI_API_KEY set)
// -> free built-in provider (no key needed, works out of the box).
// Built-in tools executed server-side: calculator, date/time, unit converter.

const PERSONAS = {
  general:
    "You are XAgent, an advanced AI assistant. Answer clearly, accurately and helpfully. Use markdown when it helps (headings, lists, code blocks). Be concise unless the user asks for detail.",
  coding:
    "You are XAgent in Coding Expert mode — a senior full-stack developer. Give working, production-quality code with brief explanations. Prefer modern JavaScript/TypeScript, React/Next.js and Node unless the user asks otherwise. Always include complete code, not fragments, when asked to build something.",
  urdu:
    "You are XAgent in Urdu Dost mode. Reply in Roman Urdu (Urdu written in Latin letters) by default, warm and friendly, like a helpful dost. Switch to English only if the user writes in English. Explain things simply and clearly.",
  business:
    "You are XAgent in Business Advisor mode — an expert in online business, e-commerce, SEO, social media marketing, freelancing and startups, with special knowledge of the Pakistani market (PKR, Payoneer, local platforms). Give practical, step-by-step, money-focused advice. No get-rich-quick claims; be honest about effort and risk.",
};

// ---------- Safe math evaluator (no eval) ----------
function evalMath(expr) {
  const tokens = [];
  let i = 0;
  const s = String(expr).replace(/\s+/g, "");
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      let n = "";
      while (i < s.length && /[0-9.]/.test(s[i])) n += s[i++];
      tokens.push({ t: "num", v: parseFloat(n) });
    } else if (/[a-zA-Z]/.test(c)) {
      let w = "";
      while (i < s.length && /[a-zA-Z]/.test(s[i])) w += s[i++];
      tokens.push({ t: "id", v: w.toLowerCase() });
    } else if ("+-*/%^(),".includes(c)) {
      tokens.push({ t: c });
      i++;
    } else {
      throw new Error("Invalid character: " + c);
    }
  }
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  function parseExpr() {
    let v = parseTerm();
    while (peek() && (peek().t === "+" || peek().t === "-")) {
      const op = next().t;
      const r = parseTerm();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function parseTerm() {
    let v = parseFactor();
    while (peek() && (peek().t === "*" || peek().t === "/" || peek().t === "%")) {
      const op = next().t;
      const r = parseFactor();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  }
  function parseFactor() {
    let base = parseUnary();
    if (peek() && peek().t === "^") {
      next();
      const exp = parseFactor();
      base = Math.pow(base, exp);
    }
    return base;
  }
  function parseUnary() {
    if (peek() && peek().t === "-") { next(); return -parseUnary(); }
    if (peek() && peek().t === "+") { next(); return parseUnary(); }
    return parseAtom();
  }
  const FUNCS = {
    sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor,
    ceil: Math.ceil, sin: Math.sin, cos: Math.cos, tan: Math.tan,
    log: Math.log10, ln: Math.log, exp: Math.exp,
  };
  function parseAtom() {
    const tk = next();
    if (!tk) throw new Error("Unexpected end");
    if (tk.t === "num") return tk.v;
    if (tk.t === "(") {
      const v = parseExpr();
      if (!next() || tokens[pos - 1].t !== ")") throw new Error("Missing )");
      return v;
    }
    if (tk.t === "id") {
      if (tk.v === "pi") return Math.PI;
      if (tk.v === "e") return Math.E;
      if (FUNCS[tk.v]) {
        if (!next() || tokens[pos - 1].t !== "(") throw new Error("Expected (");
        const arg = parseExpr();
        if (!next() || tokens[pos - 1].t !== ")") throw new Error("Missing )");
        return FUNCS[tk.v](arg);
      }
      throw new Error("Unknown name: " + tk.v);
    }
    throw new Error("Unexpected token");
  }
  const result = parseExpr();
  if (pos !== tokens.length) throw new Error("Trailing characters");
  if (!isFinite(result)) throw new Error("Result not finite");
  return Math.round(result * 1e10) / 1e10;
}

// ---------- Unit converter ----------
const UNITS = {
  mm: ["length", 0.001], cm: ["length", 0.01], m: ["length", 1], km: ["length", 1000],
  in: ["length", 0.0254], inch: ["length", 0.0254], inches: ["length", 0.0254],
  ft: ["length", 0.3048], foot: ["length", 0.3048], feet: ["length", 0.3048],
  yd: ["length", 0.9144], yard: ["length", 0.9144], yards: ["length", 0.9144],
  mi: ["length", 1609.344], mile: ["length", 1609.344], miles: ["length", 1609.344],
  g: ["weight", 0.001], gram: ["weight", 0.001], grams: ["weight", 0.001],
  kg: ["weight", 1], lb: ["weight", 0.453592], lbs: ["weight", 0.453592],
  pound: ["weight", 0.453592], pounds: ["weight", 0.453592],
  oz: ["weight", 0.0283495], ounce: ["weight", 0.0283495], ounces: ["weight", 0.0283495],
  ton: ["weight", 1000], tons: ["weight", 1000],
  kb: ["data", 1], mb: ["data", 1024], gb: ["data", 1048576], tb: ["data", 1073741824],
  s: ["time", 1], sec: ["time", 1], min: ["time", 60], h: ["time", 3600], hr: ["time", 3600],
  day: ["time", 86400], days: ["time", 86400], week: ["time", 604800], weeks: ["time", 604800],
};
function convertUnit(text) {
  const m = text.toLowerCase().match(/(-?[\d.]+)\s*([a-z]+)\s*(?:to|in|=)\s*([a-z]+)/);
  if (!m) return null;
  const val = parseFloat(m[1]);
  const from = UNITS[m[2]], to = UNITS[m[3]];
  if (["c", "f", "k"].includes(m[2]) && ["c", "f", "k"].includes(m[3])) {
    let c = m[2] === "c" ? val : m[2] === "f" ? (val - 32) * 5 / 9 : val - 273.15;
    let out = m[3] === "c" ? c : m[3] === "f" ? c * 9 / 5 + 32 : c + 273.15;
    return `${val} ${m[2].toUpperCase()} = ${Math.round(out * 100) / 100} ${m[3].toUpperCase()}`;
  }
  if (!from || !to || from[0] !== to[0]) return null;
  const out = (val * from[1]) / to[1];
  return `${val} ${m[2]} = ${Math.round(out * 1e6) / 1e6} ${m[3]}`;
}

// ---------- Tool detection on the latest user message ----------
function runTools(text) {
  const used = [];
  const notes = [];
  const t = text.trim();
  // calculator: "calculate 45*3", "calc: ...", or a bare math expression
  const calcMatch =
    t.match(/(?:calculate|calc|compute|solve)\s*[:\-]?\s*(.+)/i) ||
    (/^[\d\s+\-*/%^().a-z]+$/.test(t) && /\d\s*[-+*/^%]\s*\d/.test(t)
      ? [null, t]
      : null);
  if (calcMatch) {
    try {
      const r = evalMath(calcMatch[1]);
      used.push("calculator");
      notes.push(`Calculator result: ${calcMatch[1].trim()} = ${r}`);
    } catch (e) { /* not a valid expression — ignore */ }
  }
  // unit conversion
  const conv = convertUnit(t);
  if (conv) {
    used.push("unit-converter");
    notes.push(`Unit conversion result: ${conv}`);
  }
  // date/time
  if (/\b(time|date|day|today|abhi|waqt|tareekh)\b/i.test(t) && /\b(what|current|now|hai|kya|tell|batao)\b/i.test(t)) {
    const now = new Date();
    const pkt = now.toLocaleString("en-GB", { timeZone: "Asia/Karachi", dateStyle: "full", timeStyle: "medium" });
    const utc = now.toUTCString();
    used.push("datetime");
    notes.push(`Current date/time — Pakistan (PKT): ${pkt}. UTC: ${utc}.`);
  }
  return { used, notes };
}

// ---------- Providers ----------
async function callOpenAI(messages) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error("OpenAI " + r.status);
  const j = await r.json();
  return j.choices?.[0]?.message?.content || "";
}

async function callGemini(messages) {
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
        messages,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(45000),
    }
  );
  if (!r.ok) throw new Error("Gemini " + r.status);
  const j = await r.json();
  return j.choices?.[0]?.message?.content || "";
}

async function callFree(messages) {
  const r = await fetch("https://text.pollinations.ai/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model: "openai", private: true }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error("Free provider " + r.status);
  const text = await r.text();
  try {
    const j = JSON.parse(text);
    return j.choices?.[0]?.message?.content || text;
  } catch {
    return text;
  }
}

// ---------- Handler ----------
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const mode = PERSONAS[body.mode] ? body.mode : "general";
    const clean = incoming
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
    if (!clean.length) return res.status(400).json({ error: "No messages" });

    const lastUser = [...clean].reverse().find((m) => m.role === "user");
    const tools = lastUser ? runTools(lastUser.content) : { used: [], notes: [] };

    const messages = [{ role: "system", content: PERSONAS[mode] }, ...clean];
    if (tools.notes.length) {
      messages.push({
        role: "system",
        content:
          "Verified tool results for the user's last message (use these exact values in your answer, do not recalculate):\n" +
          tools.notes.join("\n"),
      });
    }

    let reply = "";
    let provider = "";
    const attempts = [];
    if (process.env.OPENAI_API_KEY) attempts.push(["openai", callOpenAI]);
    if (process.env.GEMINI_API_KEY) attempts.push(["gemini", callGemini]);
    attempts.push(["free", callFree]);

    let lastErr = null;
    for (const [name, fn] of attempts) {
      try {
        reply = await fn(messages);
        if (reply && reply.trim()) { provider = name; break; }
      } catch (e) {
        lastErr = e;
      }
    }

    if (!reply) {
      if (tools.notes.length) {
        return res.status(200).json({
          reply: tools.notes.join("\n"),
          provider: "tools-only",
          tools: tools.used,
        });
      }
      return res.status(502).json({ error: "AI provider unavailable: " + (lastErr?.message || "unknown") });
    }

    return res.status(200).json({ reply, provider, tools: tools.used });
  } catch (e) {
    return res.status(500).json({ error: "Server error: " + e.message });
  }
}
