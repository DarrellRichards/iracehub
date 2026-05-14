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

const features = [
  {
    icon: "🏆",
    title: "Points Tracking",
    description:
      "Automatically calculate and track championship points across every series and season.",
  },
  {
    icon: "📊",
    title: "Live Standings",
    description:
      "Real-time leaderboards and standings updated after every race result.",
  },
  {
    icon: "🏁",
    title: "Race Management",
    description:
      "Organize leagues, seasons, and custom scoring systems built around your rules.",
  },
  {
    icon: "🔗",
    title: "iRacing Integration",
    description:
      "Sign in directly with your iRacing account — no separate password needed.",
  },
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
    <div className="flex flex-col min-h-screen bg-zinc-950 text-white">
      {/* Nav */}
      <header className="border-b border-zinc-800">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black tracking-tight text-white">
              i<span className="text-red-500">Race</span>Hub
            </span>
          </div>
          <nav className="flex items-center gap-6">
            <a
              href="#features"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Features
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

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 pt-24 pb-20 text-center">
          {/* Badge */}
          <span className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-red-400 mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            Race Points Manager
          </span>

          <h1 className="text-5xl sm:text-7xl font-black tracking-tight leading-none mb-6">
            Manage Your <span className="text-red-500">Race Points</span>
            <br />
            Like a Pro
          </h1>

          <p className="mx-auto max-w-2xl text-lg text-zinc-400 mb-10 leading-relaxed">
            iRaceHub connects directly to your iRacing account to give you
            real-time championship standings, custom scoring rules, and
            full-season analytics — all in one place.
          </p>

          {errorMessage && (
            <div className="mx-auto max-w-xl mb-8 rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-300 text-left">
              <p className="font-semibold mb-1">Login Error</p>
              <p>{errorMessage}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/api/auth/login"
              className="w-full sm:w-auto rounded-xl bg-red-600 hover:bg-red-500 transition-all active:scale-95 px-8 py-4 text-base font-bold text-white shadow-lg shadow-red-600/30"
            >
              {errorMessage
                ? "Try Again — Sign in with iRacing"
                : "Get Started — Sign in with iRacing"}
            </Link>
            <a
              href="#features"
              className="w-full sm:w-auto rounded-xl border border-zinc-700 hover:border-zinc-500 transition-colors px-8 py-4 text-base font-semibold text-zinc-300"
            >
              Learn More
            </a>
          </div>
        </section>

        {/* Divider stripe */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-red-600 to-transparent opacity-50" />

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="text-center text-3xl font-black mb-4 tracking-tight">
            Everything you need to run your league
          </h2>
          <p className="text-center text-zinc-400 mb-16 max-w-xl mx-auto">
            Built by sim-racers, for sim-racers. iRaceHub handles the numbers so
            you can focus on racing.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 hover:border-zinc-600 transition-colors"
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-bold text-lg mb-2 text-white">{f.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-zinc-800 bg-zinc-900">
          <div className="mx-auto max-w-6xl px-6 py-20 text-center">
            <h2 className="text-4xl font-black mb-4 tracking-tight">
              Ready to race smarter?
            </h2>
            <p className="text-zinc-400 mb-8 max-w-lg mx-auto">
              Sign in with your iRacing account and start managing your
              championship today.
            </p>
            <Link
              href="/api/auth/login"
              className="inline-flex rounded-xl bg-red-600 hover:bg-red-500 transition-all active:scale-95 px-10 py-4 text-base font-bold text-white shadow-lg shadow-red-600/30"
            >
              Sign in with iRacing
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8">
        <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
          <span>
            <span className="font-black text-white">
              i<span className="text-red-500">Race</span>Hub
            </span>{" "}
            &copy; {new Date().getFullYear()}
          </span>
          <span>
            Not affiliated with iRacing.com Motorsport Simulations, LLC.
          </span>
        </div>
      </footer>
    </div>
  );
}
