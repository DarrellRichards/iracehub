## iRaceHub

iRaceHub is a production-ready league management platform for iRacing communities.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Open Source](https://img.shields.io/badge/Open%20Source-Yes-red.svg)](https://github.com/DarrellRichards/iracehub)

It includes:

- league, series, and season management
- schedule and race session syncing from iRacing
- results import and editing
- standings and widgets for external sites
- virtual money, team bank, and registration fee support
- self-hosted deployment with Docker, Nginx, or Caddy

## Open Source Project

iRaceHub is open source and intended to be self-hostable by the iRacing community.

- Repository: https://github.com/DarrellRichards/iracehub
- License: [MIT](LICENSE)
- Contributions: see [CONTRIBUTING.md](CONTRIBUTING.md)
- Security reporting: see [SECURITY.md](SECURITY.md)

## Getting Started

### Requirements

- Node.js 20+
- PostgreSQL
- iRacing API credentials

### Environment setup

Copy the development template and update the values:

```bash
cp .env.example .env.local
```

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:2300](http://localhost:2300) with your browser to see the result.

In a separate shell, generate Prisma artifacts and run migrations as needed:

```bash
npx prisma generate
npx prisma migrate dev
```

### Quality checks

Run the project checks locally before opening a pull request:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Production Application Overview

The production app is designed for league owners who want to run iRaceHub on their own infrastructure.

Typical production flow:

1. Host PostgreSQL locally or from a managed provider.
2. Set production environment variables in `.env.production`.
3. Build and run the app with Docker.
4. Put Nginx or Caddy in front of the app.
5. Point your domain to the server and run Prisma migrations.

Once deployed, users access:

- the main marketing site
- driver dashboard
- league landing pages
- admin tools
- widgets via public API routes

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Contributing

Issues and pull requests are welcome.

- Start with [CONTRIBUTING.md](CONTRIBUTING.md)
- Be sure not to commit secrets from `.env.local` or `.env.production`
- Include schema migrations with Prisma model changes
- GitHub issue and pull request templates are included for contributors

## Widget / External App Feed

You can consume league data for external widgets/apps via:

- `GET /api/widgets/leagues/:leagueId`

Where `:leagueId` can be either the app league id or numeric iRacing league id.

This endpoint is public and includes CORS headers for browser-based integrations.

### Included data

- `upcomingEvent`
- `latestRaceResults`
- `standingsUpdate`
- `schedule`

### Optional query params

- `standingsLimit` (default `10`, max `50`)
- `scheduleLimit` (default `12`, max `50`)
- `resultsLimit` (default `20`, max `100`)
- `view` (`all`, `upcoming`, `results`, `standings`, `schedule`)
- `theme` (`light`, `dark`)
- `accent` (hex color, e.g. `#ef4444`)
- `bg` (hex color or `transparent`)
- `text` (hex color)
- `border` (hex color)
- `compact` (`true` or `false`) for compact standings/results tables

### Example

```bash
curl "http://localhost:2300/api/widgets/leagues/12345?standingsLimit=10&scheduleLimit=8&resultsLimit=15"
```

### Embeddable script widget

Drop this on any site/app page:

```html
<div id="irh-widget"></div>
<script
  src="http://localhost:2300/api/widgets/leagues/12345/embed?standingsLimit=10&scheduleLimit=8&resultsLimit=10&view=all&theme=dark&accent=%23ef4444&bg=%230f172a&text=%23e5e7eb&border=%23334155"
  data-target="#irh-widget"
></script>
```

If `data-target` is omitted, the widget renders directly below the script tag.

You can also render one standalone widget section by changing `view` to `upcoming`, `results`, `standings`, or `schedule`.

### Privacy behavior

- If a league has private schedule enabled, `upcomingEvent` and `schedule` are hidden.
- If a league has private results enabled, `latestRaceResults` and `standingsUpdate` are hidden.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Self-Hosting in Production with Docker

You can run iRaceHub on your own VPS, bare-metal server, or cloud VM with Docker.

### What gets deployed

- `app`: the Next.js production container
- `nginx` or `caddy`: reverse proxy in front of the app

The app listens internally on port `2300`.

## Deploy to VPS with Docker + Reverse Proxy

This repo supports production deployment via Docker with either Nginx or Caddy as a reverse proxy.

### Server requirements

- Linux server or VPS
- Docker and Docker Compose
- reachable public DNS if using HTTPS with Caddy
- PostgreSQL database (compose-managed by default in this repo)

Recommended minimum:

- 2 CPU
- 2 GB RAM
- 20 GB disk

### 1) Prepare environment

Copy the template and set real values:

```bash
cp .env.production.example .env.production
```

Required variables:

- `DATABASE_URL`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `IRACING_CLIENT_SECRET`
- `NEXT_PUBLIC_APP_URL` (must match your public HTTPS URL)

Optional:

- `IRACING_CLIENT_ID`

Example:

```env
DATABASE_URL=postgresql://iracehub:replace_me@postgres:5432/iracehub
POSTGRES_DB=iracehub
POSTGRES_USER=iracehub
POSTGRES_PASSWORD=replace_me
IRACING_CLIENT_ID=your-client-id
IRACING_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_APP_URL=https://iracehub.yourdomain.com
```

`DATABASE_URL` host must be reachable from inside the `app` container. For the compose-managed DB, use `postgres` as the host.
If using external Postgres, replace `DATABASE_URL` with your external host details.

### 2) Build and run locally with Docker only

If you just want to confirm the production container works before adding a proxy:

```bash
docker build -t iracehub .
docker run --rm -p 2300:2300 --env-file .env.production iracehub
```

Then open `http://your-server-ip:2300`.

### 3) Choose a reverse proxy

### Option A: Nginx

Starts app + Nginx on port 80:

```bash
docker compose -f docker-compose.nginx.yml up -d --build
```

Nginx config lives at `deploy/nginx/default.conf`.

Use Nginx when:

- you already terminate TLS elsewhere
- you want a simple HTTP reverse proxy in front of Docker

### Option B: Caddy (automatic HTTPS)

Set your domain and start app + Caddy:

```bash
DOMAIN=your-domain.com docker compose -f docker-compose.caddy.yml up -d --build
```

Caddy config lives at `deploy/caddy/Caddyfile` and will automatically manage TLS certificates.

Use Caddy when:

- you want automatic HTTPS
- you want the simplest self-managed public deployment

### 4) Prisma migrations in production

Run migrations against your production DB after deployment:

```bash
docker compose -f docker-compose.nginx.yml exec app prisma migrate deploy --schema prisma/schema.prisma
```

If using Caddy stack, run:

```bash
docker compose -f docker-compose.caddy.yml exec app prisma migrate deploy --schema prisma/schema.prisma
```

### 5) Useful operations

View logs:

```bash
docker compose -f docker-compose.nginx.yml logs -f
```

Rebuild/restart:

```bash
docker compose -f docker-compose.nginx.yml up -d --build
```

Stop stack:

```bash
docker compose -f docker-compose.nginx.yml down
```

### 6) Updating the app on your server

Pull the latest code and rebuild:

```bash
git pull
docker compose -f docker-compose.nginx.yml up -d --build
docker compose -f docker-compose.nginx.yml exec app prisma migrate deploy --schema prisma/schema.prisma
```

### 7) Suggested production checklist

- set a real `NEXT_PUBLIC_APP_URL`
- run behind HTTPS
- use a managed PostgreSQL backup strategy
- keep `.env.production` out of version control
- run `prisma migrate deploy` after each schema change
- monitor Docker logs after deploys

## Security

If you discover a vulnerability, please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

Released under the [MIT License](LICENSE).
