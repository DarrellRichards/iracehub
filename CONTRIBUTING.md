# Contributing to iRaceHub

Thanks for your interest in contributing.

## Before you start

- Read the project overview in [README.md](README.md).
- Open an issue or discussion for larger feature ideas before starting work.
- Keep pull requests focused and small when possible.

## Local setup

1. Fork and clone the repository.
2. Copy [.env.example](.env.example) to `.env.local` and fill in the required values.
3. Install dependencies with `npm install`.
4. Start the dev server with `npm run dev`.
5. Apply database changes with `npx prisma migrate dev` when needed.

## Development guidelines

- Use TypeScript.
- Preserve existing coding style and keep changes targeted.
- Update documentation when behavior, configuration, or deployment changes.
- For schema changes, include the Prisma migration.

## Pull request checklist

- [ ] Code builds or affected files lint cleanly
- [ ] Prisma schema and migrations are included together
- [ ] README or related docs were updated if needed
- [ ] No secrets or local environment values were committed

## Reporting security issues

Please do not open public issues for security vulnerabilities. Follow the process in [SECURITY.md](SECURITY.md).
