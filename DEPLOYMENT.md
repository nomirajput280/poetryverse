# PoetryVerse Final v4 — Deployment Checklist

## Deno Deploy
1. Keep the existing `poetryverse` app and `poetryverse-kv` database attached.
2. Replace the repository `main.ts` with this version.
3. Replace `deno.json`.
4. Commit and let Deno Deploy build.
5. Confirm `/health` returns status `ok`.

## Required Super Admin setup
Set these Deno Deploy environment variables before/after deployment:
- `ADMIN_EMAIL=admin@aimarkaz.xyz`
- `ADMIN_PASSWORD=<your private strong password>`
- `SETUP_KEY=<your private random key>`

When `ADMIN_PASSWORD` is present, the app creates/maintains `admin@aimarkaz.xyz` as Super Admin with unlimited AI credits.

## AI providers
Optional server-side variables:
- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `GEMINI_API_KEY`
- `XAI_API_KEY`

The AI Studio works without these using the local PoetryVerse fallback. When one or more keys are present, Auto routing uses a configured provider. Never put API keys in browser JavaScript.

## Paid subscriptions
Configure:
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_PRO1`
- `STRIPE_PRICE_PRO2`
- `STRIPE_PRICE_PRO3`
- `STRIPE_PRICE_PRO4`

Without Stripe credentials, Super Admin can still manually activate/manage plans and credits. This is intentional: payment credentials cannot be safely invented or bundled into source code.

## Android
Open the `android/` folder in Android Studio or AndroidIDE and build the APK. The wrapper loads the same live Deno website, so one backend powers both web and Android.
