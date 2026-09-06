# PoetryVerse — The World of Poetry

Official Deno-first production MVP / release candidate for PoetryVerse.

## Architecture
- Deno Deploy runtime
- Deno KV (`Deno.openKv()`), attached to the PoetryVerse app
- Single `main.ts` serves the branded web app and JSON API
- No Supabase or Vercel dependency

## Included
- Premium PoetryVerse branding
- Urdu + English ready UI
- Powerful SEO metadata, Open Graph, Twitter metadata, JSON-LD
- `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`
- Curated seed poetry so the homepage is not empty on first deployment
- 14 poetry categories
- Search by title/text/category/author/language
- Featured/latest/popular sorting API
- Signup/login/logout with PBKDF2 password hashing
- Persistent bearer sessions in Deno KV
- User profiles
- Original poetry submission workflow
- Pending / approved / rejected moderation
- Super Admin setup and moderation endpoints
- Like / save / share
- Saved poetry library
- Comments API
- Poet discovery API
- Platform statistics API
- Local AI Poetry Studio demo flow

## Deployment
1. Keep the existing Deno Deploy `poetryverse` app.
2. Keep the existing attached KV database `poetryverse-kv`.
3. Replace the repository's `main.ts` with this release version.
4. Commit the change.
5. Let Deno Deploy build and deploy the new revision.

## Optional environment variables
- `ADMIN_EMAIL` — email intended for Super Admin setup
- `SETUP_KEY` — secret required by `/setup/admin`
- `FRONTEND_ORIGIN` — CORS origin when an external frontend is used

## Important
This release is designed to be deployable as a single Deno application. Before a public launch, perform end-to-end tests for account creation, login, submissions, moderation, likes, saves, comments and admin access on the live deployment.
