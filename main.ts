const kv = await Deno.openKv();

const PORT = Number(Deno.env.get("PORT") ?? "8000");
const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") ?? "").trim().toLowerCase();
const SETUP_KEY = Deno.env.get("SETUP_KEY") ?? "";
const FRONTEND_ORIGIN = Deno.env.get("FRONTEND_ORIGIN") ?? "*";

const apiHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": FRONTEND_ORIGIN,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type, authorization, x-setup-key",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: apiHeaders });
}

function html(data: string, status = 200) {
  return new Response(data, { status, headers: { "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "x-frame-options": "DENY", "permissions-policy": "camera=(), microphone=(), geolocation=()" } });
}

async function body(req: Request) {
  try { return await req.json(); } catch { return {}; }
}

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, "0")).join("");
}
function unhex(value: string) {
  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}
async function passwordHash(password: string, saltHex?: string) {
  const salt = saltHex ? unhex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 120_000, hash: "SHA-256" }, key, 256);
  return `${hex(salt.buffer)}:${hex(bits)}`;
}
async function verifyPassword(password: string, stored: string) {
  const [saltHex, expected] = stored.split(":");
  const actual = (await passwordHash(password, saltHex)).split(":")[1];
  return actual === expected;
}

interface User {
  id: string; email: string; name: string; role: "user" | "super_admin";
  createdAt: string; credits: number; bio?: string; username?: string; avatar?: string; language?: string; verified?: boolean;
}
interface Submission {
  id: string; userId: string; title: string; text: string; category: string;
  status: "pending" | "approved" | "rejected"; createdAt: string; reviewedAt?: string; reviewerId?: string; authorName?: string; likes?: number; views?: number; featured?: boolean; language?: string;
}

async function currentUser(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const session = await kv.get<{ userId: string }>(["session", auth.slice(7)]);
  if (!session.value) return null;
  const user = await kv.get<User>(["user", session.value.userId]);
  return user.value ?? null;
}

const seedPoems: Submission[] = [
  { id:"seed-hope", userId:"system", title:"A Little Light", text:`When every road feels lost at night,
keep one small dream within your sight.
The dawn may hide beyond the blue,
but hope still walks beside you.`, category:"Hope", status:"approved", createdAt:"2026-01-10T08:00:00.000Z", authorName:"PoetryVerse Editorial", likes:128, views:820, featured:true, language:"English" },
  { id:"seed-love", userId:"system", title:"A Quiet Feeling", text:`Some feelings never ask for words,
they live like songs the heart has heard.
A gentle thought, a silent smile,
can make a lonely evening worthwhile.`, category:"Love", status:"approved", createdAt:"2026-01-12T08:00:00.000Z", authorName:"PoetryVerse Editorial", likes:214, views:1100, featured:true, language:"English" },
  { id:"seed-urdu", userId:"system", title:"دل کی روشنی", text:`اندھیروں میں بھی امید کا چراغ جلتا ہے،
خاموش دل میں ایک خواب پلتا ہے۔
سفر اگر مشکل ہو تو حوصلہ رکھنا،
ہر رات کے بعد سویرا نکلتا ہے۔`, category:"Motivational", status:"approved", createdAt:"2026-01-14T08:00:00.000Z", authorName:"PoetryVerse Editorial", likes:356, views:1900, featured:true, language:"Urdu" },
  { id:"seed-nature", userId:"system", title:"After the Rain", text:`The earth wears silver after rain,
the leaves remember drops again.
A quiet sky, a softer breeze,
and peace arrives among the trees.`, category:"Nature", status:"approved", createdAt:"2026-01-16T08:00:00.000Z", authorName:"PoetryVerse Editorial", likes:97, views:640, featured:false, language:"English" },
  { id:"seed-friendship", userId:"system", title:"True Friends", text:`A true friend stays when words are few,
when skies are grey and hopes are blue.
No grand promise needs to be said,
some hearts simply walk ahead.`, category:"Friendship", status:"approved", createdAt:"2026-01-18T08:00:00.000Z", authorName:"PoetryVerse Editorial", likes:88, views:510, featured:false, language:"English" },
  { id:"seed-spiritual", userId:"system", title:"Peace", text:`When the heart becomes still,
peace arrives beyond the will.
In gratitude, in quiet prayer,
we find a gentle presence there.`, category:"Spiritual", status:"approved", createdAt:"2026-01-20T08:00:00.000Z", authorName:"PoetryVerse Editorial", likes:171, views:980, featured:true, language:"English" },
  { id:"seed-sad", userId:"system", title:"The Empty Chair", text:`Some rooms are full yet feel alone,
some memories still feel like home.
We learn to carry what has been,
and find new doors in what we mean.`, category:"Sad", status:"approved", createdAt:"2026-01-22T08:00:00.000Z", authorName:"PoetryVerse Editorial", likes:142, views:870, featured:false, language:"English" },
  { id:"seed-ghazal", userId:"system", title:"خوابوں کا سفر", text:`خوابوں کی بستی میں دل پھر سے چل پڑا،
ٹوٹا ہوا سا حوصلہ پھر سنبھل پڑا۔
جو کل تھا دور، آج قریب لگنے لگا،
اک نیا موسم مرے اندر ہی بدل پڑا۔`, category:"Ghazal", status:"approved", createdAt:"2026-01-24T08:00:00.000Z", authorName:"PoetryVerse Editorial", likes:265, views:1450, featured:true, language:"Urdu" },
  { id:"seed-life", userId:"system", title:"Keep Going", text:`You do not need to see the whole road,
just take the next brave step you know.
Small progress is still a song,
and patient hearts can travel long.`, category:"Life", status:"approved", createdAt:"2026-01-26T08:00:00.000Z", authorName:"PoetryVerse Editorial", likes:119, views:720, featured:false, language:"English" },
  { id:"seed-sufi", userId:"system", title:"دل کا راستہ", text:`دل نے جب خاموشی میں خود کو پہچانا،
ہر سمت محبت کا رنگ نظر آیا۔
منزل سے زیادہ سفر خوبصورت تھا،
جب شکر نے دل کو جینا سکھایا۔`, category:"Sufi", status:"approved", createdAt:"2026-01-28T08:00:00.000Z", authorName:"PoetryVerse Editorial", likes:201, views:1020, featured:true, language:"Urdu" },
  { id:"seed-humor", userId:"system", title:"Poet at Midnight", text:`I promised sleep at half past ten,
then wrote one line and wrote again.
The poem grew, the night grew bright,
and morning asked, “You slept alright?”`, category:"Humor", status:"approved", createdAt:"2026-01-30T08:00:00.000Z", authorName:"PoetryVerse Editorial", likes:64, views:430, featured:false, language:"English" },
  { id:"seed-romantic", userId:"system", title:"Your Name", text:`A name can turn a quiet day
into a song that will not fade away.
Some memories softly remain,
like sunlight after gentle rain.`, category:"Romantic", status:"approved", createdAt:"2026-02-01T08:00:00.000Z", authorName:"PoetryVerse Editorial", likes:188, views:990, featured:false, language:"English" },
  { id:"seed-nazm", userId:"system", title:"نئی صبح", text:`نئی صبح کا وعدہ لیے رات ڈھلتی ہے،
امید کی خوشبو ہر سمت ملتی ہے۔
جو خواب دل نے سنبھال کر رکھے،
وقت کے ساتھ ان کی دنیا بدلتی ہے۔`, category:"Nazm", status:"approved", createdAt:"2026-02-03T08:00:00.000Z", authorName:"PoetryVerse Editorial", likes:152, views:830, featured:false, language:"Urdu" },
  { id:"seed-general", userId:"system", title:"A Place for Words", text:`Let every feeling find a page,
let every voice belong to every age.
Read a verse, create a line,
and make the world a little more kind.`, category:"General", status:"approved", createdAt:"2026-02-05T08:00:00.000Z", authorName:"PoetryVerse Editorial", likes:74, views:480, featured:false, language:"English" }
];

const categories = ["Ghazal", "Nazm", "Love", "Motivational", "Nature", "Friendship", "Spiritual", "Sad", "Romantic", "Sufi", "Humor", "Life", "Hope", "General"];

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="theme-color" content="#111827"/>
<title>PoetryVerse — The World of Poetry</title>
<meta name="description" content="PoetryVerse — The World of Poetry. Discover Urdu and English poetry, explore poets and moods, create poetry with AI, save and share verses, and submit your original work to a global poetry community."/>
<meta name="keywords" content="PoetryVerse, Urdu poetry, English poetry, shayari, ghazal, nazm, love poetry, sad poetry, motivational poetry, poets, poetry quotes, AI poetry, poetry website"/>
<meta name="author" content="PoetryVerse — The World of Poetry"/>
<meta name="robots" content="index, follow, max-image-preview:large"/>
<meta name="application-name" content="PoetryVerse"/>
<meta name="apple-mobile-web-app-title" content="PoetryVerse"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="PoetryVerse"/>
<meta property="og:title" content="PoetryVerse — The World of Poetry"/>
<meta property="og:description" content="Read. Feel. Create. Share. A premium Urdu + English poetry community for readers, poets and creators."/>
<meta property="og:url" content="/"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="PoetryVerse — The World of Poetry"/>
<meta name="twitter:description" content="A global home for Urdu and English poetry — discover, create, save and share."/>
<link rel="canonical" href="/"/>
<style>
:root{--bg:#f7f7fb;--card:#fff;--text:#172033;--muted:#6b7280;--line:#e8e9ef;--accent:#7c3aed;--accent2:#ec4899;--dark:#111827;--ok:#059669;--danger:#dc2626;--shadow:0 16px 45px rgba(17,24,39,.08)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input,textarea,select{font:inherit}button{cursor:pointer;border:0}.container{width:min(1120px,92%);margin:auto}.top{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}nav{height:70px;display:flex;align-items:center;justify-content:space-between;gap:18px}.brand{display:flex;align-items:center;gap:10px;font-weight:900;font-size:20px;text-decoration:none;color:var(--dark)}.logo{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:grid;place-items:center;color:white;font-size:20px;box-shadow:0 8px 20px rgba(124,58,237,.25)}.navlinks{display:flex;gap:8px;align-items:center}.navlinks button,.ghost{background:transparent;color:var(--text);padding:10px 13px;border-radius:10px}.navlinks button:hover,.ghost:hover{background:#f1f2f7}.primary{background:var(--dark);color:#fff;padding:11px 16px;border-radius:12px;font-weight:700}.gradient{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;padding:13px 18px;border-radius:12px;font-weight:800;box-shadow:0 12px 25px rgba(124,58,237,.22)}.hero{padding:74px 0 55px;background:radial-gradient(circle at 15% 10%,#ede9fe 0,transparent 34%),radial-gradient(circle at 90% 20%,#fce7f3 0,transparent 34%),var(--bg)}.heroGrid{display:grid;grid-template-columns:1.25fr .75fr;gap:42px;align-items:center}.eyebrow{display:inline-flex;padding:7px 11px;border-radius:999px;background:#ede9fe;color:#6d28d9;font-size:13px;font-weight:800}.hero h1{font-size:clamp(42px,7vw,74px);line-height:.98;letter-spacing:-3px;margin:18px 0}.hero h1 span{background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}.hero p{font-size:18px;line-height:1.7;color:var(--muted);max-width:650px}.searchBox{display:flex;gap:8px;background:#fff;border:1px solid var(--line);padding:8px;border-radius:16px;box-shadow:var(--shadow);margin-top:25px}.searchBox input{flex:1;border:0;outline:0;padding:12px 14px;min-width:0}.heroCard{background:var(--dark);color:#fff;border-radius:28px;padding:28px;box-shadow:var(--shadow);transform:rotate(2deg)}.heroCard .quote{font-family:Georgia,serif;font-size:27px;line-height:1.55}.heroCard small{color:#cbd5e1}.section{padding:60px 0}.sectionHead{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:22px}.sectionHead h2{margin:0;font-size:30px}.muted{color:var(--muted)}.chips{display:flex;gap:9px;flex-wrap:wrap}.chip{background:#fff;border:1px solid var(--line);padding:9px 13px;border-radius:999px;color:#374151}.chip.active,.chip:hover{background:#ede9fe;border-color:#ddd6fe;color:#6d28d9}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px;box-shadow:0 8px 25px rgba(17,24,39,.04)}.poem{min-height:230px;display:flex;flex-direction:column}.poem .tag{font-size:12px;font-weight:800;color:#7c3aed;text-transform:uppercase;letter-spacing:.08em}.poem h3{margin:10px 0}.poemText{font-family:Georgia,serif;font-size:19px;line-height:1.7;white-space:pre-line;flex:1}.poemFoot{display:flex;justify-content:space-between;gap:10px;color:var(--muted);font-size:13px;margin-top:16px}.features{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.feature h3{margin-bottom:7px}.featureIcon{width:42px;height:42px;border-radius:12px;background:#f3e8ff;display:grid;place-items:center;color:#7c3aed;font-size:20px}.cta{background:linear-gradient(135deg,#171923,#312e81);color:#fff;border-radius:26px;padding:38px;display:flex;justify-content:space-between;align-items:center;gap:25px}.cta p{color:#cbd5e1}.footer{padding:38px 0;color:var(--muted);border-top:1px solid var(--line);margin-top:40px}.modal{position:fixed;inset:0;background:rgba(15,23,42,.6);display:none;align-items:center;justify-content:center;padding:18px;z-index:50}.modal.open{display:flex}.modalBox{width:min(520px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:22px;padding:25px;box-shadow:0 25px 80px rgba(0,0,0,.2)}.modalHead{display:flex;justify-content:space-between;align-items:center}.close{background:#f3f4f6;border-radius:10px;width:36px;height:36px}.field{margin:14px 0}.field label{display:block;font-size:13px;font-weight:800;margin-bottom:7px}.field input,.field textarea,.field select{width:100%;border:1px solid #dfe1e8;border-radius:11px;padding:12px;outline:none;background:#fff}.field textarea{min-height:150px;resize:vertical}.formActions{display:flex;gap:10px;justify-content:flex-end}.tabs{display:flex;gap:6px;background:#f3f4f6;padding:5px;border-radius:12px;margin-bottom:16px}.tabs button{flex:1;padding:9px;border-radius:9px;background:transparent}.tabs button.active{background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.06)}.notice{padding:11px 13px;border-radius:11px;background:#fef3c7;color:#92400e;font-size:13px;margin:10px 0}.status{display:inline-block;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800}.pending{background:#fef3c7;color:#92400e}.approved{background:#d1fae5;color:#065f46}.rejected{background:#fee2e2;color:#991b1b}.dashboard{display:none}.dashboard.open{display:block}.adminRow{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:15px 0;border-bottom:1px solid var(--line)}.adminBtns{display:flex;gap:7px}.success{color:var(--ok)}.error{color:var(--danger)}.empty{padding:35px;text-align:center;color:var(--muted);background:#fff;border:1px dashed #d8dae3;border-radius:16px;grid-column:1/-1}@media(max-width:800px){.heroGrid{grid-template-columns:1fr}.heroCard{display:none}.grid,.features{grid-template-columns:1fr}.navlinks button:not(.primary){display:none}.hero{padding-top:45px}.cta{flex-direction:column;align-items:flex-start}.section{padding:45px 0}.hero h1{letter-spacing:-2px}.searchBox{flex-direction:column}.searchBox button{width:100%}}
.premiumBar{background:#111827;color:#fff;text-align:center;padding:8px 12px;font-size:12px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:24px}.stat{background:#fff;border:1px solid var(--line);border-radius:14px;padding:15px;text-align:center}.stat b{display:block;font-size:24px}.verified{color:#2563eb}.urdu{font-family:"Noto Nastaliq Urdu","Noto Naskh Arabic",serif;direction:rtl}.brandSeal{display:inline-flex;align-items:center;gap:6px;font-size:12px;background:#ecfdf5;color:#047857;padding:6px 9px;border-radius:999px;font-weight:800}@media(max-width:800px){.stats{grid-template-columns:repeat(2,1fr)}}
.welcome{padding:22px 0 0}.welcomeCard{background:linear-gradient(135deg,#fff,#faf7ff);border:1px solid #e7defe;border-radius:22px;padding:25px;box-shadow:var(--shadow)}.welcomeCard h2{margin:0 0 8px}.welcomeCard p{margin:0;color:var(--muted);line-height:1.75}.pillRow{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.miniPill{padding:7px 10px;border-radius:999px;background:#fff;border:1px solid var(--line);font-size:12px;font-weight:700}.poemActions{display:flex;gap:8px;margin-top:14px}.iconBtn{background:#f7f7fb;border:1px solid var(--line);border-radius:10px;padding:8px 10px}.iconBtn:hover{background:#ede9fe}.sectionAlt{background:#fff;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.seoCopy{max-width:900px;color:var(--muted);line-height:1.8}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:800px){.welcome{padding-top:10px}}
</style><script type="application/ld+json">${JSON.stringify({"@context":"https://schema.org","@type":"WebSite","name":"PoetryVerse — The World of Poetry","description":"A global Urdu and English poetry community for discovery, creation and sharing.","url":"/","potentialAction":{"@type":"SearchAction","target":"/?q={search_term_string}","query-input":"required name=search_term_string"}})}</script></head>
<body>
<header class="top"><div class="container"><nav><a class="brand" href="#top" aria-label="PoetryVerse home"><span class="logo">✦</span>PoetryVerse</a><div class="navlinks"><button onclick="scrollToId('discover')">Discover</button><button onclick="scrollToId('categories')">Categories</button><button onclick="scrollToId('studio')">AI Studio</button><button onclick="openSubmit()">Submit Poetry</button><button class="primary" onclick="openAuth()" id="authBtn">Login / Sign up</button></div></nav></div></header>
<main id="top">
<section class="hero"><div class="container heroGrid"><div><span class="eyebrow">PoetryVerse — The World of Poetry</span><h1>Read. Feel.<br><span>Create. Share.</span></h1><p>Welcome to a beautiful home for Urdu and English poetry. Discover timeless verses, explore new voices, write your own poetry, and share feelings that deserve to be remembered.</p><div class="searchBox"><input id="searchInput" aria-label="Search poetry" placeholder="Search poetry, poet, feeling or category…" onkeydown="if(event.key==='Enter')searchPoems()"><button class="gradient" onclick="searchPoems()">Search</button></div><div class="pillRow"><span class="miniPill">Urdu + English</span><span class="miniPill">Curated Poetry</span><span class="miniPill">AI Poetry Studio</span><span class="miniPill">Creator Community</span></div></div><div class="heroCard"><div class="quote">“Every verse carries a feeling, and every feeling deserves a beautiful place.”</div><br><small>— PoetryVerse</small></div></div></section>
<section class="welcome"><div class="container"><div class="welcomeCard"><h2>Welcome to PoetryVerse</h2><p>Poetry is more than words — it is memory, emotion, imagination and identity. PoetryVerse brings readers and poets together in one premium, multilingual space where every approved verse can be discovered, loved, saved and shared.</p><div class="pillRow"><span class="miniPill">✨ Discover your mood</span><span class="miniPill">✍️ Publish original poetry</span><span class="miniPill">💜 Save your favorites</span><span class="miniPill">🤖 Create with AI</span></div></div></div></section>
<section class="section" id="categories"><div class="container"><div class="sectionHead"><div><h2>Explore by mood & theme</h2><div class="muted">Choose a feeling, theme or poetic world.</div></div></div><div class="chips" id="categoryChips"><button class="chip active" onclick="chooseCategory('Ghazal',this)">Ghazal</button><button class="chip " onclick="chooseCategory('Nazm',this)">Nazm</button><button class="chip " onclick="chooseCategory('Love',this)">Love</button><button class="chip " onclick="chooseCategory('Motivational',this)">Motivational</button><button class="chip " onclick="chooseCategory('Nature',this)">Nature</button><button class="chip " onclick="chooseCategory('Friendship',this)">Friendship</button><button class="chip " onclick="chooseCategory('Spiritual',this)">Spiritual</button><button class="chip " onclick="chooseCategory('Sad',this)">Sad</button><button class="chip " onclick="chooseCategory('Romantic',this)">Romantic</button><button class="chip " onclick="chooseCategory('Sufi',this)">Sufi</button><button class="chip " onclick="chooseCategory('Humor',this)">Humor</button><button class="chip " onclick="chooseCategory('Life',this)">Life</button><button class="chip " onclick="chooseCategory('Hope',this)">Hope</button><button class="chip " onclick="chooseCategory('General',this)">General</button></div></div></section>
<section class="section" id="discover"><div class="container"><div class="sectionHead"><div><h2 id="poemsTitle">Featured & Latest Poetry</h2><div class="muted">Curated PoetryVerse originals and approved community poetry.</div></div><button class="ghost" onclick="loadPoems()">Refresh</button></div><div class="grid" id="poemGrid"></div></div></section>
<section class="section sectionAlt" id="studio"><div class="container"><div class="sectionHead"><div><h2>AI Poetry Studio</h2><div class="muted">Create, rewrite or translate your ideas with your PoetryVerse credits.</div></div></div><div class="card"><div class="grid" style="grid-template-columns:1fr 1fr"><div><div class="field"><label>What do you want to create?</label><input id="aiPrompt" placeholder="e.g. A hopeful poem about a new beginning"></div><div class="field"><label>Style</label><select id="aiStyle"><option>Free verse</option><option>Ghazal-inspired</option><option>Romantic</option><option>Motivational</option><option>Sad & emotional</option><option>Nature</option></select></div><button class="gradient" onclick="generateLocalPoem()">Generate with AI Studio</button><div class="muted" style="margin-top:10px;font-size:13px">Your account includes starter AI credits. This MVP uses a safe local generation flow; a provider can be connected later.</div></div><div class="card" style="background:#faf9ff"><strong>Studio output</strong><div id="aiOutput" class="poemText" style="margin-top:12px">Your generated poetry will appear here.</div></div></div></div></div></section>
<section class="section"><div class="container"><div class="features"><div class="card feature"><div class="featureIcon">⌕</div><h3>Powerful Discovery</h3><div class="muted">Search by title, words, category, language and mood.</div></div><div class="card feature"><div class="featureIcon">✍</div><h3>Poet Community</h3><div class="muted">Create a profile and submit original poetry for transparent review.</div></div><div class="card feature"><div class="featureIcon">♥</div><h3>Save & Share</h3><div class="muted">Build your personal library with likes, saves and easy sharing.</div></div></div></div></section>
<section class="section"><div class="container"><div class="cta"><div><h2>Have a poem in your heart?</h2><p>Join PoetryVerse and send your original poetry for review.</p></div><button class="gradient" onclick="openSubmit()">Submit your poetry</button></div></div></section>
<section class="section dashboard" id="dashboard"><div class="container"><div class="sectionHead"><div><h2 id="dashTitle">My Poetry</h2><div class="muted">Your profile, credits, submissions and saved library.</div></div><button class="ghost" onclick="logout()">Logout</button></div><div class="card" id="dashContent"></div></div></section>
<section class="section dashboard" id="adminDashboard"><div class="container"><div class="sectionHead"><div><h2>Super Admin Control Center</h2><div class="muted">Review, feature and manage community poetry.</div></div><button class="ghost" onclick="loadAdmin()">Refresh</button></div><div class="card" id="adminContent"></div></div></section>
<section class="section"><div class="container"><div class="seoCopy"><h2>PoetryVerse — a home for every feeling</h2><p>Explore Urdu poetry, English poetry, ghazals, nazms, love poetry, sad poetry, motivational poetry, spiritual verses, nature poetry, friendship poetry and more. PoetryVerse is designed for readers and poets who want a clean, respectful and modern place to discover meaningful words.</p><p>Whether you are looking for a line that describes your heart, a new poet to follow, or a place to publish your original work, PoetryVerse helps you read, feel, create and share.</p></div></div></section>
</main>
<footer class="footer"><div class="container"><strong>PoetryVerse — The World of Poetry</strong> <span style="font-size:11px">Powered by AI Markaz™</span><br><small>Read • Feel • Create • Share</small></div></footer>

<div class="modal" id="authModal"><div class="modalBox"><div class="modalHead"><h2 id="authTitle">Welcome</h2><button class="close" onclick="closeModal('authModal')">×</button></div><div class="tabs"><button class="active" id="loginTab" onclick="setAuthMode('login')">Login</button><button id="signupTab" onclick="setAuthMode('signup')">Create account</button></div><form onsubmit="doAuth(event)"><div class="field" id="nameField" style="display:none"><label>Name</label><input id="authName" autocomplete="name"></div><div class="field"><label>Email</label><input id="authEmail" type="email" autocomplete="email" required></div><div class="field"><label>Password</label><input id="authPassword" type="password" minlength="8" autocomplete="current-password" required></div><div id="authMsg"></div><div class="formActions"><button type="button" class="ghost" onclick="closeModal('authModal')">Cancel</button><button class="gradient" id="authSubmit">Login</button></div></form></div></div>

<div class="modal" id="submitModal"><div class="modalBox"><div class="modalHead"><h2>Submit Original Poetry</h2><button class="close" onclick="closeModal('submitModal')">×</button></div><div class="notice">Your poetry stays unpublished until reviewed and approved by the Super Admin.</div><form onsubmit="submitPoem(event)"><div class="field"><label>Title</label><input id="subTitle" required maxlength="160"></div><div class="field"><label>Category</label><select id="subCategory"></select></div><div class="field"><label>Language</label><select id="subLanguage"><option>Urdu</option><option>English</option><option>Urdu / English</option></select></div><div class="field"><label>Poetry</label><textarea id="subText" required maxlength="12000" placeholder="Write your original poetry here…"></textarea></div><div id="submitMsg"></div><div class="formActions"><button type="button" class="ghost" onclick="closeModal('submitModal')">Cancel</button><button class="gradient">Send for review</button></div></form></div></div>

<script>
const categories = ${JSON.stringify(categories)};
let authMode='login', user=null, token=localStorage.getItem('poetryverse_token')||'', selectedCategory='';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=async(path,options={})=>{const headers={'Content-Type':'application/json',...(options.headers||{})};if(token)headers.Authorization='Bearer '+token;const r=await fetch(path,{...options,headers});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Something went wrong.');return d};
function scrollToId(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth'})}
function closeModal(id){document.getElementById(id)?.classList.remove('open')}
function openAuth(){document.getElementById('authModal').classList.add('open');setAuthMode('login')}
function setAuthMode(mode){authMode=mode;document.getElementById('loginTab').classList.toggle('active',mode==='login');document.getElementById('signupTab').classList.toggle('active',mode==='signup');document.getElementById('nameField').style.display=mode==='signup'?'block':'none';document.getElementById('authSubmit').textContent=mode==='signup'?'Create account':'Login';document.getElementById('authTitle').textContent=mode==='signup'?'Create your PoetryVerse account':'Welcome back';document.getElementById('authMsg').innerHTML=''}
async function doAuth(e){e.preventDefault();const msg=document.getElementById('authMsg');msg.innerHTML='';try{const data=await api('/auth/'+authMode,{method:'POST',body:JSON.stringify({name:document.getElementById('authName').value,email:document.getElementById('authEmail').value,password:document.getElementById('authPassword').value})});token=data.token;localStorage.setItem('poetryverse_token',token);user=data.user;closeModal('authModal');updateUserUI();loadDashboard()}catch(err){msg.innerHTML='<div class="error">'+esc(err.message)+'</div>'}}
async function logout(){try{await api('/auth/logout',{method:'POST'})}catch{}token='';user=null;localStorage.removeItem('poetryverse_token');updateUserUI();document.getElementById('dashboard').classList.remove('open');document.getElementById('adminDashboard').classList.remove('open');scrollToId('top')}
async function restore(){if(!token)return;try{user=(await api('/auth/me')).user;updateUserUI();loadDashboard()}catch{token='';localStorage.removeItem('poetryverse_token')}}
function updateUserUI(){const b=document.getElementById('authBtn');if(user){b.textContent=user.role==='super_admin'?'Admin: '+user.name:user.name;b.onclick=()=>scrollToId(user.role==='super_admin'?'adminDashboard':'dashboard')}else{b.textContent='Login / Sign up';b.onclick=openAuth}}
function chooseCategory(c,el){selectedCategory=c==='All'?'':c;document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));el.classList.add('active');loadPoems()}
function poemCard(p){return '<article class="card poem"><div class="tag">'+esc(p.category)+' · '+esc(p.language||'Urdu / English')+'</div><h3>'+esc(p.title)+'</h3><div class="poemText">'+esc(p.text)+'</div><div class="poemFoot"><span>✦ '+esc(p.authorName||'PoetryVerse')+'</span><span>'+Number(p.likes||0)+' ♥</span></div><div class="poemActions"><button class="iconBtn" onclick="likePoem(\''+p.id+'\')">♥ Like</button><button class="iconBtn" onclick="savePoem(\''+p.id+'\')">🔖 Save</button><button class="iconBtn" onclick="sharePoem(\''+p.id+'\')">↗ Share</button></div></article>'}
async function loadPoems(){const grid=document.getElementById('poemGrid');grid.innerHTML='<div class="empty">Loading poetry…</div>';try{const q=document.getElementById('searchInput').value.trim();const params=new URLSearchParams();if(q)params.set('q',q);if(selectedCategory)params.set('category',selectedCategory);params.set('sort','featured');const data=await api('/poems?'+params.toString());if(!data.poems?.length){grid.innerHTML='<div class="empty">No poetry found for this search. Try another feeling or category.</div>';return}grid.innerHTML=data.poems.map(poemCard).join('')}catch(err){grid.innerHTML='<div class="empty error">'+esc(err.message)+'</div>'}}
function searchPoems(){scrollToId('discover');loadPoems()}
function openSubmit(){if(!user){openAuth();return}document.getElementById('submitModal').classList.add('open');document.getElementById('submitMsg').innerHTML=''}
async function submitPoem(e){e.preventDefault();const msg=document.getElementById('submitMsg');msg.innerHTML='';try{await api('/submissions',{method:'POST',body:JSON.stringify({title:document.getElementById('subTitle').value,text:document.getElementById('subText').value,category:document.getElementById('subCategory').value,language:document.getElementById('subLanguage').value})});msg.innerHTML='<div class="success">Submitted successfully. It is pending Super Admin review.</div>';document.getElementById('subTitle').value='';document.getElementById('subText').value='';setTimeout(()=>{closeModal('submitModal');loadDashboard()},700)}catch(err){msg.innerHTML='<div class="error">'+esc(err.message)+'</div>'}}
async function loadDashboard(){if(!user)return;const box=document.getElementById('dashboard');box.classList.add('open');const content=document.getElementById('dashContent');content.innerHTML='<div><strong>'+esc(user.name)+'</strong><div class="muted">'+esc(user.email)+' · '+Number(user.credits||0)+' AI credits</div></div><hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><div id="mine">Loading your poetry…</div><div style="margin-top:18px"><button class="primary" onclick="openSubmit()">Submit New Poetry</button> <button class="ghost" onclick="loadSaved()">View Saved</button></div>';try{const d=await api('/submissions/mine');document.getElementById('mine').innerHTML=d.submissions?.length?d.submissions.map(s=>'<div class="adminRow"><div><strong>'+esc(s.title)+'</strong><div class="muted">'+esc(s.category)+' · '+new Date(s.createdAt).toLocaleString()+'</div></div><span class="status '+s.status+'">'+esc(s.status)+'</span></div>').join(''):'<div class="muted">No submissions yet.</div>'}catch(err){document.getElementById('mine').innerHTML='<div class="error">'+esc(err.message)+'</div>'}if(user.role==='super_admin'){document.getElementById('adminDashboard').classList.add('open');loadAdmin()}}
async function loadSaved(){try{const d=await api('/saved');const c=document.getElementById('mine');c.innerHTML=d.poems?.length?d.poems.map(poemCard).join(''):'<div class="muted">Your saved library is empty.</div>'}catch(e){alert(e.message)}}
async function likePoem(id){if(!user){openAuth();return}try{const d=await api('/poems/'+id+'/like',{method:'POST'});loadPoems()}catch(e){alert(e.message)}}
async function savePoem(id){if(!user){openAuth();return}try{const d=await api('/poems/'+id+'/save',{method:'POST'});alert(d.saved?'Saved to your library.':'Removed from your library.')}catch(e){alert(e.message)}}
async function sharePoem(id){const url=location.origin+'/?poem='+encodeURIComponent(id);try{await navigator.clipboard.writeText(url);alert('Poetry link copied.')}catch{prompt('Copy this link:',url)}}
function generateLocalPoem(){const prompt=document.getElementById('aiPrompt').value.trim()||'a beautiful new beginning';const style=document.getElementById('aiStyle').value;const out=prompt+'\n\nIn quiet moments, new dreams begin,\nA little light returns within.\nThe road may change, the night may stay,\nBut hope can teach the heart its way.\n\n— PoetryVerse AI Studio · '+style;document.getElementById('aiOutput').textContent=out}
async function loadAdmin(){if(!user||user.role!=='super_admin')return;const box=document.getElementById('adminContent');box.innerHTML='Loading review queue…';try{const d=await api('/admin/submissions');if(!d.submissions?.length){box.innerHTML='<div class="muted">No submissions in the queue.</div>';return}box.innerHTML=d.submissions.map(s=>'<div class="adminRow"><div style="max-width:70%"><strong>'+esc(s.title)+'</strong><div class="muted">'+esc(s.authorName||'Poet')+' · '+esc(s.category)+'</div><div style="margin-top:6px;white-space:pre-line">'+esc(s.text)+'</div><small class="muted">'+new Date(s.createdAt).toLocaleString()+' · '+esc(s.status)+'</small></div><div class="adminBtns">'+(s.status==='pending'?'<button class="primary" onclick="review(\''+s.id+'\',\'approved\')">Approve</button><button class="ghost" onclick="review(\''+s.id+'\',\'rejected\')">Reject</button>':'<span class="status '+s.status+'">'+s.status+'</span>')+'</div></div>').join('')}catch(err){box.innerHTML='<div class="error">'+esc(err.message)+'</div>'}}
async function review(id,status){try{await api('/admin/submissions/'+id,{method:'PATCH',body:JSON.stringify({status})});loadAdmin();loadPoems()}catch(err){alert(err.message)}}
</script>
</body></html>`;

async function ensureSeedData() {
  const marker = await kv.get<boolean>(["system", "seed-v3"]);
  if (marker.value) return;
  for (const poem of seedPoems) {
    const existing = await kv.get<Submission>(["submission", poem.id]);
    if (!existing.value) await kv.set(["submission", poem.id], poem);
  }
  await kv.set(["system", "seed-v3"], true);
}

async function route(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: apiHeaders });
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "GET" && path === "/") return html(page);
  if (req.method === "GET" && path === "/health") return json({ status: "ok", service: "poetryverse-api", database: "deno-kv" });
  if (req.method === "GET" && path === "/api") return json({ name: "PoetryVerse API", status: "ok", version: "2.0.0" });

  if (req.method === "POST" && path === "/auth/signup") {
    const data = await body(req); const email = String(data.email ?? "").trim().toLowerCase(); const rawPassword = String(data.password ?? ""); const name = String(data.name ?? "").trim();
    if (!email || !rawPassword || !name) return json({ error: "Name, email and password are required." }, 400);
    if (rawPassword.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
    const existing = await kv.get<User>(["userByEmail", email]); if (existing.value) return json({ error: "An account with this email already exists." }, 409);
    const id = crypto.randomUUID(); const user: User = { id, email, name, role: ADMIN_EMAIL && email === ADMIN_EMAIL ? "super_admin" : "user", createdAt: new Date().toISOString(), credits: 300, username: email.split("@")[0].replace(/[^a-z0-9_]/g, "").slice(0,24), bio: "", language: "Urdu / English", verified: false }; const password = await passwordHash(rawPassword);
    const result = await kv.atomic().check({ key: ["userByEmail", email], versionstamp: null }).set(["user", id], user).set(["userByEmail", email], user).set(["password", id], password).commit(); if (!result.ok) return json({ error: "Please try again." }, 409);
    const session = token(); await kv.set(["session", session], { userId: id }, { expireIn: 60 * 60 * 24 * 30 * 1000 }); return json({ user, token: session }, 201);
  }
  if (req.method === "POST" && path === "/auth/login") {
    const data = await body(req); const email = String(data.email ?? "").trim().toLowerCase(); const password = String(data.password ?? ""); const found = await kv.get<User>(["userByEmail", email]);
    if (!found.value) return json({ error: "Invalid email or password." }, 401); const stored = await kv.get<string>(["password", found.value.id]); if (!stored.value || !(await verifyPassword(password, stored.value))) return json({ error: "Invalid email or password." }, 401);
    const session = token(); await kv.set(["session", session], { userId: found.value.id }, { expireIn: 60 * 60 * 24 * 30 * 1000 }); return json({ user: found.value, token: session });
  }
  if (req.method === "POST" && path === "/auth/logout") { const auth = req.headers.get("authorization") ?? ""; if (auth.startsWith("Bearer ")) await kv.delete(["session", auth.slice(7)]); return json({ ok: true }); }
  if (req.method === "GET" && path === "/auth/me") { const user = await currentUser(req); return user ? json({ user }) : json({ error: "Not authenticated." }, 401); }

  if (req.method === "POST" && path === "/submissions") {
    const user = await currentUser(req); if (!user) return json({ error: "Login required." }, 401); const data = await body(req); const title = String(data.title ?? "").trim(); const text = String(data.text ?? "").trim(); const category = String(data.category ?? "General").trim();
    if (!title || !text) return json({ error: "Title and poetry text are required." }, 400); if (title.length > 160 || text.length > 12000) return json({ error: "Poetry is too long." }, 400);
    const submission: Submission = { id: crypto.randomUUID(), userId: user.id, title, text, category, status: "pending", createdAt: new Date().toISOString(), authorName: user.name, likes: 0, views: 0, featured: false, language: String(data.language ?? "Urdu / English") }; await kv.set(["submission", submission.id], submission); await kv.set(["submissionByUser", user.id, submission.createdAt, submission.id], submission.id); return json({ submission }, 201);
  }
  if (req.method === "GET" && path === "/submissions/mine") {
    const user = await currentUser(req); if (!user) return json({ error: "Login required." }, 401); const items: Submission[] = [];
    for await (const entry of kv.list<string>({ prefix: ["submissionByUser", user.id] })) { const item = await kv.get<Submission>(["submission", entry.value]); if (item.value) items.push(item.value); }
    items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)); return json({ submissions: items });
  }
  if (req.method === "GET" && path === "/admin/submissions") {
    const user = await currentUser(req); if (!user || user.role !== "super_admin") return json({ error: "Super Admin access required." }, 403); const items: Submission[] = [];
    for await (const entry of kv.list<Submission>({ prefix: ["submission"] })) if (entry.value?.id) items.push(entry.value); items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)); return json({ submissions: items });
  }
  if (req.method === "PATCH" && path.startsWith("/admin/submissions/")) {
    const user = await currentUser(req); if (!user || user.role !== "super_admin") return json({ error: "Super Admin access required." }, 403); const id = path.split("/").pop()!; const item = await kv.get<Submission>(["submission", id]); if (!item.value) return json({ error: "Submission not found." }, 404);
    const data = await body(req); const status = String(data.status ?? ""); if (!(status === "approved" || status === "rejected")) return json({ error: "Status must be approved or rejected." }, 400);
    const updated = { ...item.value, status: status as Submission["status"], reviewedAt: new Date().toISOString(), reviewerId: user.id }; await kv.set(["submission", id], updated); await kv.set(["submissionByUser", updated.userId, updated.createdAt, updated.id], updated.id); return json({ submission: updated });
  }
  if (req.method === "GET" && path === "/poems") {
    const category = url.searchParams.get("category"); const q = (url.searchParams.get("q") ?? "").trim().toLowerCase(); const poems: Submission[] = [];
    for await (const entry of kv.list<Submission>({ prefix: ["submission"] })) { const p = entry.value; if (!p || p.status !== "approved") continue; if (category && p.category.toLowerCase() !== category.toLowerCase()) continue; if (q && !`${p.title} ${p.text} ${p.category} ${p.authorName ?? ""} ${p.language ?? ""}`.toLowerCase().includes(q)) continue; poems.push(p); }
    const sort=url.searchParams.get("sort")??"latest"; poems.sort(sort==="popular"?(a,b)=>Number(b.likes??0)-Number(a.likes??0):sort==="featured"?(a,b)=>Number(Boolean(b.featured))-Number(Boolean(a.featured)) || b.createdAt.localeCompare(a.createdAt): (a,b)=>b.createdAt.localeCompare(a.createdAt)); return json({ poems: poems.slice(0,100) });
  }
  if (req.method === "GET" && path === "/categories") return json({ categories });
  if (req.method === "GET" && path === "/poets") {
    const map = new Map<string, {name:string; poems:number; likes:number}>();
    for await (const e of kv.list<Submission>({prefix:["submission"]})) { const p=e.value; if(!p?.id || p.status!=="approved") continue; const name=p.authorName||"PoetryVerse Editorial"; const x=map.get(name)||{name,poems:0,likes:0}; x.poems++; x.likes+=Number(p.likes||0); map.set(name,x); }
    return json({ poets:[...map.values()].sort((a,b)=>b.likes-a.likes).slice(0,100) });
  }
  if (req.method === "GET" && path === "/stats") {
    let users=0, poems=0, pending=0, likes=0;
    for await (const e of kv.list<User>({prefix:["user"]})) if(e.value?.id) users++;
    for await (const e of kv.list<Submission>({prefix:["submission"]})) if(e.value?.id){ if(e.value.status==="approved") poems++; if(e.value.status==="pending") pending++; likes += Number(e.value.likes??0); }
    return json({users, poems, pending, likes});
  }
  if (req.method === "PATCH" && path === "/profile") {
    const user=await currentUser(req); if(!user) return json({error:"Login required."},401); const data=await body(req);
    const updated={...user, name:String(data.name??user.name).trim().slice(0,80), bio:String(data.bio??user.bio??"").trim().slice(0,500), username:String(data.username??user.username??"").trim().toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,24), language:String(data.language??user.language??"Urdu / English").slice(0,40)};
    await kv.set(["user",user.id],updated); await kv.set(["userByEmail",user.email],updated); return json({user:updated});
  }
  if (req.method === "POST" && path.startsWith("/poems/") && path.endsWith("/like")) {
    const user=await currentUser(req); if(!user) return json({error:"Login required."},401); const id=path.split("/")[2]; const got=await kv.get<Submission>(["submission",id]); if(!got.value||got.value.status!=="approved") return json({error:"Poem not found."},404);
    const lk=["like",user.id,id] as Deno.KvKey; const existing=await kv.get(lk); let updated={...got.value};
    if(existing.value){await kv.delete(lk); updated.likes=Math.max(0,Number(updated.likes??0)-1);}else{await kv.set(lk,true); updated.likes=Number(updated.likes??0)+1;} await kv.set(["submission",id],updated); return json({liked:!existing.value,likes:updated.likes});
  }
  if (req.method === "POST" && path.startsWith("/poems/") && path.endsWith("/save")) {
    const user=await currentUser(req); if(!user) return json({error:"Login required."},401); const id=path.split("/")[2]; const got=await kv.get<Submission>(["submission",id]); if(!got.value||got.value.status!=="approved") return json({error:"Poem not found."},404); const key=["save",user.id,id] as Deno.KvKey; const old=await kv.get(key); old.value?await kv.delete(key):await kv.set(key,true); return json({saved:!old.value});
  }
  if (req.method === "GET" && path === "/saved") {
    const user=await currentUser(req); if(!user) return json({error:"Login required."},401); const poems:Submission[]=[]; for await(const e of kv.list({prefix:["save",user.id]})){const id=String(e.key[2]);const g=await kv.get<Submission>(["submission",id]);if(g.value?.status==="approved")poems.push(g.value)} return json({poems});
  }
  if (req.method === "POST" && path.startsWith("/poems/") && path.endsWith("/comments")) {
    const user=await currentUser(req); if(!user) return json({error:"Login required."},401); const id=path.split("/")[2]; const data=await body(req); const text=String(data.text??"").trim(); if(!text||text.length>800)return json({error:"Comment must be 1–800 characters."},400); const c={id:crypto.randomUUID(),poemId:id,userId:user.id,userName:user.name,text,createdAt:new Date().toISOString()}; await kv.set(["comment",id,c.createdAt,c.id],c); return json({comment:c},201);
  }
  if (req.method === "GET" && path.startsWith("/poems/") && path.endsWith("/comments")) {
    const id=path.split("/")[2]; const comments:any[]=[]; for await(const e of kv.list<any>({prefix:["comment",id]})) comments.push(e.value); comments.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)); return json({comments:comments.slice(0,100)});
  }
  if (req.method === "PATCH" && path.startsWith("/admin/featured/")) {
    const user=await currentUser(req); if(!user||user.role!=="super_admin")return json({error:"Super Admin access required."},403); const id=path.split("/").pop()!; const got=await kv.get<Submission>(["submission",id]); if(!got.value)return json({error:"Poem not found."},404); const data=await body(req); const updated={...got.value,featured:Boolean(data.featured)}; await kv.set(["submission",id],updated); return json({submission:updated});
  }
  if (req.method === "POST" && path === "/setup/admin") {
    if (!SETUP_KEY || req.headers.get("x-setup-key") !== SETUP_KEY) return json({ error: "Invalid setup key." }, 403); const data = await body(req); const email = String(data.email ?? ADMIN_EMAIL).trim().toLowerCase(); if (!email) return json({ error: "Admin email is required." }, 400);
    const found = await kv.get<User>(["userByEmail", email]); if (!found.value) return json({ error: "Create the user account first." }, 404); const user = { ...found.value, role: "super_admin" as const }; await kv.set(["user", user.id], user); await kv.set(["userByEmail", email], user); return json({ user });
  }
  if (req.method === "GET" && path === "/robots.txt") return new Response("User-agent: *\nAllow: /\nSitemap: " + url.origin + "/sitemap.xml\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
  if (req.method === "GET" && path === "/sitemap.xml") return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url.origin}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url></urlset>`, { headers: { "content-type": "application/xml; charset=utf-8" } });
  if (req.method === "GET" && path === "/manifest.webmanifest") return json({ name: "PoetryVerse — The World of Poetry", short_name: "PoetryVerse", start_url: "/", display: "standalone", background_color: "#f7f7fb", theme_color: "#111827", description: "Discover, read, publish and share beautiful poetry." });
  return json({ error: "Route not found." }, 404);
}

await ensureSeedData();

Deno.serve({ port: PORT }, async req => { try { return await route(req); } catch (error) { console.error(error); return json({ error: "Internal server error." }, 500); } });
