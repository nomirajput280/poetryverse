"use client";

import { useEffect, useState } from "react";
import { Search, Sparkles, BookOpen, Heart, Download, Share2, PenLine, Trophy, UserRound, LogOut, Send, X, CheckCircle2 } from "lucide-react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "https://poetryverse.786.deno.net").replace(/\/$/, "");

const categories = [
  ["Ghazal", "A timeless world of verses"], ["Nazm", "Poetry with a flowing story"],
  ["Love", "Words written from the heart"], ["Sad", "For feelings that need a voice"],
  ["Motivational", "Words that move you forward"], ["Spiritual", "Poetry for the soul"],
  ["Nature", "Beauty in every verse"], ["Friendship", "Poetry about bonds"],
];

const featured = [
  { poet: "Featured Poet", text: "Every verse carries a feeling, and every feeling deserves a beautiful place." },
  { poet: "PoetryVerse", text: "Read. Feel. Create. Share." },
  { poet: "Your Collection", text: "Save the words you never want to forget." },
];

async function api(path, options = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("poetryverse_token") : null;
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export default function Home() {
  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [poems, setPoems] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitForm, setSubmitForm] = useState({ title: "", category: "Ghazal", text: "" });
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mine, setMine] = useState([]);
  const [mineOpen, setMineOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("poetryverse_token");
    if (!token) return;
    api("/auth/me").then(data => setUser(data.user)).catch(() => localStorage.removeItem("poetryverse_token"));
  }, []);

  async function doAuth(e) {
    e.preventDefault(); setAuthBusy(true); setAuthError("");
    try {
      const data = await api(authMode === "login" ? "/auth/login" : "/auth/signup", {
        method: "POST", body: JSON.stringify(authMode === "login" ? { email: authForm.email, password: authForm.password } : authForm)
      });
      localStorage.setItem("poetryverse_token", data.token);
      setUser(data.user); setAuthOpen(false); setAuthForm({ name: "", email: "", password: "" });
    } catch (err) { setAuthError(err.message); }
    finally { setAuthBusy(false); }
  }

  async function logout() {
    try { await api("/auth/logout", { method: "POST" }); } catch {}
    localStorage.removeItem("poetryverse_token"); setUser(null); setMine([]); setMineOpen(false);
  }

  async function searchPoems(e, forcedQuery = null) {
    e?.preventDefault();
    const q = forcedQuery ?? query;
    setSearchBusy(true); setSearchMessage("");
    try {
      const data = await api(`/poems?q=${encodeURIComponent(q)}`);
      setPoems(data.poems || []);
      if (!data.poems?.length) setSearchMessage(q ? `No approved poetry found for “${q}” yet.` : "No approved user poetry is available yet.");
    } catch (err) { setSearchMessage(err.message); }
    finally { setSearchBusy(false); }
  }

  async function submitPoetry(e) {
    e.preventDefault(); setSubmitting(true); setSubmitMessage("");
    try {
      await api("/submissions", { method: "POST", body: JSON.stringify(submitForm) });
      setSubmitMessage("Submitted successfully. Your poetry is now pending Super Admin review.");
      setSubmitForm({ title: "", category: "Ghazal", text: "" });
    } catch (err) { setSubmitMessage(err.message); }
    finally { setSubmitting(false); }
  }

  async function loadMine() {
    if (!user) { setAuthMode("login"); setAuthOpen(true); return; }
    try { const data = await api("/submissions/mine"); setMine(data.submissions || []); setMineOpen(true); } catch (err) { alert(err.message); }
  }

  return (
    <main>
      <div className="install"><div><strong>Install PoetryVerse</strong><span>Take your poetry library with you.</span></div><button>Install App</button></div>

      <header className="nav">
        <div className="brand"><div className="logo">✦</div><div><b>PoetryVerse</b><small>The World of Poetry</small></div></div>
        <nav><a href="#library">Library</a><a href="#categories">Categories</a><a href="#ai">AI Writer</a><a href="#community">Community</a></nav>
        {user ? <div className="user-actions"><span className="user-chip"><UserRound size={16}/> {user.name}</span><button className="outline" onClick={logout}><LogOut size={15}/> Logout</button></div> : <button className="outline" onClick={() => {setAuthMode("login");setAuthOpen(true)}}>Sign in</button>}
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">A GLOBAL HOME FOR POETRY</span>
          <h1>Where <em>words</em> become memories.</h1>
          <p>Discover beautiful poetry, build your personal library, create with AI, and share the verses that speak to you.</p>
          <form className="search" onSubmit={searchPoems}><Search size={20}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search approved poetry, title or category"/><button disabled={searchBusy}>{searchBusy ? "…" : "Search"}</button></form>
          <div className="actions"><button className="primary" onClick={() => document.getElementById("library")?.scrollIntoView()}><BookOpen size={18}/> Explore Library</button><button className="ghost" onClick={() => document.getElementById("ai")?.scrollIntoView()}><Sparkles size={18}/> Try AI Writer</button></div>
          <div className="api-status"><CheckCircle2 size={15}/> Connected to PoetryVerse API</div>
        </div>
        <div className="hero-card"><div className="quote-mark">“</div><p>Poetry is the quiet place where the heart learns to speak.</p><span>— PoetryVerse</span><div className="card-actions"><Heart/><Download/><Share2/></div></div>
      </section>

      <section id="library" className="section">
        <div className="section-head"><div><span className="eyebrow">DISCOVER</span><h2>{query ? "Search Results" : "Featured Poetry"}</h2></div><button className="text-button" onClick={() => searchPoems(null, "")}>View approved →</button></div>
        {poems.length ? <div className="poetry-grid">{poems.map(p => <article className="poem" key={p.id}><span>{p.category?.toUpperCase()}</span><p>“{p.text}”</p><small>— {p.title}</small><div><Heart size={17}/><Download size={17}/><Share2 size={17}/></div></article>)}</div> : <><div className="poetry-grid">{featured.map((x,i)=><article className="poem" key={i}><span>FEATURED</span><p>“{x.text}”</p><small>— {x.poet}</small><div><Heart size={17}/><Download size={17}/><Share2 size={17}/></div></article>)}</div>{searchMessage && <p className="notice">{searchMessage}</p>}</>}
      </section>

      <section id="categories" className="section muted"><div className="section-head"><div><span className="eyebrow">EXPLORE</span><h2>Poetry for every feeling</h2></div></div><div className="category-grid">{categories.map(([name,desc])=><article className="category" key={name}><div className="cat-icon">✦</div><h3>{name}</h3><p>{desc}</p><button onClick={() => {setQuery(name);searchPoems(null,name)}}>Explore →</button></article>)}</div></section>

      <section id="ai" className="ai"><div><span className="eyebrow">POWERED BY AI</span><h2>Your ideas. Your feelings. Your poetry.</h2><p>Use PoetryVerse AI Writer to create, rewrite, translate and refine poetry. Public users start with <b>300 credits every month</b>.</p><button className="primary" onClick={() => {if (!user) {setAuthMode("login");setAuthOpen(true)} else alert("AI Writer is the next integration. Your account is ready with 300 credits.")}}><PenLine size={18}/> Open AI Writer</button></div><div className="credit"><Sparkles size={26}/><b>{user?.credits ?? 300}</b><span>Monthly AI Credits</span><small>Credits renew automatically each month</small></div></section>

      <section id="community" className="community"><div className="badge"><Trophy size={26}/><b>Weekly Community Rewards</b><span>Top 10 active users earn <strong>50 AI credits</strong> every week.</span></div><div><h2>Build your library. Find your people.</h2><p>Create a profile, save favorites, collect poetry, earn badges and submit your own original work for review.</p><div className="community-actions"><button className="primary" onClick={() => {if (!user) {setAuthMode("signup");setAuthOpen(true)} else setSubmitOpen(true)}}><Send size={17}/> Submit Your Poetry</button><button className="outline" onClick={loadMine}>My Submissions</button></div></div></section>

      <footer><div className="brand"><div className="logo">✦</div><div><b>PoetryVerse</b><small>The World of Poetry</small></div></div><div className="links"><a href="#">About</a><a href="#">Privacy</a><a href="#">Terms</a><a href="#">Copyright</a><a href="#community">Support</a></div><p>© 2026 PoetryVerse. All rights reserved. <b>Powered by AI Markaz™</b></p></footer>

      {authOpen && <div className="modal-backdrop" onClick={() => setAuthOpen(false)}><div className="modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setAuthOpen(false)}><X/></button><span className="eyebrow">POETRYVERSE ACCOUNT</span><h2>{authMode === "login" ? "Welcome back" : "Create your account"}</h2><form onSubmit={doAuth}>{authMode === "signup" && <input required placeholder="Your name" value={authForm.name} onChange={e => setAuthForm({...authForm,name:e.target.value})}/>}<input required type="email" placeholder="Email address" value={authForm.email} onChange={e => setAuthForm({...authForm,email:e.target.value})}/><input required minLength={8} type="password" placeholder="Password (8+ characters)" value={authForm.password} onChange={e => setAuthForm({...authForm,password:e.target.value})}/>{authError && <p className="error">{authError}</p>}<button className="primary full" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "login" ? "Sign in" : "Create account"}</button></form><button className="switch" onClick={() => {setAuthMode(authMode === "login" ? "signup" : "login");setAuthError("")}}>{authMode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}</button></div></div>}

      {submitOpen && <div className="modal-backdrop" onClick={() => setSubmitOpen(false)}><div className="modal wide" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setSubmitOpen(false)}><X/></button><span className="eyebrow">COMMUNITY SUBMISSION</span><h2>Submit your original poetry</h2><p className="modal-help">Your submission will stay unpublished until reviewed and approved by the Super Admin.</p><form onSubmit={submitPoetry}><input required placeholder="Poetry title" value={submitForm.title} onChange={e => setSubmitForm({...submitForm,title:e.target.value})}/><select value={submitForm.category} onChange={e => setSubmitForm({...submitForm,category:e.target.value})}>{categories.map(([name])=><option key={name}>{name}</option>)}</select><textarea required rows={8} placeholder="Write your poetry…" value={submitForm.text} onChange={e => setSubmitForm({...submitForm,text:e.target.value})}/>{submitMessage && <p className={submitMessage.startsWith("Submitted") ? "success" : "error"}>{submitMessage}</p>}<button className="primary full" disabled={submitting}>{submitting ? "Submitting…" : "Submit for review"}</button></form></div></div>}

      {mineOpen && <div className="modal-backdrop" onClick={() => setMineOpen(false)}><div className="modal wide" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setMineOpen(false)}><X/></button><span className="eyebrow">MY SUBMISSIONS</span><h2>Your poetry submissions</h2>{mine.length ? <div className="submission-list">{mine.map(p => <div className="submission" key={p.id}><b>{p.title}</b><span className={`status ${p.status}`}>{p.status}</span><p>{p.text}</p></div>)}</div> : <p className="modal-help">You have not submitted any poetry yet.</p>}</div></div>}
    </main>
  );
}
