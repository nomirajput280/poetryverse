# PoetryVerse — The World of Poetry

Next.js frontend connected to the live PoetryVerse Deno API.

## Backend
Live API: https://poetryverse.786.deno.net

Set `NEXT_PUBLIC_API_URL` to the API base URL when deploying. The frontend also defaults to the live API above if the variable is not set.

## Connected MVP features
- Account signup/login/logout
- Persistent bearer-token session in the browser
- 300 monthly starter credits shown on the account
- Search approved poetry through the Deno API
- Category-based poetry discovery
- Submit original poetry
- Submission status: pending/approved/rejected
- View own submissions
- Super Admin approval remains enforced by the Deno backend

## Backend architecture
Deno Deploy + Deno KV. Supabase is not required.
