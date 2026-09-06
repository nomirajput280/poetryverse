export {};
const kv = await Deno.openKv();

const PORT = Number(Deno.env.get("PORT") ?? "8000");
const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") ?? "admin@aimarkaz.xyz").trim().toLowerCase();
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") ?? "";
const SETUP_KEY = Deno.env.get("SETUP_KEY") ?? "";
const FRONTEND_ORIGIN = Deno.env.get("FRONTEND_ORIGIN") ?? "*";
const AI_PROVIDER = (Deno.env.get("AI_PROVIDER") ?? "auto").toLowerCase();
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY") ?? "";
const XAI_API_KEY = Deno.env.get("XAI_API_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-5-mini";
const DEEPSEEK_MODEL = Deno.env.get("DEEPSEEK_MODEL") ?? "deepseek-v4-flash";
const XAI_MODEL = Deno.env.get("XAI_MODEL") ?? "grok-4.6";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.7-flash";

const PLANS = {
  free: { id: "free", name: "Free", price: 0, monthlyCredits: 300 },
  pro1: { id: "pro1", name: "Pro 1", price: 4.99, monthlyCredits: 1000 },
  pro2: { id: "pro2", name: "Pro 2", price: 9.99, monthlyCredits: 3000 },
  pro3: { id: "pro3", name: "Pro 3", price: 19.99, monthlyCredits: 7000 },
  pro4: { id: "pro4", name: "Pro 4", price: 24.99, monthlyCredits: 10000 },
} as const;
type PlanId = keyof typeof PLANS;

const CATEGORIES = [
  "Ghazal", "Nazm", "Love", "Romantic", "Sad", "Motivational", "Spiritual", "Sufi", "Friendship", "Nature",
  "Life", "Hope", "Humor", "Rain", "Heartbreak", "Patriotic", "Islamic", "Family", "Travel", "Youth", "General"
];

interface User {
  id: string; email: string; name: string; role: "user" | "super_admin"; createdAt: string;
  plan: PlanId; credits: number; creditsMonth: string; unlimitedCredits?: boolean;
  username: string; bio: string; language: string; verified: boolean; status: "active" | "suspended";
}
interface Poem {
  id: string; userId: string; title: string; text: string; category: string; language: string;
  status: "pending" | "approved" | "rejected"; createdAt: string; updatedAt: string; authorName: string;
  poetSlug: string; likes: number; views: number; featured: boolean; original: boolean;
}
interface PoetryComment { id: string; poemId: string; userId: string; userName: string; text: string; createdAt: string; }
interface Session { userId: string; createdAt: string; }

const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": FRONTEND_ORIGIN,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type, authorization, x-setup-key",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "cache-control": "no-store",
};
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers }); }
function html(data: string, status = 200) { return new Response(data, { status, headers: { "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "x-frame-options": "DENY", "permissions-policy": "camera=(), microphone=(), geolocation=()" } }); }
async function body(req: Request) { try { return await req.json(); } catch { return {}; } }
function randomToken() { const b = crypto.getRandomValues(new Uint8Array(32)); return Array.from(b, x => x.toString(16).padStart(2, "0")).join(""); }
function hex(buffer: ArrayBuffer) { return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, "0")).join(""); }
function unhex(value: string) { const out = new Uint8Array(value.length / 2); for (let i = 0; i < out.length; i++) out[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16); return out; }
async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex ? unhex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150_000, hash: "SHA-256" }, key, 256);
  return `${hex(salt.buffer)}:${hex(bits)}`;
}
async function verifyPassword(password: string, stored: string) { const [salt, expected] = stored.split(":"); return (await hashPassword(password, salt)).split(":")[1] === expected; }
function monthKey() { const d = new Date(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; }
function slugify(s: string) { return s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 60); }
function planCredits(plan: PlanId) { return PLANS[plan].monthlyCredits; }
function safeUser(u: User) { return { ...u, password: undefined }; }

async function currentUser(req: Request): Promise<User | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const s = await kv.get<Session>(["session", auth.slice(7)]);
  if (!s.value) return null;
  const u = await kv.get<User>(["user", s.value.userId]);
  if (!u.value || u.value.status !== "active") return null;
  let user = u.value;
  if (!user.unlimitedCredits && user.creditsMonth !== monthKey()) {
    user = { ...user, credits: planCredits(user.plan), creditsMonth: monthKey() };
    await kv.set(["user", user.id], user); await kv.set(["userByEmail", user.email], user);
  }
  return user;
}
function requireAdmin(user: User | null) { return !!user && user.role === "super_admin"; }

type Seed = [string,string,string,string,string,string];
const seedPoems: Seed[] = [
  ["first-light","First Light","A new day does not ask the night for permission; it simply arrives, carrying a quiet promise that beginning is always possible.","Hope","English","PoetryVerse Editorial"],
  ["dil-ki-roshni","دل کی روشنی","اندھیروں میں بھی امید کا چراغ جلتا ہے، خاموش دل میں ایک خواب پلتا ہے۔ سفر اگر مشکل ہو تو حوصلہ رکھنا، ہر رات کے بعد سویرا نکلتا ہے۔","Motivational","Urdu","PoetryVerse Editorial"],
  ["khwabon-ka-safar","خوابوں کا سفر","خوابوں کی بستی میں دل پھر سے چل پڑا، ٹوٹا ہوا سا حوصلہ پھر سنبھل پڑا۔ جو کل تھا دور، آج قریب لگنے لگا، اک نیا موسم مرے اندر ہی بدل پڑا۔","Ghazal","Urdu","PoetryVerse Editorial"],
  ["quiet-love","A Quiet Love","Some hearts speak softly, yet their silence becomes the most unforgettable verse.","Love","English","PoetryVerse Editorial"],
  ["barish","بارش کے بعد","بارش کے بعد جب مٹی نے خوشبو اوڑھی، دل نے بھی ایک پرانی یاد سنواری۔","Rain","Urdu","PoetryVerse Editorial"],
  ["peace","A Place of Peace","When the heart becomes grateful, even an ordinary morning can feel like a beautiful prayer.","Spiritual","English","PoetryVerse Editorial"],
  ["dosti","دوستی","کچھ رشتے نام کے محتاج نہیں ہوتے، دوست وہی جو خاموشی بھی سمجھ لیتے ہیں۔","Friendship","Urdu","PoetryVerse Editorial"],
  ["nature","After the Rain","The leaves remember every drop, and the sky teaches the earth that softness can return after every storm.","Nature","English","PoetryVerse Editorial"],
  ["life","Keep Going","You do not need the whole road in sight. One honest step is enough to keep the story moving.","Life","English","PoetryVerse Editorial"],
  ["sufi-dil","دل کا راستہ","دل نے جب خاموشی میں خود کو پہچانا، ہر سمت محبت کا رنگ نظر آیا۔","Sufi","Urdu","PoetryVerse Editorial"],
  ["nayi-subah","نئی صبح","نئی صبح کا وعدہ لیے رات ڈھلتی ہے، امید کی خوشبو ہر سمت ملتی ہے۔","Nazm","Urdu","PoetryVerse Editorial"],
  ["humor-midnight","The Poet at Midnight","I promised sleep at ten, wrote one line at eleven, and somehow negotiated with sunrise at five.","Humor","English","PoetryVerse Editorial"],
  ["heartbreak","After Goodbye","Some goodbyes close a door, but they also teach the heart how to build a window.","Heartbreak","English","PoetryVerse Editorial"],
  ["family","گھر","گھر صرف دیواروں کا نام نہیں، اپنوں کی دعا ہو تو ہر راستہ گھر لگتا ہے۔","Family","Urdu","PoetryVerse Editorial"],
  ["patriotic","My Home","A homeland lives not only in maps, but in the kindness people carry for one another.","Patriotic","English","PoetryVerse Editorial"],
];

const seedPoets = [
  { slug:"poetryverse-editorial", name:"PoetryVerse Editorial", language:"Urdu / English", bio:"Original PoetryVerse editorial collection.", rights:"original" },
  { slug:"mir-taqi-mir", name:"Mir Taqi Mir", language:"Urdu", bio:"Classical Urdu poet. Poetry displayed only where public-domain or licensed rights permit.", rights:"rights-aware" },
  { slug:"mirza-ghalib", name:"Mirza Ghalib", language:"Urdu", bio:"Iconic Urdu and Persian poet. Rights status is handled per jurisdiction and source.", rights:"rights-aware" },
  { slug:"allama-iqbal", name:"Allama Iqbal", language:"Urdu / Persian", bio:"Poet-philosopher and major South Asian literary figure.", rights:"rights-aware" },
  { slug:"faiz-ahmad-faiz", name:"Faiz Ahmed Faiz", language:"Urdu", bio:"Celebrated modern Urdu poet. Full copyrighted text is not imported without permission.", rights:"rights-aware" },
  { slug:"parveen-shakir", name:"Parveen Shakir", language:"Urdu", bio:"Renowned modern Urdu poet. Full text requires appropriate rights.", rights:"rights-aware" },
  { slug:"ahmad-faraz", name:"Ahmad Faraz", language:"Urdu", bio:"Major modern Urdu poet. Full text requires appropriate rights.", rights:"rights-aware" },
  { slug:"jon-elias", name:"Jon Elia", language:"Urdu", bio:"Modern Urdu poet. Full text requires appropriate rights.", rights:"rights-aware" },
  { slug:"nasir-kazmi", name:"Nasir Kazmi", language:"Urdu", bio:"Influential Urdu poet. Full text requires appropriate rights.", rights:"rights-aware" },
  { slug:"amjad-islam-amjad", name:"Amjad Islam Amjad", language:"Urdu", bio:"Poet, writer and dramatist. Full text requires appropriate rights.", rights:"rights-aware" },
  { slug:"wasi-shah", name:"Wasi Shah", language:"Urdu", bio:"Contemporary Urdu poet and writer. Full text requires appropriate rights.", rights:"rights-aware" },
  { slug:"william-shakespeare", name:"William Shakespeare", language:"English", bio:"Classical English playwright and poet; public-domain status varies by jurisdiction but historical texts are generally public domain.", rights:"public-domain-aware" },
  { slug:"william-wordsworth", name:"William Wordsworth", language:"English", bio:"Romantic-era English poet; historical works are generally public domain.", rights:"public-domain-aware" },
  { slug:"emily-dickinson", name:"Emily Dickinson", language:"English", bio:"American poet; historical works are generally public domain in many jurisdictions.", rights:"public-domain-aware" },
  { slug:"robert-frost", name:"Robert Frost", language:"English", bio:"American poet; rights must be checked before publishing complete works.", rights:"rights-aware" },
  { slug:"pablo-neruda", name:"Pablo Neruda", language:"Spanish", bio:"International poet; full text requires appropriate rights.", rights:"rights-aware" },
  { slug:"rumi", name:"Rumi", language:"Persian", bio:"Classical Persian poet; translations may have separate copyright.", rights:"translation-rights-aware" },
  { slug:"khalil-gibran", name:"Khalil Gibran", language:"English / Arabic", bio:"Poet and writer; verify jurisdiction-specific rights and translations.", rights:"rights-aware" },
  { slug:"sylvia-plath", name:"Sylvia Plath", language:"English", bio:"Modern English-language poet; full text requires appropriate rights.", rights:"rights-aware" },
];

function providerAvailability() {
  return {
    openai: !!OPENAI_API_KEY,
    deepseek: !!DEEPSEEK_API_KEY,
    grok: !!XAI_API_KEY,
    gemini: !!GEMINI_API_KEY,
    local: true,
  };
}
function selectProvider(requested?: string) {
  const wanted = (requested || AI_PROVIDER).toLowerCase();
  if (wanted === "openai" && OPENAI_API_KEY) return "openai";
  if (wanted === "deepseek" && DEEPSEEK_API_KEY) return "deepseek";
  if ((wanted === "grok" || wanted === "xai") && XAI_API_KEY) return "grok";
  if (wanted === "gemini" && GEMINI_API_KEY) return "gemini";
  if (wanted !== "local" && wanted !== "auto") return "local";
  if (OPENAI_API_KEY) return "openai";
  if (DEEPSEEK_API_KEY) return "deepseek";
  if (GEMINI_API_KEY) return "gemini";
  if (XAI_API_KEY) return "grok";
  return "local";
}
async function providerCall(provider: string, prompt: string, system: string) {
  if (provider === "openai") {
    const r = await fetch("https://api.openai.com/v1/responses", { method:"POST", headers:{"content-type":"application/json","authorization":`Bearer ${OPENAI_API_KEY}`}, body:JSON.stringify({model:OPENAI_MODEL,instructions:system,input:prompt,max_output_tokens:900}) });
    const d = await r.json(); if (!r.ok) throw new Error(d?.error?.message || "OpenAI request failed.");
    return d.output_text || d.output?.flatMap((x:any)=>x.content||[]).map((x:any)=>x.text||"").join("") || "";
  }
  if (provider === "deepseek") {
    const r = await fetch("https://api.deepseek.com/chat/completions", { method:"POST", headers:{"content-type":"application/json","authorization":`Bearer ${DEEPSEEK_API_KEY}`}, body:JSON.stringify({model:DEEPSEEK_MODEL,messages:[{role:"system",content:system},{role:"user",content:prompt}],max_tokens:900,temperature:0.9}) });
    const d = await r.json(); if (!r.ok) throw new Error(d?.error?.message || "DeepSeek request failed."); return d.choices?.[0]?.message?.content || "";
  }
  if (provider === "grok") {
    const r = await fetch("https://api.x.ai/v1/chat/completions", { method:"POST", headers:{"content-type":"application/json","authorization":`Bearer ${XAI_API_KEY}`}, body:JSON.stringify({model:XAI_MODEL,messages:[{role:"system",content:system},{role:"user",content:prompt}],max_tokens:900,temperature:0.9}) });
    const d = await r.json(); if (!r.ok) throw new Error(d?.error?.message || "Grok request failed."); return d.choices?.[0]?.message?.content || "";
  }
  if (provider === "gemini") {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, { method:"POST", headers:{"content-type":"application/json","x-goog-api-key":GEMINI_API_KEY}, body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:900,temperature:0.9}}) });
    const d = await r.json(); if (!r.ok) throw new Error(d?.error?.message || "Gemini request failed."); return d.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||"").join("") || "";
  }
  return localPoem(prompt);
}
function localPoem(prompt: string) {
  const p = prompt.trim() || "a hopeful new beginning";
  return `For ${p},\n\nA quiet thought becomes a line,\nA little hope begins to shine.\nWhere yesterday once left a scar,\nNew dreams remember who you are.\n\n— PoetryVerse AI Studio`;
}

async function consumeCredit(user: User, cost = 1) {
  if (user.unlimitedCredits) return user;
  if (user.credits < cost) throw new Error("You have used your monthly AI credits. Upgrade your plan or wait for the next monthly reset.");
  const updated = { ...user, credits: user.credits - cost };
  const tx = await kv.atomic().check({ key:["user",user.id], versionstamp:(await kv.get(["user",user.id])).versionstamp }).set(["user",user.id],updated).set(["userByEmail",user.email],updated).commit();
  if (!tx.ok) throw new Error("Please retry your AI request.");
  return updated;
}

function quoteForHour() {
  const quotes = [
    ["Urdu","ہر لفظ میں ایک دنیا چھپی ہے، بس دل سے پڑھنے والا چاہیے۔"],
    ["English","Every verse is a door; some open into memory, others into possibility."],
    ["Urdu","خاموشی بھی ایک شعر ہے، اگر اسے محسوس کرنے والا دل ہو۔"],
    ["English","Read slowly. Feel deeply. Let the words become yours."],
    ["Urdu","لفظ کم ہوں تو کیا، احساس سچا ہو تو شعر مکمل ہوتا ہے۔"],
    ["English","A beautiful poem does not end on the page; it continues in the reader."],
  ];
  const index = Math.floor(Date.now() / 3600000) % quotes.length; return { language:quotes[index][0], text:quotes[index][1] };
}

const page = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#111827"><meta name="application-name" content="PoetryVerse"><meta name="apple-mobile-web-app-title" content="PoetryVerse">
<title>PoetryVerse — The World of Poetry</title>
<meta name="description" content="PoetryVerse is a premium home for Urdu and English poetry: discover poets, explore moods and categories, create with AI, save favorite verses, and publish original poetry after review.">
<meta name="keywords" content="PoetryVerse, Urdu poetry, English poetry, shayari, ghazal, nazm, love poetry, sad poetry, motivational poetry, Urdu shayari, AI poetry, poets, poetry library">
<meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="/">
<meta property="og:type" content="website"><meta property="og:site_name" content="PoetryVerse"><meta property="og:title" content="PoetryVerse — The World of Poetry"><meta property="og:description" content="Read. Feel. Create. Share. A premium multilingual home for poetry, poets and AI creativity."><meta property="og:url" content="/">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="PoetryVerse — The World of Poetry"><meta name="twitter:description" content="Discover, create, save and share beautiful Urdu and English poetry.">
<link rel="manifest" href="/manifest.webmanifest"><style>
:root{--bg:#f7f7fb;--card:#fff;--ink:#111827;--muted:#687084;--line:#e8e8f0;--a:#7c3aed;--b:#d946ef;--dark:#111827;--ok:#0f9d67;--bad:#c0392b}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input,select,textarea{font:inherit}button{cursor:pointer;border:0}.nav{position:sticky;top:0;z-index:20;background:#ffffffec;backdrop-filter:blur(18px);border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:14px 5%;}.brand{display:flex;align-items:center;gap:10px;font-weight:850}.logo{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,var(--a),var(--b));box-shadow:0 8px 22px #7c3aed33}.links{display:flex;gap:22px;align-items:center;font-size:13px}.links a{color:#41495a;text-decoration:none}.container{width:min(1180px,92%);margin:auto}.hero{padding:70px 0 36px;display:grid;grid-template-columns:1.25fr .75fr;gap:42px;align-items:center}.eyebrow{font-size:12px;font-weight:800;color:var(--a);letter-spacing:.06em}.hero h1{font-size:clamp(42px,7vw,76px);line-height:.98;margin:12px 0 18px;letter-spacing:-.055em}.gradientText{background:linear-gradient(90deg,var(--a),var(--b));-webkit-background-clip:text;background-clip:text;color:transparent}.hero p{font-size:17px;line-height:1.7;color:var(--muted);max-width:720px}.quote{background:var(--dark);color:#fff;padding:34px;border-radius:26px;box-shadow:0 24px 50px #11182722;transform:rotate(1deg)}.quote p{font-family:Georgia,serif;color:#fff;font-size:25px;line-height:1.4;margin:0}.quote small{display:block;margin-top:18px;color:#c9cdd8}.search{display:flex;gap:8px;background:#fff;border:1px solid var(--line);padding:7px;border-radius:18px;box-shadow:0 18px 40px #4c1d9514}.search input{border:0;outline:0;flex:1;padding:13px 14px;background:transparent}.primary,.gradient{background:linear-gradient(135deg,var(--a),var(--b));color:#fff;padding:12px 18px;border-radius:12px;font-weight:800;box-shadow:0 10px 24px #7c3aed2b}.ghost{background:#fff;border:1px solid var(--line);color:var(--ink);padding:11px 16px;border-radius:12px;font-weight:750}.section{padding:38px 0}.section h2{font-size:28px;margin:0 0 7px;letter-spacing:-.03em}.sub{color:var(--muted);margin:0 0 22px}.welcome,.feature,.panel,.pricing{background:#fff;border:1px solid var(--line);border-radius:24px;box-shadow:0 14px 40px #11182708}.welcome{padding:25px}.chips{display:flex;gap:8px;flex-wrap:wrap}.chip{background:#fff;border:1px solid var(--line);padding:8px 13px;border-radius:999px;color:#555d6f;font-size:13px}.chip.active{background:#f0e8ff;color:#6d28d9;border-color:#ddd0ff}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.poem{padding:22px}.tag{font-size:11px;font-weight:800;color:var(--a);text-transform:uppercase;letter-spacing:.05em}.poem h3{margin:10px 0}.poemText{white-space:pre-line;font-family:Georgia,serif;font-size:17px;line-height:1.7;color:#34394a}.poemFoot{display:flex;justify-content:space-between;margin-top:18px;color:var(--muted);font-size:12px}.actions{display:flex;gap:7px;margin-top:13px;flex-wrap:wrap}.mini{padding:8px 10px;border-radius:9px;background:#f7f7fb;border:1px solid var(--line);font-size:12px}.ai{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:24px}.field{margin-bottom:13px}.field label{display:block;font-size:12px;font-weight:800;margin-bottom:6px}.field input,.field select,.field textarea{width:100%;border:1px solid var(--line);border-radius:12px;padding:12px;outline:none;background:#fff}.field textarea{min-height:170px;resize:vertical}.output{min-height:300px;background:#faf9ff;border:1px solid #eee8ff;border-radius:18px;padding:20px;white-space:pre-line;font-family:Georgia,serif;line-height:1.75}.features{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.feature{padding:22px}.feature b{display:block;margin-bottom:8px}.cta{background:linear-gradient(135deg,#111827,#2e2168);color:#fff;padding:34px;border-radius:24px;display:flex;justify-content:space-between;gap:20px;align-items:center}.cta p{color:#d7d9e4}.pricing{padding:24px}.priceGrid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.plan{padding:18px;border:1px solid var(--line);border-radius:18px;background:#fff}.plan h3{margin:0}.price{font-size:25px;font-weight:900;margin:10px 0}.footer{padding:30px 0 55px;color:#6b7280;border-top:1px solid var(--line);margin-top:30px}.modal{position:fixed;inset:0;background:#11182780;backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:18px;z-index:50}.modal.open{display:flex}.dialog{width:min(560px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:24px;padding:24px;box-shadow:0 40px 100px #11182740}.tabs{display:flex;gap:8px;margin-bottom:16px}.tab{flex:1;padding:10px;border-radius:10px;background:#f7f7fb}.tab.active{background:#eee8ff;color:#6d28d9;font-weight:800}.row{display:flex;justify-content:space-between;gap:12px;align-items:center}.muted{color:var(--muted);font-size:13px}.status{font-size:11px;font-weight:900;text-transform:uppercase;padding:6px 8px;border-radius:999px}.status.pending{background:#fff6dd;color:#9a6700}.status.approved{background:#e9fff5;color:#08784e}.status.rejected{background:#fff0ef;color:#a12b21}.adminRow{padding:14px 0;border-bottom:1px solid var(--line)}.empty{padding:25px;text-align:center;color:var(--muted);background:#fff;border:1px dashed var(--line);border-radius:16px}.error{color:var(--bad);font-size:13px}.success{color:var(--ok);font-size:13px}.topQuote{font-size:11px;text-align:center;padding:5px 10px;background:#111827;color:#fff}.hide{display:none!important}@media(max-width:850px){.hero,.ai{grid-template-columns:1fr}.grid,.features{grid-template-columns:1fr}.priceGrid{grid-template-columns:1fr 1fr}.links a:nth-child(-n+3){display:none}.quote{transform:none}.hero{padding-top:40px}.cta{flex-direction:column;align-items:flex-start}}@media(max-width:500px){.priceGrid{grid-template-columns:1fr}.nav{padding:12px 4%}.brand{font-size:14px}.hero h1{font-size:44px}}
</style></head><body>
<div class="topQuote" id="hourQuote">PoetryVerse · Read · Feel · Create · Share</div>
<nav class="nav"><div class="brand"><span class="logo">✦</span>PoetryVerse</div><div class="links"><a href="#discover">Discover</a><a href="#categories">Categories</a><a href="#ai">AI Studio</a><a href="#poets">Poets</a><a href="#submit" onclick="openSubmit();return false">Submit Poetry</a><button class="ghost" id="authBtn" onclick="openAuth()">Login / Sign up</button></div></nav>
<main class="container" id="top">
<section class="hero"><div><div class="eyebrow">PoetryVerse — The World of Poetry</div><h1>Read. Feel.<br><span class="gradientText">Create. Share.</span></h1><p>Welcome to a premium home for Urdu and English poetry. Discover timeless verses, explore poets and moods, create original poetry with AI, save your favorites, and share words that deserve to be remembered.</p><div class="search"><input id="searchInput" placeholder="Search poetry, poet, feeling or category…"><button class="gradient" onclick="searchPoems()">Search</button></div></div><div class="quote"><p id="heroQuote">Every verse carries a feeling, and every feeling deserves a beautiful place.</p><small>— PoetryVerse</small></div></section>
<section class="welcome"><h2>Welcome to PoetryVerse</h2><p class="sub">A respectful global space for readers and poets — with discovery, creator tools, community publishing, personal libraries and AI creativity in one place.</p><div class="chips"><span class="chip">Urdu + English</span><span class="chip">Original Poetry</span><span class="chip">AI Poetry Studio</span><span class="chip">Creator Community</span><span class="chip">Personal Library</span></div></section>
<section class="section" id="categories"><h2>Explore by mood & theme</h2><p class="sub">Choose a poetic world and discover its verses.</p><div class="chips" id="catChips"></div></section>
<section class="section" id="discover"><div class="row"><div><h2>Featured & Latest Poetry</h2><p class="sub">PoetryVerse originals and approved community poetry.</p></div><button class="ghost" onclick="loadPoems()">Refresh</button></div><div class="grid" id="poemGrid"><div class="empty">Loading poetry…</div></div></section>
<section class="section" id="ai"><h2>AI Poetry Studio</h2><p class="sub">Create, rewrite, translate, polish and explore ideas with your PoetryVerse credits.</p><div class="panel ai"><div><div class="field"><label>What would you like to create?</label><textarea id="aiPrompt" placeholder="Write a romantic Urdu poem about rain…"></textarea></div><div class="field"><label>Mode</label><select id="aiMode"><option value="poetry">Write poetry</option><option value="rewrite">Rewrite / polish</option><option value="translate">Translate poetry</option><option value="title">Generate titles</option><option value="quote">Generate quotes</option></select></div><div class="field"><label>Language</label><select id="aiLanguage"><option>Urdu</option><option>English</option><option>Urdu / English</option></select></div><div class="field"><label>AI Provider</label><select id="aiProviderSelect"><option value="auto">Auto (best configured provider)</option><option value="openai">ChatGPT / OpenAI</option><option value="deepseek">DeepSeek</option><option value="gemini">Google Gemini</option><option value="grok">Grok / xAI</option><option value="local">PoetryVerse Local Fallback</option></select></div><div class="row"><button class="gradient" onclick="generateAI()">Generate with AI Studio</button><span class="muted" id="creditInfo">Login to see credits</span></div><div id="aiMsg"></div></div><div><div class="row"><b>Studio output</b><span class="muted" id="aiProvider"></span></div><div class="output" id="aiOutput">Your generated poetry will appear here.</div><div class="actions"><button class="mini" onclick="copyAI()">Copy</button><button class="mini" onclick="saveAI()">Save as my draft</button><button class="mini" onclick="submitAI()">Submit to PoetryVerse</button></div></div></div></section>
<section class="section" id="poets"><h2>Poet Library</h2><p class="sub">Explore poet profiles and rights-aware collections.</p><div class="grid" id="poetGrid"><div class="empty">Loading poets…</div></div></section>
<section class="section" id="pricing"><h2>PoetryVerse Plans</h2><p class="sub">Every account starts with 300 AI credits each month. Upgrade when you need more creative power.</p><div class="priceGrid" id="priceGrid"></div></section>
<section class="section" id="features"><div class="features"><div class="feature"><b>Powerful Discovery</b><span class="muted">Search by title, words, category, language, mood and poet.</span></div><div class="feature"><b>Creator Community</b><span class="muted">Publish original poetry after transparent Super Admin review.</span></div><div class="feature"><b>Save & Share</b><span class="muted">Build your personal library with likes, saves, comments and sharing.</span></div><div class="feature"><b>AI Creativity</b><span class="muted">Poetry, rewriting, translation, titles and quotes through configured AI providers or a local fallback.</span></div><div class="feature"><b>Mobile Ready</b><span class="muted">Responsive PWA experience and an Android WebView packaging project are included.</span></div><div class="feature"><b>Rights-Aware Library</b><span class="muted">Original/editorial and public-domain-permitted content can be expanded safely without importing copyrighted books wholesale.</span></div></div></section>
<section class="section" id="submit"><div class="cta"><div><h2>Have a poem in your heart?</h2><p>Join PoetryVerse and send your original poetry for review. Approved work becomes part of the public library.</p></div><button class="gradient" onclick="openSubmit()">Submit your poetry</button></div></section>
</main>
<footer class="container footer"><b>PoetryVerse — The World of Poetry</b><span> · Powered by AI Markaz™</span><div class="muted" style="margin-top:8px">Read · Feel · Create · Share</div><div class="muted" style="margin-top:12px"><a href="#pricing">Plans</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/about">About</a></div></footer>

<div class="modal" id="authModal"><div class="dialog"><div class="row"><h2 id="authTitle">Welcome back</h2><button class="ghost" onclick="closeModal('authModal')">×</button></div><div class="tabs"><button id="loginTab" class="tab active" onclick="setAuthMode('login')">Login</button><button id="signupTab" class="tab" onclick="setAuthMode('signup')">Create account</button></div><form onsubmit="doAuth(event)"><div class="field hide" id="nameField"><label>Name</label><input id="authName"></div><div class="field"><label>Email</label><input id="authEmail" type="email" required></div><div class="field"><label>Password</label><input id="authPassword" type="password" minlength="8" required></div><div id="authMsg"></div><button class="gradient" id="authSubmit">Login</button></form></div></div>
<div class="modal" id="submitModal"><div class="dialog"><div class="row"><h2>Submit original poetry</h2><button class="ghost" onclick="closeModal('submitModal')">×</button></div><form onsubmit="submitPoem(event)"><div class="field"><label>Title</label><input id="subTitle" maxlength="160" required></div><div class="field"><label>Category</label><select id="subCategory"></select></div><div class="field"><label>Language</label><select id="subLanguage"><option>Urdu</option><option>English</option><option>Urdu / English</option></select></div><div class="field"><label>Poetry</label><textarea id="subText" maxlength="12000" required></textarea></div><div id="submitMsg"></div><div class="row"><button type="button" class="ghost" onclick="closeModal('submitModal')">Cancel</button><button class="gradient">Send for review</button></div></form></div></div>
<div class="modal" id="accountModal"><div class="dialog"><div class="row"><h2>My PoetryVerse</h2><button class="ghost" onclick="closeModal('accountModal')">×</button></div><div id="accountContent"></div></div></div>
<script>
const categories=${JSON.stringify(CATEGORIES)};let token=localStorage.getItem('poetryverse_token')||'',user=null,selectedCategory='',selectedPoet='';let authMode='login';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=async(path,opt={})=>{const h={'Content-Type':'application/json',...(opt.headers||{})};if(token)h.Authorization='Bearer '+token;const r=await fetch(path,{...opt,headers:h});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Something went wrong.');return d};
function closeModal(id){document.getElementById(id).classList.remove('open')}function scrollToId(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth'})}
function openAuth(){document.getElementById('authModal').classList.add('open');setAuthMode('login')}
function setAuthMode(m){authMode=m;document.getElementById('loginTab').classList.toggle('active',m==='login');document.getElementById('signupTab').classList.toggle('active',m==='signup');document.getElementById('nameField').classList.toggle('hide',m!=='signup');document.getElementById('authTitle').textContent=m==='signup'?'Create your PoetryVerse account':'Welcome back';document.getElementById('authSubmit').textContent=m==='signup'?'Create account':'Login';document.getElementById('authMsg').innerHTML=''}
async function doAuth(e){e.preventDefault();try{const d=await api('/auth/'+authMode,{method:'POST',body:JSON.stringify({name:document.getElementById('authName').value,email:document.getElementById('authEmail').value,password:document.getElementById('authPassword').value})});token=d.token;localStorage.setItem('poetryverse_token',token);user=d.user;closeModal('authModal');updateUI();refreshAccount()}catch(err){document.getElementById('authMsg').innerHTML='<div class="error">'+esc(err.message)+'</div>'}}
async function logout(){try{await api('/auth/logout',{method:'POST'})}catch{}token='';user=null;localStorage.removeItem('poetryverse_token');updateUI();closeModal('accountModal')}
function updateUI(){const b=document.getElementById('authBtn');b.textContent=user?(user.role==='super_admin'?'Super Admin':'Account'): 'Login / Sign up';b.onclick=user?()=>refreshAccount():openAuth;document.getElementById('creditInfo').textContent=user?(user.unlimitedCredits?'Unlimited AI credits':\`\${user.credits} AI credits · \${user.plan.toUpperCase()}\`):'Login to use AI Studio';}
async function restore(){if(!token){updateUI();return}try{user=(await api('/auth/me')).user;updateUI()}catch{token='';localStorage.removeItem('poetryverse_token');updateUI()}}
function renderCategories(){const box=document.getElementById('catChips');box.innerHTML='<button class="chip active" onclick="chooseCategory(\'\',this)">All</button>'+categories.map(c=>'<button class="chip" onclick="chooseCategory('+JSON.stringify(c)+',this)">'+esc(c)+'</button>').join('');document.getElementById('subCategory').innerHTML=categories.map(c=>'<option>'+esc(c)+'</option>').join('')}
function chooseCategory(c,el){selectedCategory=c;document.querySelectorAll('#catChips .chip').forEach(x=>x.classList.remove('active'));el.classList.add('active');scrollToId('discover');loadPoems()}
function poemCard(p){return '<article class="welcome poem"><div class="tag">'+esc(p.category)+' · '+esc(p.language)+'</div><h3>'+esc(p.title)+'</h3><div class="poemText">'+esc(p.text)+'</div><div class="poemFoot"><span>✦ '+esc(p.authorName)+'</span><span>'+Number(p.likes||0)+' ♥</span></div><div class="actions"><button class="mini" onclick="likePoem(\''+p.id+'\')">♥ Like</button><button class="mini" onclick="savePoem(\''+p.id+'\')">🔖 Save</button><button class="mini" onclick="sharePoem(\''+p.id+'\')">↗ Share</button></div></article>'}
async function loadPoems(){const g=document.getElementById('poemGrid');g.innerHTML='<div class="empty">Loading poetry…</div>';try{const p=new URLSearchParams();const q=document.getElementById('searchInput').value.trim();if(q)p.set('q',q);if(selectedCategory)p.set('category',selectedCategory);if(selectedPoet)p.set('poet',selectedPoet);p.set('sort','featured');const d=await api('/poems?'+p);g.innerHTML=d.poems?.length?d.poems.map(poemCard).join(''):'<div class="empty">No poetry found. Try another category or feeling.</div>'}catch(e){g.innerHTML='<div class="empty error">'+esc(e.message)+'</div>'}}
function searchPoems(){scrollToId('discover');loadPoems()}
async function likePoem(id){if(!user){openAuth();return}try{await api('/poems/'+id+'/like',{method:'POST'});loadPoems()}catch(e){alert(e.message)}}
async function savePoem(id){if(!user){openAuth();return}try{const d=await api('/poems/'+id+'/save',{method:'POST'});alert(d.saved?'Saved to your library.':'Removed from your library.')}catch(e){alert(e.message)}}
async function sharePoem(id){const u=location.origin+'/?poem='+encodeURIComponent(id);try{await navigator.clipboard.writeText(u);alert('Poetry link copied.')}catch{prompt('Copy link:',u)}}
function openSubmit(){if(!user){openAuth();return}document.getElementById('submitModal').classList.add('open')}
async function submitPoem(e){e.preventDefault();try{await api('/submissions',{method:'POST',body:JSON.stringify({title:document.getElementById('subTitle').value,text:document.getElementById('subText').value,category:document.getElementById('subCategory').value,language:document.getElementById('subLanguage').value})});document.getElementById('submitMsg').innerHTML='<div class="success">Submitted. Your poetry is pending Super Admin review.</div>';setTimeout(()=>closeModal('submitModal'),800)}catch(err){document.getElementById('submitMsg').innerHTML='<div class="error">'+esc(err.message)+'</div>'}}
async function generateAI(){if(!user){openAuth();return}const msg=document.getElementById('aiMsg');msg.innerHTML='';const out=document.getElementById('aiOutput');out.textContent='Creating…';try{const d=await api('/ai/generate',{method:'POST',body:JSON.stringify({prompt:document.getElementById('aiPrompt').value,mode:document.getElementById('aiMode').value,language:document.getElementById('aiLanguage').value,provider:document.getElementById('aiProviderSelect').value})});out.textContent=d.text;document.getElementById('aiProvider').textContent=d.provider+' · '+(d.chargedCredits?d.chargedCredits+' credit':'unlimited');user=d.user;updateUI()}catch(e){out.textContent='';msg.innerHTML='<div class="error">'+esc(e.message)+'</div>'}}
async function copyAI(){try{await navigator.clipboard.writeText(document.getElementById('aiOutput').textContent);alert('Copied.')}catch{}}
async function saveAI(){if(!user){openAuth();return}try{await api('/drafts',{method:'POST',body:JSON.stringify({text:document.getElementById('aiOutput').textContent})});alert('Saved to your drafts.')}catch(e){alert(e.message)}}
function submitAI(){const text=document.getElementById('aiOutput').textContent;if(!text||text.startsWith('Your generated')){alert('Generate something first.');return}if(!user){openAuth();return}document.getElementById('subText').value=text;document.getElementById('subTitle').value='AI Studio Draft';openSubmit()}
async function refreshAccount(){if(!user)return;document.getElementById('accountModal').classList.add('open');const c=document.getElementById('accountContent');try{const [m,s,d]=await Promise.all([api('/auth/me'),api('/submissions/mine'),api('/saved'),api('/drafts')]);user=m.user;const mine=s.submissions||[];const saved=d.poems||[];c.innerHTML='<div class="welcome"><b>'+esc(user.name)+'</b><div class="muted">'+esc(user.email)+'</div><div style="margin-top:10px"><b>'+esc(user.plan.toUpperCase())+'</b> · '+(user.unlimitedCredits?'Unlimited':user.credits)+' AI credits this month</div></div><div class="section"><h3>My submissions</h3>'+(mine.length?mine.map(x=>'<div class="adminRow"><div><b>'+esc(x.title)+'</b><div class="muted">'+esc(x.category)+' · '+esc(x.status)+'</div></div><span class="status '+x.status+'">'+x.status+'</span></div>').join(''):'<div class="muted">No submissions yet.</div>')+'</div><div class="section"><h3>Saved poetry</h3>'+(saved.length?saved.map(poemCard).join(''):'<div class="muted">Your library is empty.</div>')+'</div><div class="section"><h3>Drafts</h3><div class="muted">'+((d.drafts||[]).length)+' saved AI drafts</div></div><div class="actions"><button class="gradient" onclick="scrollToId(\'pricing\');closeModal(\'accountModal\')">Upgrade plan</button>'+(user.role==='super_admin'?'<button class="ghost" onclick="openAdmin()">Open Super Admin</button>':'')+'<button class="ghost" onclick="logout()">Logout</button></div>'}catch(e){c.innerHTML='<div class="error">'+esc(e.message)+'</div>'}}
async function openAdmin(){try{const d=await api('/admin/overview');document.getElementById('accountContent').innerHTML='<h2>Super Admin Control Center</h2><div class="welcome"><b>Unlimited access</b><div class="muted">Users '+d.users+' · Approved poetry '+d.poems+' · Pending '+d.pending+' · Likes '+d.likes+'</div></div><div class="section"><h3>Moderation queue</h3><div id="adminQueue">Loading…</div></div><div class="actions"><button class="ghost" onclick="loadAdminUsers()">Manage users</button><button class="ghost" onclick="adminAddPoem()">Add poetry</button><button class="ghost" onclick="loadAdminPoems()">Manage poetry</button><button class="ghost" onclick="refreshAccount()">Back</button></div>';await loadAdminQueue()}catch(e){alert(e.message)}}
async function loadAdminQueue(){const q=document.getElementById('adminQueue');if(!q)return;const d=await api('/admin/submissions');q.innerHTML=d.submissions.map(s=>'<div class="adminRow"><b>'+esc(s.title)+'</b><div class="muted">'+esc(s.authorName)+' · '+esc(s.category)+' · '+esc(s.status)+'</div><div style="margin-top:5px;white-space:pre-line">'+esc(s.text)+'</div><div class="actions">'+(s.status==='pending'?'<button class="mini" onclick="review(\''+s.id+'\',\'approved\')">Approve & publish</button><button class="mini" onclick="review(\''+s.id+'\',\'rejected\')">Reject</button>':'')+'<button class="mini" onclick="toggleFeature(\''+s.id+'\','+(!s.featured)+')">'+(s.featured?'Unfeature':'Feature')+'</button><button class="mini" onclick="deletePoem(\''+s.id+'\')">Delete</button></div></div>').join('')||'<div class="muted">Queue empty.</div>'}
async function review(id,status){await api('/admin/submissions/'+id,{method:'PATCH',body:JSON.stringify({status})});await loadAdminQueue();await loadPoems()}
async function toggleFeature(id,featured){await api('/admin/featured/'+id,{method:'PATCH',body:JSON.stringify({featured})});await loadAdminQueue()}
async function deletePoem(id){if(!confirm('Delete this poem permanently?'))return;await api('/admin/poems/'+id,{method:'DELETE'});await loadAdminQueue();await loadPoems()}
async function adminAddPoem(){const title=prompt('Poem title:');if(!title)return;const text=prompt('Poem text:');if(!text)return;const category=prompt('Category:',categories[0]);const language=prompt('Language:','Urdu / English');await api('/admin/poems',{method:'POST',body:JSON.stringify({title,text,category,language,authorName:'PoetryVerse Editorial',status:'approved'})});await loadPoems();alert('Poetry added and published.')}
async function loadAdminPoems(){const d=await api('/poems?sort=latest');document.getElementById('accountContent').innerHTML='<h2>Published Poetry Management</h2>'+d.poems.map(s=>'<div class="adminRow"><b>'+esc(s.title)+'</b><div class="muted">'+esc(s.authorName)+' · '+esc(s.category)+'</div><div class="actions"><button class="mini" onclick="deletePoem(\''+s.id+'\')">Delete</button><button class="mini" onclick="toggleFeature(\''+s.id+'\','+(!s.featured)+')">'+(s.featured?'Unfeature':'Feature')+'</button></div></div>').join('')+'<button class="ghost" onclick="openAdmin()">Back</button>'}
async function loadAdminUsers(){const d=await api('/admin/users');document.getElementById('accountContent').innerHTML='<h2>User Management</h2>'+d.users.map(u=>'<div class="adminRow"><div><b>'+esc(u.name)+'</b><div class="muted">'+esc(u.email)+' · '+esc(u.plan)+' · '+(u.unlimitedCredits?'Unlimited':u.credits)+' credits</div></div><div class="actions"><button class="mini" onclick="setUserPlan(\''+u.id+'\',\'free\')">Free</button><button class="mini" onclick="setUserPlan(\''+u.id+'\',\'pro1\')">P1</button><button class="mini" onclick="setUserPlan(\''+u.id+'\',\'pro2\')">P2</button><button class="mini" onclick="setUserPlan(\''+u.id+'\',\'pro3\')">P3</button><button class="mini" onclick="setUserPlan(\''+u.id+'\',\'pro4\')">P4</button><button class="mini" onclick="setUserCredits(\''+u.id+'\')">Credits</button><button class="mini" onclick="deleteUser(\''+u.id+'\')">Delete</button></div></div>').join('')+'<button class="ghost" onclick="openAdmin()">Back</button>'}
async function setUserPlan(id,plan){await api('/admin/users/'+id,{method:'PATCH',body:JSON.stringify({plan})});await loadAdminUsers()}
async function setUserCredits(id){const v=prompt('Enter credits (-1 = unlimited):','300');if(v===null)return;await api('/admin/users/'+id,{method:'PATCH',body:JSON.stringify({credits:Number(v),unlimitedCredits:Number(v)<0})});await loadAdminUsers()}
async function deleteUser(id){if(!confirm('Delete this user permanently?'))return;await api('/admin/users/'+id,{method:'DELETE'});await loadAdminUsers()}
async function loadPoets(){const d=await api('/poets');document.getElementById('poetGrid').innerHTML=d.poets.map(p=>'<article class="feature"><b>'+esc(p.name)+'</b><div class="muted">'+esc(p.language)+' · '+esc(p.rights)+'</div><p>'+esc(p.bio)+'</p><button class="mini" onclick="searchPoet(\''+p.slug+'\')">Explore poetry</button></article>').join('')}
function searchPoet(slug){document.getElementById('searchInput').value='';selectedCategory='';selectedPoet=slug;scrollToId('discover');loadPoems()}
function renderPlans(){const ps=${JSON.stringify(PLANS)};document.getElementById('priceGrid').innerHTML=Object.values(ps).map(p=>'<div class="plan"><h3>'+p.name+'</h3><div class="price">'+(p.price?'$'+p.price.toFixed(2):'Free')+'<small>/month</small></div><div class="muted">'+p.monthlyCredits.toLocaleString()+' AI credits / month</div><button class="gradient" style="margin-top:14px;width:100%" onclick="subscribe(\''+p.id+'\')">'+(p.id==='free'?'Use Free':'Choose '+p.name)+'</button></div>').join('')}
async function subscribe(plan){if(!user){openAuth();return}try{const d=await api('/billing/subscribe',{method:'POST',body:JSON.stringify({plan})});if(d.checkoutUrl)location.href=d.checkoutUrl;else{alert(d.message||'Plan updated.');user=d.user;updateUI()}}catch(e){alert(e.message)}}
async function initQuote(){try{const d=await api('/quote');document.getElementById('heroQuote').textContent=d.text;document.getElementById('hourQuote').textContent=d.language+' · '+d.text}catch{}}
renderCategories();renderPlans();restore();loadPoems();loadPoets();initQuote();setInterval(initQuote,60000);
</script></body></html>`;

async function ensureAdmin() {
  if (!ADMIN_PASSWORD) return;
  const found = await kv.get<User>(["userByEmail", ADMIN_EMAIL]);
  const now = new Date().toISOString();
  if (!found.value) {
    const id = crypto.randomUUID(); const user:User={id,email:ADMIN_EMAIL,name:"PoetryVerse Super Admin",role:"super_admin",createdAt:now,plan:"pro4",credits:0,creditsMonth:monthKey(),unlimitedCredits:true,username:"admin",bio:"PoetryVerse Super Admin",language:"Urdu / English",verified:true,status:"active"};
    await kv.atomic().set(["user",id],user).set(["userByEmail",ADMIN_EMAIL],user).set(["password",id],await hashPassword(ADMIN_PASSWORD)).commit();
  } else if (found.value.role !== "super_admin" || !found.value.unlimitedCredits) {
    const user={...found.value,role:"super_admin" as const,unlimitedCredits:true,verified:true}; await kv.set(["user",user.id],user); await kv.set(["userByEmail",ADMIN_EMAIL],user);
  }
}
async function ensureSeeds() {
  if (!(await kv.get<boolean>(["system","seed-v4"])).value) {
    for (const s of seedPoems) {
      const p:Poem={id:s[0],userId:"system",title:s[1],text:s[2],category:s[3],language:s[4],status:"approved",createdAt:"2026-01-01T00:00:00.000Z",updatedAt:"2026-01-01T00:00:00.000Z",authorName:s[5],poetSlug:"poetryverse-editorial",likes:Math.floor(Math.random()*250)+20,views:Math.floor(Math.random()*1200)+100,featured:["Hope","Ghazal","Spiritual","Love"].includes(s[3]),original:true};
      await kv.set(["poem",p.id],p);
    }
    for (const p of seedPoets) await kv.set(["poet",p.slug],p);
    const categoryLines:Record<string,string>={
      Ghazal:"لفظوں کی نرم ہوا میں دل نے ایک خواب سنایا، رات نے خاموشی اوڑھی اور چاند نے ساتھ نبھایا۔",
      Nazm:"یہ سفر بھی ایک نظم ہے، ہر موڑ پر ایک نیا مصرعہ، ہر صبح میں ایک نئی امید۔",
      Love:"Somewhere between a smile and a silence, love writes the lines we never planned to say.",
      Romantic:"Your name turns an ordinary evening into a page I want to read again.",
      Sad:"کچھ اداسیاں لفظ نہیں مانگتیں، بس ایک خاموش دل اور تھوڑی سی جگہ چاہتی ہیں۔",
      Motivational:"قدم چھوٹا ہو تو بھی سفر رکتا نہیں، ہمت ساتھ ہو تو راستہ بنتا رہتا ہے۔",
      Spiritual:"When the heart remembers gratitude, even a quiet breath can feel like a prayer.",
      Sufi:"دل کو سفر ملا تو منزل کی فکر کم ہوئی، محبت ملی تو خود سے ملاقات ہونے لگی۔",
      Friendship:"A real friend does not need a perfect day; they make difficult days easier to carry.",
      Nature:"The wind moves through the trees like a poem that never needed a pen.",
      Life:"زندگی ہر دن مکمل جواب نہیں دیتی، کبھی کبھی صرف اگلا قدم دکھاتی ہے۔",
      Hope:"Hope is the small light that refuses to leave the window when the night feels long.",
      Humor:"The poet promised one short poem, then accidentally invited the whole night to the page.",
      Rain:"بارش آئی تو شہر بھیگ گیا، اور ایک پرانی یاد نے دل کے دروازے پر دستک دی۔",
      Heartbreak:"A broken heart still knows how to beat; healing begins when it learns a new rhythm.",
      Patriotic:"A homeland grows brighter when its people carry kindness, courage and responsibility.",
      Islamic:"دل میں شکر ہو تو راستے آسان لگتے ہیں، دعا میں اخلاص ہو تو امید زندہ رہتی ہے۔",
      Family:"گھر وہ جگہ ہے جہاں تھکن کو بھی اپنائیت ملتی ہے اور خاموشی کو بھی معنی۔",
      Travel:"Every road keeps a memory, every horizon offers a new sentence to the traveller.",
      Youth:"جوانی صرف عمر نہیں، خواب دیکھنے اور انہیں عمل میں بدلنے کا حوصلہ ہے۔",
      General:"Every feeling deserves a page, and every honest page can become a small piece of light."
    };
    let n=0;for(const cat of CATEGORIES){for(let i=1;i<=2;i++){const id=`seed-cat-${slugify(cat)}-${i}`;const p:Poem={id,userId:"system",title:`${cat} — Verse ${i}`,text:categoryLines[cat]||categoryLines.General,category:cat,language:/[\u0600-\u06ff]/.test(categoryLines[cat]||"")?"Urdu":"English",status:"approved",createdAt:`2026-02-${String((n%20)+1).padStart(2,"0")}T08:00:00.000Z`,updatedAt:"2026-02-01T00:00:00.000Z",authorName:"PoetryVerse Editorial",poetSlug:"poetryverse-editorial",likes:30+n,views:120+n*5,featured:i===1,original:true};await kv.set(["poem",p.id],p);n++;}}
    await kv.set(["system","seed-v4"],true);
  }
}
async function route(req:Request):Promise<Response>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  const url=new URL(req.url);const path=url.pathname.replace(/\/+$/,'')||'/';
  if(req.method==='GET'&&path==='/')return html(page);
  if(req.method==='GET'&&path==='/health')return json({status:'ok',service:'poetryverse',database:'deno-kv',version:'4.0.0'});
  if(req.method==='GET'&&path==='/api')return json({name:'PoetryVerse API',version:'4.0.0',status:'ok',providers:providerAvailability()});
  if(req.method==='GET'&&path==='/quote')return json(quoteForHour());
  if(req.method==='GET'&&path==='/categories')return json({categories:CATEGORIES});
  if(req.method==='GET'&&path==='/plans')return json({plans:PLANS});
  if(req.method==='GET'&&path==='/ai/providers')return json({providers:providerAvailability(),selected:selectProvider()});

  if(req.method==='POST'&&path==='/auth/signup'){
    const d=await body(req),email=String(d.email??'').trim().toLowerCase(),password=String(d.password??''),name=String(d.name??'').trim();
    if(!email||!password||!name)return json({error:'Name, email and password are required.'},400);if(password.length<8)return json({error:'Password must be at least 8 characters.'},400);if(email===ADMIN_EMAIL)return json({error:'This email is reserved for the PoetryVerse Super Admin. Use the configured admin password.'},403);
    if((await kv.get<User>(['userByEmail',email])).value)return json({error:'An account with this email already exists.'},409);
    const id=crypto.randomUUID(),now=new Date().toISOString(),u:User={id,email,name,role:'user',createdAt:now,plan:'free',credits:300,creditsMonth:monthKey(),username:slugify(name).slice(0,24)||email.split('@')[0],bio:'',language:'Urdu / English',verified:false,status:'active'};
    const tx=await kv.atomic().check({key:['userByEmail',email],versionstamp:null}).set(['user',id],u).set(['userByEmail',email],u).set(['password',id],await hashPassword(password)).commit();if(!tx.ok)return json({error:'Please try again.'},409);const t=randomToken();await kv.set(['session',t],{userId:id,createdAt:now},{expireIn:30*24*60*60*1000});return json({user:safeUser(u),token:t},201);
  }
  if(req.method==='POST'&&path==='/auth/login'){
    const d=await body(req),email=String(d.email??'').trim().toLowerCase(),password=String(d.password??'');const got=await kv.get<User>(['userByEmail',email]);if(!got.value)return json({error:'Invalid email or password.'},401);const pw=await kv.get<string>(['password',got.value.id]);if(!pw.value||!(await verifyPassword(password,pw.value)))return json({error:'Invalid email or password.'},401);if(got.value.status==='suspended')return json({error:'This account is suspended.'},403);const t=randomToken();await kv.set(['session',t],{userId:got.value.id,createdAt:new Date().toISOString()},{expireIn:30*24*60*60*1000});return json({user:safeUser(got.value),token:t});
  }
  if(req.method==='POST'&&path==='/auth/logout'){const a=req.headers.get('authorization')??'';if(a.startsWith('Bearer '))await kv.delete(['session',a.slice(7)]);return json({ok:true})}
  if(req.method==='GET'&&path==='/auth/me'){const u=await currentUser(req);return u?json({user:safeUser(u)}):json({error:'Not authenticated.'},401)}

  if(req.method==='GET'&&path==='/poems'){
    const q=(url.searchParams.get('q')??'').trim().toLowerCase(),category=(url.searchParams.get('category')??'').trim().toLowerCase(),poet=(url.searchParams.get('poet')??'').trim().toLowerCase(),sort=url.searchParams.get('sort')??'latest';const arr:Poem[]=[];
    for await(const e of kv.list<Poem>({prefix:['poem']})){const p=e.value;if(!p||p.status!=='approved')continue;if(category&&p.category.toLowerCase()!==category)continue;if(poet&&p.poetSlug!==poet)continue;if(q&&!`${p.title} ${p.text} ${p.category} ${p.authorName} ${p.language}`.toLowerCase().includes(q))continue;arr.push(p)}
    arr.sort(sort==='popular'?(a,b)=>b.likes-a.likes:sort==='featured'?(a,b)=>Number(b.featured)-Number(a.featured)||b.createdAt.localeCompare(a.createdAt):(a,b)=>b.createdAt.localeCompare(a.createdAt));return json({poems:arr.slice(0,100)});
  }
  if(req.method==='GET'&&path==='/poets'){const out:any[]=[];for await(const e of kv.list<any>({prefix:['poet']}))out.push(e.value);return json({poets:out})}
  if(req.method==='GET'&&path.startsWith('/poets/')){const slug=path.split('/').pop()!;const p=await kv.get<any>(['poet',slug]);if(!p.value)return json({error:'Poet not found.'},404);const poems:Poem[]=[];for await(const e of kv.list<Poem>({prefix:['poem']}))if(e.value?.status==='approved'&&e.value.poetSlug===slug)poems.push(e.value);return json({poet:p.value,poems})}

  if(req.method==='POST'&&path==='/submissions'){
    const u=await currentUser(req);if(!u)return json({error:'Login required.'},401);const d=await body(req),title=String(d.title??'').trim(),text=String(d.text??'').trim(),category=String(d.category??'General').trim(),language=String(d.language??'Urdu / English');if(!title||!text)return json({error:'Title and poetry are required.'},400);if(title.length>160||text.length>12000)return json({error:'Poetry is too long.'},400);const now=new Date().toISOString(),p:Poem={id:crypto.randomUUID(),userId:u.id,title,text,category:CATEGORIES.includes(category)?category:'General',language,status:'pending',createdAt:now,updatedAt:now,authorName:u.name,poetSlug:u.username,likes:0,views:0,featured:false,original:true};await kv.set(['poem',p.id],p);await kv.set(['submissionByUser',u.id,p.createdAt,p.id],p.id);return json({poem:p},201);
  }
  if(req.method==='GET'&&path==='/submissions/mine'){const u=await currentUser(req);if(!u)return json({error:'Login required.'},401);const arr:Poem[]=[];for await(const e of kv.list<string>({prefix:['submissionByUser',u.id]})){const p=await kv.get<Poem>(['poem',e.value]);if(p.value)arr.push(p.value)}arr.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return json({submissions:arr})}
  if(req.method==='POST'&&path==='/drafts'){const u=await currentUser(req);if(!u)return json({error:'Login required.'},401);const d=await body(req),text=String(d.text??'').trim();if(!text)return json({error:'Draft is empty.'},400);const id=crypto.randomUUID();await kv.set(['draft',u.id,new Date().toISOString(),id],{id,userId:u.id,text,createdAt:new Date().toISOString()});return json({ok:true,id},201)}
  if(req.method==='GET'&&path==='/drafts'){const u=await currentUser(req);if(!u)return json({error:'Login required.'},401);const arr:any[]=[];for await(const e of kv.list({prefix:['draft',u.id]}))arr.push(e.value);return json({drafts:arr.slice(-50).reverse()})}
  if(req.method==='POST'&&path.startsWith('/poems/')&&path.endsWith('/like')){const u=await currentUser(req);if(!u)return json({error:'Login required.'},401);const id=path.split('/')[2],p=await kv.get<Poem>(['poem',id]);if(!p.value||p.value.status!=='approved')return json({error:'Poem not found.'},404);const k=['like',u.id,id] as Deno.KvKey,old=await kv.get(k);const updated={...p.value,likes:Math.max(0,p.value.likes+(old.value?-1:1))};if(old.value)await kv.delete(k);else await kv.set(k,true);await kv.set(['poem',id],updated);return json({liked:!old.value,likes:updated.likes})}
  if(req.method==='POST'&&path.startsWith('/poems/')&&path.endsWith('/save')){const u=await currentUser(req);if(!u)return json({error:'Login required.'},401);const id=path.split('/')[2],p=await kv.get<Poem>(['poem',id]);if(!p.value||p.value.status!=='approved')return json({error:'Poem not found.'},404);const k=['save',u.id,id] as Deno.KvKey,old=await kv.get(k);if(old.value)await kv.delete(k);else await kv.set(k,true);return json({saved:!old.value})}
  if(req.method==='GET'&&path==='/saved'){const u=await currentUser(req);if(!u)return json({error:'Login required.'},401);const arr:Poem[]=[];for await(const e of kv.list({prefix:['save',u.id]})){const p=await kv.get<Poem>(['poem',String(e.key[2])]);if(p.value?.status==='approved')arr.push(p.value)}return json({poems:arr})}
  if(req.method==='POST'&&path.startsWith('/poems/')&&path.endsWith('/comments')){const u=await currentUser(req);if(!u)return json({error:'Login required.'},401);const id=path.split('/')[2],d=await body(req),text=String(d.text??'').trim();if(!text||text.length>800)return json({error:'Comment must be 1–800 characters.'},400);const c:PoetryComment={id:crypto.randomUUID(),poemId:id,userId:u.id,userName:u.name,text,createdAt:new Date().toISOString()};await kv.set(['comment',id,c.createdAt,c.id],c);return json({comment:c},201)}
  if(req.method==='GET'&&path.startsWith('/poems/')&&path.endsWith('/comments')){const id=path.split('/')[2],arr:PoetryComment[]=[];for await(const e of kv.list<PoetryComment>({prefix:['comment',id]}))arr.push(e.value);arr.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return json({comments:arr.slice(0,100)})}

  if(req.method==='POST'&&path==='/ai/generate'){
    let u=await currentUser(req);if(!u)return json({error:'Login required.'},401);const d=await body(req),prompt=String(d.prompt??'').trim(),mode=String(d.mode??'poetry'),language=String(d.language??'Urdu');if(!prompt)return json({error:'Please enter a creative prompt.'},400);let charged=0;try{u=await consumeCredit(u,1)}catch(e){return json({error:e instanceof Error?e.message:'Credit limit reached.'},402)}
    const system=`You are PoetryVerse AI Studio, a premium poetry and writing assistant. Write original content; do not reproduce copyrighted poems. Respect the requested language (${language}). Mode: ${mode}. Return only the useful creative result, no meta commentary.`;
    let provider=selectProvider(String(d.provider??'')),text='';try{text=await providerCall(provider,prompt,system)}catch(e){provider='local';text=localPoem(prompt)}if(!text)text=localPoem(prompt);return json({text,provider,chargedCredits:charged,user:safeUser(u)});
  }

  if(req.method==='POST'&&path==='/billing/subscribe'){
    const u=await currentUser(req);if(!u)return json({error:'Login required.'},401);const d=await body(req),plan=String(d.plan??'free') as PlanId;if(!PLANS[plan])return json({error:'Unknown plan.'},400);if(plan==='free'){const up={...u,plan:'free' as PlanId,credits:300,creditsMonth:monthKey()};await kv.set(['user',u.id],up);await kv.set(['userByEmail',u.email],up);return json({user:safeUser(up),message:'Free plan activated.'})}
    const priceId=Deno.env.get(`STRIPE_PRICE_${plan.toUpperCase()}`)??'';const stripe=Deno.env.get('STRIPE_SECRET_KEY')??'';if(!stripe||!priceId)return json({error:'Paid checkout is ready but payment credentials are not configured yet. Super Admin can activate a plan manually, or configure Stripe environment variables.'},503);
    const params=new URLSearchParams();params.set('mode','subscription');params.set('line_items[0][price]',priceId);params.set('line_items[0][quantity]','1');params.set('success_url',new URL('/?billing=success',req.url).toString());params.set('cancel_url',new URL('/?billing=cancel',req.url).toString());params.set('customer_email',u.email);const r=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${stripe}`,'content-type':'application/x-www-form-urlencoded'},body:params});const out=await r.json();if(!r.ok)return json({error:out?.error?.message||'Stripe checkout failed.'},502);return json({checkoutUrl:out.url});
  }

  if(req.method==='GET'&&path==='/stats'){let users=0,poems=0,pending=0,likes=0;for await(const e of kv.list<User>({prefix:['user']}))if(e.value?.id)users++;for await(const e of kv.list<Poem>({prefix:['poem']}))if(e.value?.id){if(e.value.status==='approved')poems++;if(e.value.status==='pending')pending++;likes+=e.value.likes}return json({users,poems,pending,likes})}

  if(path.startsWith('/admin/')){
    const u=await currentUser(req);if(!requireAdmin(u))return json({error:'Super Admin access required.'},403);
    if(req.method==='GET'&&path==='/admin/overview'){let users=0,poems=0,pending=0,likes=0;for await(const e of kv.list<User>({prefix:['user']}))if(e.value?.id)users++;for await(const e of kv.list<Poem>({prefix:['poem']}))if(e.value?.id){if(e.value.status==='approved')poems++;if(e.value.status==='pending')pending++;likes+=e.value.likes}return json({users,poems,pending,likes,adminEmail:ADMIN_EMAIL,unlimitedCredits:true})}
    if(req.method==='GET'&&path==='/admin/submissions'){const arr:Poem[]=[];for await(const e of kv.list<Poem>({prefix:['poem']}))if(e.value?.status==='pending'||e.value?.userId!=='system')arr.push(e.value);arr.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return json({submissions:arr})}
    if(req.method==='PATCH'&&path.startsWith('/admin/submissions/')){const id=path.split('/').pop()!,p=await kv.get<Poem>(['poem',id]);if(!p.value)return json({error:'Poem not found.'},404);const d=await body(req),status=String(d.status??'');if(!['approved','rejected'].includes(status))return json({error:'Invalid status.'},400);const up={...p.value,status:status as Poem['status'],updatedAt:new Date().toISOString()};await kv.set(['poem',id],up);return json({poem:up})}
    if(req.method==='PATCH'&&path.startsWith('/admin/featured/')){const id=path.split('/').pop()!,p=await kv.get<Poem>(['poem',id]);if(!p.value)return json({error:'Poem not found.'},404);const d=await body(req),up={...p.value,featured:Boolean(d.featured),updatedAt:new Date().toISOString()};await kv.set(['poem',id],up);return json({poem:up})}
    if(req.method==='DELETE'&&path.startsWith('/admin/poems/')){const id=path.split('/').pop()!;await kv.delete(['poem',id]);return json({ok:true})}
    if(req.method==='POST'&&path==='/admin/poems'){const d=await body(req),title=String(d.title??'').trim(),text=String(d.text??'').trim(),category=String(d.category??'General'),language=String(d.language??'Urdu / English'),authorName=String(d.authorName??'PoetryVerse Editorial'),status=(d.status==='pending'||d.status==='rejected')?d.status:'approved';if(!title||!text)return json({error:'Title and text are required.'},400);const now=new Date().toISOString(),p:Poem={id:crypto.randomUUID(),userId:'admin',title,text,category:CATEGORIES.includes(category)?category:'General',language,status,createdAt:now,updatedAt:now,authorName,poetSlug:slugify(authorName)||'poetryverse-editorial',likes:0,views:0,featured:Boolean(d.featured),original:true};await kv.set(['poem',p.id],p);return json({poem:p},201)}
if(req.method==='PATCH'&&path.startsWith('/admin/poems/')){const id=path.split('/').pop()!,g=await kv.get<Poem>(['poem',id]);if(!g.value)return json({error:'Poem not found.'},404);const d=await body(req),up={...g.value,...(d.title!==undefined?{title:String(d.title).slice(0,160)}:{}),...(d.text!==undefined?{text:String(d.text).slice(0,12000)}:{}),...(d.category!==undefined?{category:CATEGORIES.includes(String(d.category))?String(d.category):g.value.category}:{}),...(d.language!==undefined?{language:String(d.language)}:{}),...(d.authorName!==undefined?{authorName:String(d.authorName),poetSlug:slugify(String(d.authorName))}:{}),...(d.status!==undefined?{status:String(d.status) as Poem['status']}:{}),updatedAt:new Date().toISOString()};await kv.set(['poem',id],up);return json({poem:up})}
if(req.method==='GET'&&path==='/admin/users'){const arr:User[]=[];for await(const e of kv.list<User>({prefix:['user']}))if(e.value?.id)arr.push(e.value);return json({users:arr.map(safeUser)})}
    if(req.method==='DELETE'&&path.startsWith('/admin/users/')){const id=path.split('/').pop()!;if(id===u!.id)return json({error:'Super Admin cannot delete the current account.'},400);const g=await kv.get<User>(['user',id]);if(!g.value)return json({error:'User not found.'},404);await kv.delete(['user',id]);await kv.delete(['userByEmail',g.value.email]);await kv.delete(['password',id]);return json({ok:true})}
if(req.method==='PATCH'&&path.startsWith('/admin/users/')){const id=path.split('/').pop()!,g=await kv.get<User>(['user',id]);if(!g.value)return json({error:'User not found.'},404);const d=await body(req),plan=String(d.plan??g.value.plan) as PlanId;let up={...g.value};if(PLANS[plan])up={...up,plan,credits:Number.isFinite(Number(d.credits))?Number(d.credits):planCredits(plan),creditsMonth:monthKey()};if('unlimitedCredits' in d)up.unlimitedCredits=Boolean(d.unlimitedCredits);if('credits' in d&&Number.isFinite(Number(d.credits)))up.credits=Number(d.credits);if('status' in d)up.status=d.status==='suspended'?'suspended':'active';if('role' in d&&d.role==='super_admin')up.role='super_admin';await kv.set(['user',id],up);await kv.set(['userByEmail',up.email],up);return json({user:safeUser(up)})}
  }

  if(req.method==='POST'&&path==='/setup/admin'){if(!SETUP_KEY||req.headers.get('x-setup-key')!==SETUP_KEY)return json({error:'Invalid setup key.'},403);const d=await body(req),email=String(d.email??ADMIN_EMAIL).trim().toLowerCase();const g=await kv.get<User>(['userByEmail',email]);if(!g.value)return json({error:'Create the user first or set ADMIN_PASSWORD in environment variables.'},404);const up={...g.value,role:'super_admin' as const,unlimitedCredits:true,verified:true};await kv.set(['user',up.id],up);await kv.set(['userByEmail',email],up);return json({user:safeUser(up)})}

  if(req.method==='GET'&&path==='/about')return html(page.replace('<main class="container" id="top">','<main class="container" id="top"><section class="section"><h1>About PoetryVerse</h1><p class="sub">PoetryVerse — The World of Poetry is a multilingual, creator-friendly home for meaningful words, original poetry and responsible AI-assisted creativity.</p></section>'));
  if(req.method==='GET'&&path==='/privacy')return html(page.replace('<main class="container" id="top">','<main class="container" id="top"><section class="section"><h1>Privacy</h1><p class="sub">PoetryVerse stores account, session, content and preference data in Deno KV. AI provider keys remain server-side. Users should not submit private or sensitive information into public poetry fields.</p></section>'));
  if(req.method==='GET'&&path==='/terms')return html(page.replace('<main class="container" id="top">','<main class="container" id="top"><section class="section"><h1>Terms</h1><p class="sub">Users must submit original or properly licensed work. Community submissions are reviewed before publication. PoetryVerse may remove unlawful, abusive or infringing content.</p></section>'));
  if(req.method==='GET'&&path==='/robots.txt')return new Response(`User-agent: *\nAllow: /\nSitemap: ${url.origin}/sitemap.xml\n`,{headers:{'content-type':'text/plain'}});
  if(req.method==='GET'&&path==='/sitemap.xml')return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url.origin}/</loc><changefreq>daily</changefreq><priority>1</priority></url><url><loc>${url.origin}/about</loc></url><url><loc>${url.origin}/privacy</loc></url><url><loc>${url.origin}/terms</loc></url></urlset>`,{headers:{'content-type':'application/xml'}});
  if(req.method==='GET'&&path==='/manifest.webmanifest')return new Response(JSON.stringify({name:'PoetryVerse — The World of Poetry',short_name:'PoetryVerse',start_url:'/',display:'standalone',background_color:'#f7f7fb',theme_color:'#111827',description:'Read, create, save and share Urdu and English poetry.'}),{headers:{'content-type':'application/manifest+json'}});
  return json({error:'Route not found.'},404);
}

await ensureSeeds();
await ensureAdmin();
Deno.serve({port:PORT},async req=>{try{return await route(req)}catch(e){console.error(e);return json({error:'Internal server error.'},500)}});
