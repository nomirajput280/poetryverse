const kv = await Deno.openKv();

const PORT = Number(Deno.env.get("PORT") ?? "8000");
const FRONTEND_ORIGIN = Deno.env.get("FRONTEND_ORIGIN") ?? "*";
const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") ?? "").trim().toLowerCase();
const SETUP_KEY = Deno.env.get("SETUP_KEY") ?? "";

const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": FRONTEND_ORIGIN,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

async function body(req: Request) {
  try { return await req.json(); } catch { return {}; }
}

function token() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
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

async function currentUser(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const session = await kv.get<{ userId: string }>(["session", auth.slice(7)]);
  if (!session.value) return null;
  const user = await kv.get<User>(["user", session.value.userId]);
  return user.value ?? null;
}

type User = {
  id: string; email: string; name: string; role: "user" | "super_admin";
  createdAt: string; credits: number;
};
type Submission = {
  id: string; userId: string; title: string; text: string; category: string;
  status: "pending" | "approved" | "rejected"; createdAt: string; reviewedAt?: string; reviewerId?: string;
};

async function route(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "GET" && path === "/") return json({ name: "PoetryVerse API", status: "ok", version: "1.0.0" });
  if (req.method === "GET" && path === "/health") return json({ status: "ok", service: "poetryverse-api", database: "deno-kv" });

  if (req.method === "POST" && path === "/auth/signup") {
    const data = await body(req);
    const email = String(data.email ?? "").trim().toLowerCase();
    const rawPassword = String(data.password ?? "");
    const name = String(data.name ?? "").trim();
    if (!email || !rawPassword || !name) return json({ error: "Name, email and password are required." }, 400);
    if (rawPassword.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
    const existing = await kv.get<User>(["userByEmail", email]);
    if (existing.value) return json({ error: "An account with this email already exists." }, 409);
    const id = crypto.randomUUID();
    const user: User = { id, email, name, role: ADMIN_EMAIL && email === ADMIN_EMAIL ? "super_admin" : "user", createdAt: new Date().toISOString(), credits: 300 };
    const password = await passwordHash(rawPassword);
    const result = await kv.atomic().check({ key: ["userByEmail", email], versionstamp: null }).set(["user", id], user).set(["userByEmail", email], user).set(["password", id], password).commit();
    if (!result.ok) return json({ error: "Please try again." }, 409);
    const session = token();
    await kv.set(["session", session], { userId: id }, { expireIn: 60 * 60 * 24 * 30 * 1000 });
    return json({ user, token: session }, 201);
  }

  if (req.method === "POST" && path === "/auth/login") {
    const data = await body(req);
    const email = String(data.email ?? "").trim().toLowerCase();
    const password = String(data.password ?? "");
    const found = await kv.get<User>(["userByEmail", email]);
    if (!found.value) return json({ error: "Invalid email or password." }, 401);
    const stored = await kv.get<string>(["password", found.value.id]);
    if (!stored.value || !(await verifyPassword(password, stored.value))) return json({ error: "Invalid email or password." }, 401);
    const session = token();
    await kv.set(["session", session], { userId: found.value.id }, { expireIn: 60 * 60 * 24 * 30 * 1000 });
    return json({ user: found.value, token: session });
  }

  if (req.method === "POST" && path === "/auth/logout") {
    const auth = req.headers.get("authorization") ?? "";
    if (auth.startsWith("Bearer ")) await kv.delete(["session", auth.slice(7)]);
    return json({ ok: true });
  }

  if (req.method === "GET" && path === "/auth/me") {
    const user = await currentUser(req);
    return user ? json({ user }) : json({ error: "Not authenticated." }, 401);
  }

  if (req.method === "POST" && path === "/submissions") {
    const user = await currentUser(req);
    if (!user) return json({ error: "Login required." }, 401);
    const data = await body(req);
    const title = String(data.title ?? "").trim();
    const text = String(data.text ?? "").trim();
    const category = String(data.category ?? "General").trim();
    if (!title || !text) return json({ error: "Title and poetry text are required." }, 400);
    const submission: Submission = { id: crypto.randomUUID(), userId: user.id, title, text, category, status: "pending", createdAt: new Date().toISOString() };
    await kv.set(["submission", submission.id], submission);
    await kv.set(["submissionByUser", user.id, submission.createdAt, submission.id], submission.id);
    return json({ submission }, 201);
  }

  if (req.method === "GET" && path === "/submissions/mine") {
    const user = await currentUser(req);
    if (!user) return json({ error: "Login required." }, 401);
    const items: Submission[] = [];
    for await (const entry of kv.list<string>({ prefix: ["submissionByUser", user.id] })) {
      const id = entry.value;
      const item = await kv.get<Submission>(["submission", id]);
      if (item.value) items.push(item.value);
    }
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ submissions: items });
  }

  if (req.method === "GET" && path === "/admin/submissions") {
    const user = await currentUser(req);
    if (!user || user.role !== "super_admin") return json({ error: "Super Admin access required." }, 403);
    const items: Submission[] = [];
    for await (const entry of kv.list<Submission>({ prefix: ["submission"] })) {
      if (entry.value?.id) items.push(entry.value);
    }
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ submissions: items });
  }

  if (req.method === "PATCH" && path.startsWith("/admin/submissions/")) {
    const user = await currentUser(req);
    if (!user || user.role !== "super_admin") return json({ error: "Super Admin access required." }, 403);
    const id = path.split("/").pop()!;
    const item = await kv.get<Submission>(["submission", id]);
    if (!item.value) return json({ error: "Submission not found." }, 404);
    const data = await body(req);
    const status = String(data.status ?? "");
    if (!(["approved", "rejected"] as string[]).includes(status)) return json({ error: "Status must be approved or rejected." }, 400);
    const updated = { ...item.value, status: status as Submission["status"], reviewedAt: new Date().toISOString(), reviewerId: user.id };
    await kv.set(["submission", id], updated);
    await kv.set(["submissionByUser", updated.userId, updated.createdAt, updated.id], updated.id);
    return json({ submission: updated });
  }

  if (req.method === "GET" && path === "/poems") {
    const category = url.searchParams.get("category");
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const poems: Submission[] = [];
    for await (const entry of kv.list<Submission>({ prefix: ["submission"] })) {
      const p = entry.value;
      if (!p || p.status !== "approved") continue;
      if (category && p.category.toLowerCase() !== category.toLowerCase()) continue;
      if (q && !`${p.title} ${p.text} ${p.category}`.toLowerCase().includes(q)) continue;
      poems.push(p);
    }
    poems.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ poems });
  }

  if (req.method === "POST" && path === "/setup/admin") {
    if (!SETUP_KEY || req.headers.get("x-setup-key") !== SETUP_KEY) return json({ error: "Invalid setup key." }, 403);
    const data = await body(req);
    const email = String(data.email ?? ADMIN_EMAIL).trim().toLowerCase();
    if (!email) return json({ error: "Admin email is required." }, 400);
    const found = await kv.get<User>(["userByEmail", email]);
    if (!found.value) return json({ error: "Create the user account first." }, 404);
    const user = { ...found.value, role: "super_admin" as const };
    await kv.set(["user", user.id], user);
    await kv.set(["userByEmail", email], user);
    return json({ user });
  }

  return json({ error: "Route not found." }, 404);
}

Deno.serve({ port: PORT }, async req => {
  try { return await route(req); }
  catch (error) { console.error(error); return json({ error: "Internal server error." }, 500); }
});
