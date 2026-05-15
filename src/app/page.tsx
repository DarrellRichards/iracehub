import Link from "next/link";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state:
    "Login failed due to a session mismatch. This can happen if you started multiple logins at once or your browser cleared cookies. Please try again.",
  unauthenticated: "You must be signed in to access that page.",
  missing_params:
    "OAuth callback was missing required parameters. Please try again.",
  token_exchange_failed:
    "Failed to exchange the authorization code. Please try again.",
};

const primaryFeatures = [
  {
    icon: "🏁",
    title: "League & Season Management",
    description:
      "Create leagues, organize multiple series, and manage full seasons with custom race calendars.",
  },
  {
    icon: "📈",
    title: "Live Standings & Points",
    description:
      "Automatically update championship standings after every race with support for adjustments.",
  },
  {
    icon: "👥",
    title: "Virtual Money & Earnings",
    description:
      "Enable or disable virtual money per league, then track team banks, driver payouts, and race-based earnings.",
  },
  {
    icon: "🔗",
    title: "iRacing Connected",
    description:
      "Sign in with iRacing and sync seasons, sessions, and race results directly into your league.",
  },
];

const virtualMoneyFeatureTitle = "Virtual Money & Earnings";

const featureDetails = [
  {
    title: "Admin Controls",
    points: [
      "Sync seasons and sessions from iRacing",
      "Import, edit, and recalculate race results",
      "Assign bonus points, penalties, and provisionals",
      "Turn virtual money mode on or off anytime",
    ],
  },
  {
    title: "Driver Experience",
    points: [
      "Driver profiles with league-specific context",
      "Quick access to standings and race history",
      "Earnings visibility by league and season",
    ],
  },
  {
    title: "Widgets & Sharing",
    points: [
      "Embeddable standings and schedule widgets",
      "Theme controls for light and dark displays",
      "Easy links for league pages and dashboards",
    ],
  },
];

const quickStats = [
  { label: "League Ops", value: "One place" },
  { label: "Data Source", value: "iRacing" },
  { label: "Auth", value: "Secure OAuth" },
  { label: "Virtual Economy", value: "Optional" },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? `An unexpected error occurred (${error}).`)
    : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="sticky top-0 z-10 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black tracking-tight text-white">
              i<span className="text-red-500">Race</span>Hub
            </span>
          </div>
          <nav className="hidden items-center gap-6 sm:flex">
            <Link
              href="/leagues"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Leagues
            </Link>
            <a
              href="#features"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              How It Works
            </a>
            <Link
              href="/api/auth/login"
              className="rounded-lg bg-red-600 hover:bg-red-500 transition-colors px-4 py-2 text-sm font-semibold text-white"
            >
              Sign in with iRacing
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-20 sm:pt-24">
          <div className="text-center">
            <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              Marketing Preview
            </span>

            <h1 className="mb-6 text-5xl font-black leading-none tracking-tight sm:text-7xl">
              Run Your League.
              <br />
              <span className="text-red-500">Own Every Point.</span>
            </h1>

            <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-zinc-400">
              iRaceHub gives race admins and drivers a complete platform for
              standings, schedules, teams, and results—fully connected to
              iRacing and built for serious championship management.
            </p>

            {errorMessage && (
              <div className="mx-auto mb-8 max-w-xl rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-left text-sm text-red-300">
                <p className="mb-1 font-semibold">Login Error</p>
                <p>{errorMessage}</p>
              </div>
            )}

            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/api/auth/login"
                className="w-full rounded-xl bg-red-600 px-8 py-4 text-base font-bold text-white transition-all active:scale-95 hover:bg-red-500 sm:w-auto"
              >
                {errorMessage
                  ? "Try Again — Sign in with iRacing"
                  : "Start with iRacing Login"}
              </Link>
              <a
                href="#features"
                className="w-full rounded-xl border border-zinc-700 px-8 py-4 text-base font-semibold text-zinc-300 transition-colors hover:border-zinc-500 sm:w-auto"
              >
                Explore Features
              </a>
            </div>

            <div className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
              {quickStats.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-left"
                >
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    {item.label}
                  </p>
                  <p className="text-sm font-semibold text-zinc-200">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-red-600 to-transparent opacity-40" />

        <section id="features" className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="mb-4 text-center text-3xl font-black tracking-tight">
            Built for serious league operations
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-zinc-400">
            From first schedule setup to final championship payout, iRaceHub
            handles the workflows admins and drivers deal with every week.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {primaryFeatures.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border border-zinc-800 bg-zinc-900 p-6 hover:border-zinc-600 transition-colors"
              >
                <div className="text-3xl mb-4">{feature.icon}</div>
                <h3 className="font-bold text-lg mb-2 text-white">
                  {feature.title}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {feature.description}
                </p>
                {feature.title === virtualMoneyFeatureTitle && (
                  <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-2 transition-colors group-hover:border-zinc-600">
                    <p className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">
                      Virtual Money Mode
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 transition-all group-hover:bg-emerald-500/25 group-hover:border-emerald-400/40">
                        On
                      </span>
                      <span className="relative inline-flex h-5 w-10 items-center rounded-full bg-emerald-500/30 transition-all duration-300 group-hover:bg-emerald-500/45 group-hover:shadow-[0_0_0_1px_rgba(16,185,129,0.35)]">
                        <span className="absolute right-0.5 h-4 w-4 rounded-full bg-emerald-300 transition-all duration-300 group-hover:translate-x-[-1px] group-hover:shadow-[0_0_8px_rgba(110,231,183,0.65)]" />
                      </span>
                      <span className="rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-400 transition-colors group-hover:text-zinc-300">
                        Off
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section
          id="how-it-works"
          className="border-y border-zinc-800 bg-zinc-900/70"
        >
          <div className="mx-auto grid max-w-6xl gap-6 px-6 py-20 md:grid-cols-3">
            {featureDetails.map((section) => (
              <div
                key={section.title}
                className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
              >
                <h3 className="mb-4 text-lg font-bold text-white">
                  {section.title}
                </h3>
                <ul className="space-y-2 text-sm text-zinc-400">
                  {section.points.map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 px-6 py-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">
              Open Source
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
              Built in the open for the iRacing community
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
              iRaceHub is an open source project. If you want to review the
              code, contribute improvements, or run it yourself, visit the
              project repository.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="https://github.com/DarrellRichards/iracehub"
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-xl border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-100 transition-colors hover:border-red-500 hover:text-white"
              >
                View the GitHub Repository
              </a>
              <a
                href="https://discord.gg/GgWWRxTBK8"
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-xl border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-100 transition-colors hover:border-red-500 hover:text-white"
              >
                Join Discord
              </a>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="mb-4 text-4xl font-black tracking-tight">
            Ready to launch your next season?
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-zinc-400">
            Sign in with iRacing and bring your league data, standings, and
            results workflows together in one place, with virtual money mode
            available when your league needs it.
          </p>
          <Link
            href="/api/auth/login"
            className="inline-flex rounded-xl bg-red-600 px-10 py-4 text-base font-bold text-white transition-all active:scale-95 hover:bg-red-500"
          >
            Sign in with iRacing
          </Link>
        </section>
      </main>
    </div>
  );
}
