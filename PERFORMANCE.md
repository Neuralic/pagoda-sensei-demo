# Performance & Vercel Loading Speed

## Changes already applied

1. **Image optimization enabled** (`next.config.ts`)  
   - `unoptimized` was set to `true`, so Next.js was not optimizing images. It is now `false`.  
   - Remote Supabase URLs are already in `remotePatterns`, so images are optimized and served in modern formats (e.g. WebP), which reduces payload and improves LCP.

2. **Font display** (`app/layout.tsx`)  
   - `display: "swap"` was added to Geist fonts so text shows immediately with a fallback font while the custom font loads, reducing perceived blocking.

---

## Likely causes of slow loading on Vercel

### 1. Serverless cold starts
- First request to an API route or server component after deploy (or after idle) can be slow while the function starts.
- **Mitigation:** Use Vercel’s [Edge Runtime](https://vercel.com/docs/functions/edge-functions) for suitable routes, or keep functions warm (e.g. cron or external pings). Prefer Edge only where you don’t need Node-only APIs (e.g. some Google APIs).

### 2. Client-side data waterfalls
- Many pages load in sequence: first `/api/auth/me`, then other APIs (itineraries, jobs, etc.). That serializes network and delays rendering.
- **Mitigation:**  
  - Fetch in parallel where possible (e.g. `Promise.all([fetch('/api/auth/me'), fetch('/api/itineraries?...')])`).  
  - Move data fetching to Server Components and pass data as props so the server does one or a few parallel requests before sending HTML.

### 3. No caching on API routes
- Most fetches use `cache: "no-store"`, so the browser and Next.js do not cache responses.
- **Mitigation:** For data that can be stale for a short time, use `next: { revalidate: 60 }` or similar in `fetch`, or add `Cache-Control` headers on API routes (e.g. short `max-age` or `s-maxage` for public/list data).

### 4. Heavy dependencies in the bundle
- **`googleapis`** – Used in auth and meeting API routes; large dependency and can slow serverless cold starts.  
- **`puppeteer`** – Not used in app code; if it’s only for scripts or one-off jobs, remove it from `dependencies` (or move to a separate worker/repo) to reduce deploy size and install time.
- **`jspdf` / `html2canvas`** – Used for PDF/print. Consider loading them only when the user opens the PDF/print flow (dynamic `import()` inside that flow) so they’re not in the initial JS bundle.

### 5. Supabase region vs Vercel region
- If Supabase and Vercel are in different regions, every API request pays extra latency.
- **Mitigation:** Run the Vercel app in the same region as your Supabase project (e.g. in Vercel project settings), and use a Supabase region close to your users.

### 6. Large pages and components
- Edit-itinerary and similar pages pull in many components (e.g. PDF, modals, DnD). That increases first-load JS.
- **Mitigation:** Use `next/dynamic` with `ssr: false` or `loading` for modals and PDF-related UI so they load only when needed.

---

## Quick wins you can do next

- **Remove unused `puppeteer`** (if not used):  
  `npm uninstall puppeteer`  
  Then redeploy to reduce install size and time.

- **Parallelize fetches on key pages**  
  e.g. Agent/Guide landing or itineraries: fetch `/api/auth/me` and the main data in one `Promise.all` instead of one after the other.

- **Add short revalidation for list/read APIs**  
  e.g. itineraries list, jobs list: in the route handler set  
  `NextResponse.json(data, { headers: { 'Cache-Control': 'private, s-maxage=10, stale-while-revalidate=60' } })`  
  so repeat visits and shared caches can reuse responses when appropriate.

- **Dynamic import for PDF/print**  
  Where you use `react-to-print` and the PDF content component, load them with `next/dynamic` so they’re not in the initial bundle.

---

## How to measure

- **Vercel:** Use the Speed Insights and Real Experience (e.g. Web Vitals) in the dashboard.
- **Chrome DevTools:** Network tab (waterfalls, payload sizes), Performance tab (LCP, TBT).
- **Lighthouse:** Run on a deployed URL for both mobile and desktop to see LCP, TTI, and bundle impact.
