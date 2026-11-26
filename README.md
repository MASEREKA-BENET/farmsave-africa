# FarmSave Africa

**Smart Post-Harvest Management and Agricultural Market Linkage System**  
*From Harvest to Market — Less Waste, More Income.*

FarmSave Africa is a Next.js App Router application for farmer, buyer, transporter, field coordinator, and administrator workflows. Its backend is **Neon-hosted PostgreSQL with Prisma and Auth.js**. Private files use S3-compatible object storage. The initial operating catalogue is Kasese District, Uganda.

## Backend

This project uses Neon/PostgreSQL as its only database backend. See [Neon setup](docs/NEON_SETUP.md) for configuration.

## Run locally

Requirements: Node.js 22.18+ and npm.

```sh
npm ci
```

Copy `.env.example` to `.env.local` and set the Neon pooled connection URL, direct connection URL, and a random `AUTH_SECRET` of at least 32 characters. Set `AUTH_URL` and `NEXTAUTH_URL` to your local origin (default `http://localhost:3107`).

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev -- --port 3107
```

Open http://localhost:3107. For an unconfigured database, public pages remain available and account/workspace functionality routes to `/setup`. No invented records or demo-login fallback are shown.

For development accounts, set `FARMSAVE_DEV_SEED=true` and a private `SEED_PASSWORD` of at least 12 characters in `.env.local`, then run `npm run seed:users`. Never enable development seeding in production.

## Product workflows

- **Farmer:** farm and crop records, expected and actual harvests, inventory, losses, retention, expenses, listings, offers, and orders.
- **Buyer:** produce search, offers, purchase confirmation, and order milestones.
- **Transporter:** vehicle profile, service areas, quotes, and delivery milestones.
- **Field coordinator:** district-authorized assisted enrollment, surveys, training, harvest verification, and field reports.
- **Administrator:** role approvals, transporter verification, operating areas, crop catalogue, reviewed guidance, disputes, reporting, contact inbox, and audit history.

Inventory reservations, releases, losses, and sales are PostgreSQL transactions. The database enforces row-level security with restricted runtime roles and explicit actor context; sensitive mutations use allowlisted database functions. Quantities remain tied to their recorded units, financial values use UGX, and marketplace offers are not treated as completed revenue until fulfillment is confirmed.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit/integration tests run against PGlite's PostgreSQL engine and the versioned Neon schema. Public browser tests cover responsive layouts and unauthenticated behavior. `npm run test:e2e:live` exercises authenticated workflows against a dedicated configured Neon development database; it requires `E2E_LIVE=true` and development accounts.

Hosted email delivery, hosted concurrent connections, S3 transfers, and production deployment require separate verification in the chosen services. The local test suite does not claim those external checks have been completed.

## Deployment

Deploy the Next.js application on a Node.js 22-compatible host. Set `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL`, and `NEXTAUTH_URL` in the deployment environment. Run `npm run db:migrate` against the intended database before opening registration. Configure Resend (`RESEND_API_KEY`, `EMAIL_FROM`) for verification/recovery emails and the S3-compatible storage values for private file uploads. Keep all credentials server-side.

Do not use real participant data until the operator has finalized legal/contact details, hosting regions, consent, retention, qualified guidance review, and backup/restore procedures.

## Project structure

```text
src/app/                     App Router pages, server actions, API handlers
src/components/              Public and workspace UI
src/lib/db/                  Prisma client, actor-scoped transactions, queries
src/lib/auth*                Auth.js session and account flows
prisma/schema.prisma         Prisma data model
prisma/migrations/           Versioned PostgreSQL schema and RLS
prisma/seed.sql               Reference catalogue only
scripts/                     Neon setup, development seed, and local test harness
tests/                       PostgreSQL, validation, and browser tests
```

Out-of-scope v1 features include payments/mobile money, GPS tracking, loans, insurance, livestock, IoT, native apps, and social networking.
