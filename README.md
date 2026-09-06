# PoetryVerse® Official — Final Deno Edition 2.0

A single-app Deno Deploy + Deno KV poetry platform. No Supabase or Vercel required.

## Included
- Premium responsive branded website
- Urdu + English ready UI/content model
- Signup, login, logout, 30-day sessions
- PBKDF2 password hashing
- User profiles and 300 starter AI-credit field
- Poetry submission and moderation workflow
- Super Admin approval/rejection + featured-poem API
- Search and 14 categories
- Latest/popular/featured sorting API
- Likes, saved poems, comments
- User dashboard and submission status
- Platform statistics
- Deno KV persistence
- Health/API endpoints
- Same-origin website + API

## Deploy on Deno
- App directory: repository root
- Entrypoint: `main.ts`
- Attach KV database: `poetryverse-kv`
- `deno.json` is included

## Recommended environment variables
- `ADMIN_EMAIL` = your Super Admin email
- `SETUP_KEY` = a long random secret for emergency admin promotion
- `FRONTEND_ORIGIN` = your production domain, or leave unset for same-origin MVP

## Important
Do not expose `SETUP_KEY` in frontend code. Create your account using `ADMIN_EMAIL` to receive Super Admin role automatically.
