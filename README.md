This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, install dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Cross-Platform Compatibility

This project is configured to work on **Windows**, **macOS**, and **Linux**. 

### macOS Setup

If you're setting up on macOS after developing on Windows, see [SETUP_MACOS.md](./SETUP_MACOS.md) for detailed instructions.

**Quick macOS fix:**
```bash
npm run clean:all
npm install
npm run dev
```

### Common Issues

- **Build cache issues**: Run `npm run clean` to clear the `.next` folder
- **Import errors**: Check file paths are case-correct (macOS is case-sensitive)
- **Line endings**: The project uses LF line endings (handled by `.gitattributes`)

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

This project is configured for Vercel deployment. The easiest way to deploy is:

1. Push your code to GitHub/GitLab/Bitbucket
2. Import your repository in [Vercel](https://vercel.com/new)
3. Vercel will automatically detect Next.js and configure the build

### Vercel Configuration

- Build Command: `npm run build` (uses standard Next.js build, not Turbopack for production)
- Output Directory: `.next` (auto-detected)
- Install Command: `npm install`

### Environment Variables

`.env.example` documents every variable the app reads, what happens when one is
missing, and which are optional. It is kept in step with the code — nothing the
codebase reads is absent from it.

```bash
cp .env.example .env
```

The same variables must be set in the Vercel dashboard for deployed
environments. Four are worth calling out:

| Variable | If unset |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | The app cannot start. Server-only — never expose it to the browser. |
| `AUTH_SESSION_SECRET` | Falls back to the service-role key, so rotating that key signs every user out. |
| `CRON_SECRET` | The three scheduled job endpoints refuse to run (503). Deliberate: they are reachable without a session. |
| `RECAPTCHA_SECRET_KEY` | Skipped in development; in production signup fails closed. |

Note that Next.js reads `.env.local` at higher precedence than `.env`, so an
empty value in `.env.local` will shadow a real one in `.env`.

### Build Optimization

The project uses:
- **Development**: Turbopack for faster local development
- **Production**: Standard Next.js build for Vercel deployment (more stable)

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
