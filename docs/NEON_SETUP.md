# Neon setup

FarmSave uses Neon PostgreSQL directly through Prisma. Auth.js credentials and sessions are stored and validated against this database.

## 1. Configure the environment

Create a Neon project and copy its pooled connection string to `DATABASE_URL`. Copy a direct (non-pooled) connection string to `DIRECT_URL` for Prisma migrations. Keep both URLs private.

Set these server-side values in `.env.local`:

```dotenv
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require
DIRECT_URL=postgresql://.../neondb?sslmode=require
AUTH_SECRET=replace-with-a-random-secret-of-at-least-32-characters
AUTH_URL=http://localhost:3107
NEXTAUTH_URL=http://localhost:3107
NEXT_PUBLIC_SITE_URL=http://localhost:3107
```

Generate a secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Do not commit `.env.local` or expose secrets with a `NEXT_PUBLIC_` prefix.

## 2. Apply schema and reference data

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run setup:check
```

`prisma/migrations/` contains the canonical versioned database schema, including RLS policies, restricted runtime roles, and transactional workflow functions. `prisma/seed.sql` adds only the Uganda/Kasese operating catalogue and crop reference values. It does not create accounts or sample harvests.

Apply migrations to a development database first. Use a separate Neon project/database for production, and use forward migrations for deployed schema changes.

## 3. Development accounts

To create local workflow accounts, set the following only in a dedicated development environment:

```dotenv
FARMSAVE_DEV_SEED=true
SEED_PASSWORD=your-private-password-of-at-least-12-characters
```

Then run `npm run seed:users`. It creates farmer, buyer, transporter, coordinator, agricultural-partner, and administrator accounts using `SEED_PASSWORD`. Do not enable this option in production.

## 4. Optional service configuration

- **Email:** `AUTH_REQUIRE_EMAIL_VERIFICATION` defaults to `true`, so configure `RESEND_API_KEY` and `EMAIL_FROM` before opening production registration. Email verification and password recovery use this provider.
- **Private files:** configure `S3_ENDPOINT` (if using a non-AWS provider), `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_FORCE_PATH_STYLE` as needed.
- **Live browser workflow:** seed a dedicated development database, set `E2E_LIVE=true`, build the app, then run `npm run test:e2e:live`.

The application remains usable for public pages without these optional services. Email delivery, file transfer, hosted concurrency, and deployment behavior should be verified against the actual configured providers before a pilot.

## Vercel environment variables

In **Vercel → Project → Settings → Environment Variables**, set these for each environment where the app will run:

- `DATABASE_URL`: Neon pooled PostgreSQL connection string for the application.
- `DIRECT_URL`: Neon direct PostgreSQL connection string used by Prisma migrations.
- `AUTH_SECRET`: a random secret of at least 32 characters.
- `AUTH_URL` and `NEXTAUTH_URL`: the canonical deployed origin, for example `https://your-domain.example`.
- `NEXT_PUBLIC_SITE_URL`: the canonical public site origin.

Add `RESEND_API_KEY` and `EMAIL_FROM` for mail delivery, and the `S3_*` variables for private uploads if those services are enabled. Use Vercel's Production, Preview, and Development scopes deliberately; do not put real values in `.env.example` or source control. Apply reviewed database migrations separately before directing real users to the deployment.
