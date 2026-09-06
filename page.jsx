import { Search, Sparkles, BookOpen, Heart, Download, Share2, PenLine, Trophy } from "lucide-react";

const categories = [
  ["Ghazal","A timeless world of verses"],
  ["Nazm","Poetry with a flowing story"],
  ["Love","Words written from the heart"],
  ["Sad","For feelings that need a voice"],
  ["Motivational","Words that move you forward"],
  ["Spiritual","Poetry for the soul"],
  ["Nature","Beauty in every verse"],
  ["Friendship","Poetry about bonds"],
];

const featured = [
  { poet:"Featured Poet", text:"Every verse carries a feeling, and every feeling deserves a beautiful place." },
  { poet:"PoetryVerse", text:"Read. Feel. Create. Share." },
  { poet:"Your Collection", text:"Save the words you never want to forget." },
];

export default function Home() {
  return (
    <main>
      <div className="install">
        <div><strong>Install PoetryVerse</strong><span>Take your poetry library with you.</span></div>
        <button>Install App</button>
      </div>

      <header className="nav">
        <div className="brand"><div className="logo">✦</div><div><b>PoetryVerse</b><small>The World of Poetry</small></div></div>
        <nav><a href="#library">Library</a><a href="#categories">Categories</a><a href="#ai">AI Writer</a><a href="#community">Community</a></nav>
        <button className="outline">Sign in</button>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">A GLOBAL HOME FOR POETRY</span>
          <h1>Where <em>words</em> become memories.</h1>
          <p>Discover beautiful poetry, build your personal library, create with AI, and share the verses that speak to you.</p>
          <div className="search"><Search size={20}/><input placeholder="Search poetry, poet, category or keyword"/><button>Search</button></div>
          <div className="actions"><button className="primary"><BookOpen size={18}/> Explore Library</button><button className="ghost"><Sparkles size={18}/> Try AI Writer</button></div>
        </div>
        <div className="hero-card">
          <div className="quote-mark">“</div>
          <p>Poetry is the quiet place where the heart learns to speak.</p>
          <span>— PoetryVerse</span>
          <div className="card-actions"><Heart/><Download/><Share2/></div>
        </div>
      </section>

      <section id="library" className="section">
        <div className="section-head"><div><span className="eyebrow">DISCOVER</span><h2>Featured Poetry</h2></div><a href="#">View all →</a></div>
        <div className="poetry-grid">{featured.map((x,i)=><article className="poem" key={i}><span>FEATURED</span><p>“{x.text}”</p><small>— {x.poet}</small><div><Heart size={17}/><Download size={17}/><Share2 size={17}/></div></article>)}</div>
      </section>

      <section id="categories" className="section muted">
        <div className="section-head"><div><span className="eyebrow">EXPLORE</span><h2>Poetry for every feeling</h2></div></div>
        <div className="category-grid">{categories.map(([name,desc])=><article className="category" key={name}><div className="cat-icon">✦</div><h3>{name}</h3><p>{desc}</p><a href="#">Explore →</a></article>)}</div>
      </section>

      <section id="ai" className="ai">
        <div><span className="eyebrow">POWERED BY AI</span><h2>Your ideas. Your feelings. Your poetry.</h2><p>Use PoetryVerse AI Writer to create, rewrite, translate and refine poetry. Public users start with <b>300 credits every month</b>.</p><button className="primary"><PenLine size={18}/> Open AI Writer</button></div>
        <div className="credit"><Sparkles size={26}/><b>300</b><span>Monthly AI Credits</span><small>Credits renew automatically each month</small></div>
      </section>

      <section id="community" className="community">
        <div className="badge"><Trophy size={26}/><b>Weekly Community Rewards</b><span>Top 10 active users earn <strong>50 AI credits</strong> every week.</span></div>
        <div><h2>Build your library. Find your people.</h2><p>Create a profile, save favorites, collect poetry, earn badges and submit your own original work for review.</p></div>
      </section>

      <footer><div className="brand"><div className="logo">✦</div><div><b>PoetryVerse</b><small>The World of Poetry</small></div></div><div className="links"><a>About</a><a>Privacy</a><a>Terms</a><a>Copyright</a><a>Support</a></div><p>© 2026 PoetryVerse. All rights reserved. <b>Powered by AI Markaz™</b></p></footer>
    </main>
  );
}