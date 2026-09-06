# PoetryVerse Deno Backend

Deno Deploy backend for PoetryVerse. It uses **Deno KV** for the first MVP so Supabase is not required.

## Local

```bash
deno task dev
```

API runs on `http://localhost:8000`.

## Environment

- `PORT=8000`
- `FRONTEND_ORIGIN=http://localhost:3000` (use the real PoetryVerse frontend origin in production)
- `ADMIN_EMAIL=your-admin-email@example.com` (new signup with this email becomes Super Admin)
- `SETUP_KEY=long-random-secret` (optional emergency role setup endpoint)

## Core endpoints

- `GET /health`
- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /submissions`
- `GET /submissions/mine`
- `GET /admin/submissions`
- `PATCH /admin/submissions/:id` with `{ "status": "approved" | "rejected" }`
- `GET /poems?q=&category=`
- `POST /setup/admin` with `x-setup-key`

## Deno Deploy

Create a Deno Deploy app and point it to `deno/src/main.ts`. Add the environment variables above. Do not put any secret setup key in the frontend.
