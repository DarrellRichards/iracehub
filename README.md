This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

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

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

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
