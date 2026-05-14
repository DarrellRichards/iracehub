# iracehub

## Project Overview

Next.js 15 application with GraphQL (Apollo Server 4) support, running on port 2300.

## Tech Stack

- **Framework**: Next.js 15 (App Router, TypeScript, Tailwind CSS)
- **GraphQL Server**: Apollo Server 4 via `@as-integrations/next`
- **GraphQL Client**: Apollo Client 4
- **Port**: 2300

## Project Structure

- `src/app/` - Next.js App Router pages and layouts
- `src/app/api/graphql/route.ts` - GraphQL API endpoint (`/api/graphql`)
- `src/lib/graphql/schema.ts` - GraphQL type definitions and resolvers

## Development Guidelines

- Use TypeScript for all files
- Use Tailwind CSS for styling
- Add new GraphQL types/resolvers in `src/lib/graphql/schema.ts`
- The GraphQL endpoint is available at `http://localhost:2300/api/graphql`
