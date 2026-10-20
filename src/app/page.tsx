import type { Metadata } from "next";
import Link from "next/link";
import { Basketball, Bell, Calendar, Chart, LinkIcon, News, Phone, Shield, Swap, Versus } from "@/components/icons";
import { IconTile } from "@/components/list";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: { absolute: "Hoops Hub: all your fantasy basketball leagues in one place" },
  description:
    "See every ESPN and Sleeper fantasy basketball team you manage on one screen. Fix lineups, answer trades, find waiver pickups across leagues, and get alerts before tip-off.",
};

const FEATURES = [
  {
    icon: <Basketball />,
    color: "var(--ball)",
    title: "Every league, one screen",
    body: "All your teams side by side: rosters with full stats, standings and this week's score, no matter which app the league is on.",
  },
  {
    icon: <Shield />,
    color: "var(--success)",
    title: "Lineup Check",
    body: "Flags injured starters, empty slots and starters with no game while a bench player plays. One tap swaps them in.",
  },
  {
    icon: <Calendar />,
    color: "var(--accent)",
    title: "Tonight's slate",
    body: "Today's NBA games with every player you own in each one, across all your leagues, in tip-off order.",
  },
  {
    icon: <Versus />,
    color: "var(--espn)",
    title: "Matchups everywhere",
    body: "Every weekly matchup at a glance with games left for you and your opponent, plus any other game in your leagues.",
  },
  {
    icon: <Swap />,
    color: "#5856d6",
    title: "Make moves here",
    body: "Set lineups, add and drop, send trades and accept or decline offers, and it happens in your ESPN league for real.",
  },
  {
    icon: <Chart />,
    color: "var(--sleeper)",
    title: "Waiver Radar",
    body: "The best free agents in each league, ranked by fantasy value, with which ones are open in several of your leagues.",
  },
  {
    icon: <News />,
    color: "var(--warning)",
    title: "Injuries and news",
    body: "Injury updates and news for only the players you own, tagged with every league and lineup spot they affect.",
  },
  {
    icon: <Bell />,
    color: "var(--danger)",
    title: "Alerts",
    body: "A notification when someone sends you a trade, a claim goes through, or a starter is out before tip-off.",
  },
  {
    icon: <Phone />,
    color: "var(--gray)",
    title: "Works like an app",
    body: "Add it to your home screen for a full-screen app with its own icon. Built for phones, roomy on big screens.",
  },
];

const PLATFORMS = [
  {
    name: "ESPN",
    color: "var(--espn)",
    status: "Full support",
    detail: "Everything, including lineups, add/drop, trades and answering offers. Connect with two cookies from espn.com, or add any public league by its ID.",
  },
  {
    name: "Sleeper",
    color: "var(--sleeper)",
    status: "View only",
    detail: "Rosters, stats, matchups, standings, activity and the draft. Just your username. Sleeper doesn't let other apps make moves, so those stay in Sleeper.",
  },
  {
    name: "Yahoo",
    color: "var(--yahoo)",
    status: "Coming soon",
    detail: "Sign in with Yahoo is built. Yahoo now reviews every app before it can read fantasy data; leagues show up once Hoops Hub is approved.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b-[0.5px] border-separator bg-[var(--bar)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <Logo />
          <nav className="flex items-center gap-4">
            <Link href="/sign-in" className="text-[15px] text-accent">
              Sign In
            </Link>
            <Link href="/sign-up" className="rounded-full bg-accent px-4 py-1.5 text-[15px] font-semibold text-[var(--on-accent)]">
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex flex-col">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-[1200px] items-center gap-12 px-4 pt-12 pb-16 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:px-8 lg:pt-24 lg:pb-24">
          <div className="flex flex-col gap-5">
            <p className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <span key={p.name} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[13px] font-semibold">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                  {p.name}
                  {p.status !== "Full support" && <span className="font-normal text-muted">· {p.status.toLowerCase()}</span>}
                </span>
              ))}
            </p>
            <h1 className="text-[40px] leading-[1.08] font-bold tracking-tight text-balance sm:text-[56px]">Every fantasy basketball league you play, in one app.</h1>
            <p className="max-w-[560px] text-[19px] leading-relaxed text-muted text-pretty">
              Hoops Hub pulls your teams from ESPN and Sleeper into one place, then does what no single app can: check every lineup at once, show tonight&apos;s
              games across all your rosters, and find the pickups that are open in more than one league.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <Link href="/sign-up" className="btn btn-primary">
                Create a Free Account
              </Link>
              <Link href="/sign-in" className="btn btn-secondary">
                Sign In
              </Link>
            </div>
            <p className="text-[13px] text-muted">Free. No ads. Your league logins are encrypted and never shared.</p>
          </div>
          <HeroPreview />
        </section>

        {/* Features */}
        <section className="border-t-[0.5px] border-separator bg-surface/60 py-16 lg:py-24">
          <div className="mx-auto w-full max-w-[1200px] px-4 lg:px-8">
            <h2 className="text-[30px] font-bold tracking-tight text-balance sm:text-[36px]">Built for people in more than one league</h2>
            <p className="mt-3 max-w-[640px] text-[17px] text-muted text-pretty">
              Each fantasy app only knows about its own leagues. Hoops Hub sees all of them, so it can answer questions none of them can.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="list-group flex flex-col gap-3 p-5">
                  <IconTile color={f.color}>{f.icon}</IconTile>
                  <h3 className="text-[17px] font-semibold">{f.title}</h3>
                  <p className="text-[15px] leading-relaxed text-muted">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto w-full max-w-[1200px] px-4 lg:px-8">
            <h2 className="text-[30px] font-bold tracking-tight sm:text-[36px]">Set up in two minutes</h2>
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                ["Create an account", "An email and password. That's your Hoops Hub login, separate from your league accounts."],
                ["Connect your leagues", "ESPN: paste two cookies from espn.com once, and every league on your account appears. Sleeper: just your username."],
                ["Manage everything here", "Your dashboard, My Teams hub and alerts fill in on their own, and stay in sync with your leagues."],
              ].map(([title, body], i) => (
                <li key={title} className="list-group flex flex-col gap-2 p-5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[15px] font-bold text-[var(--on-accent)]">{i + 1}</span>
                  <h3 className="mt-1 text-[17px] font-semibold">{title}</h3>
                  <p className="text-[15px] leading-relaxed text-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Platforms */}
        <section className="border-t-[0.5px] border-separator bg-surface/60 py-16 lg:py-24">
          <div className="mx-auto w-full max-w-[1200px] px-4 lg:px-8">
            <h2 className="text-[30px] font-bold tracking-tight sm:text-[36px]">What works where</h2>
            <p className="mt-3 max-w-[640px] text-[17px] text-muted text-pretty">Straight answers about each platform, including what they don&apos;t allow.</p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {PLATFORMS.map((p) => (
                <div key={p.name} className="list-group flex flex-col gap-2 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[19px] font-bold">
                      <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                      {p.name}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                        p.status === "Full support" ? "bg-success/15 text-success" : p.status === "View only" ? "bg-accent-soft text-accent" : "bg-fill text-muted"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <p className="text-[15px] leading-relaxed text-muted">{p.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:px-8">
            <div>
              <IconTile color="var(--success)">
                <Shield />
              </IconTile>
              <h2 className="mt-4 text-[30px] font-bold tracking-tight sm:text-[36px]">Your logins stay yours</h2>
            </div>
            <ul className="flex flex-col gap-4 text-[17px] leading-relaxed">
              {[
                ["Encrypted at rest.", "League cookies and tokens are encrypted with AES-256 before they're stored, and never sent back to your browser."],
                ["Only what's needed.", "ESPN cookies only reach ESPN's fantasy service. Sleeper needs nothing but a public username."],
                ["Nothing changes without you.", "Lineup moves, pickups and trades only happen when you tap the button and confirm."],
                ["Remove anytime.", "Disconnect a league on the Connections page and its saved login is deleted."],
              ].map(([bold, rest]) => (
                <li key={bold} className="flex gap-3">
                  <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-success" />
                  <span>
                    <span className="font-semibold">{bold}</span> <span className="text-muted">{rest}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Final call to action */}
        <section className="border-t-[0.5px] border-separator py-16 text-center lg:py-20">
          <div className="mx-auto flex max-w-[640px] flex-col items-center gap-5 px-4">
            <IconTile color="var(--ball)">
              <Basketball />
            </IconTile>
            <h2 className="text-[30px] font-bold tracking-tight text-balance sm:text-[36px]">All your teams. One place.</h2>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/sign-up" className="btn btn-primary">
                Create a Free Account
              </Link>
              <Link href="/sign-in" className="btn btn-secondary">
                Sign In
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t-[0.5px] border-separator">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-2 px-4 py-6 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <span className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4" /> Hoops Hub
          </span>
          <span className="text-pretty">
            Not affiliated with or endorsed by ESPN, Sleeper or Yahoo. League data comes from your own accounts on those services.
          </span>
        </div>
      </footer>
    </div>
  );
}

/** An illustrated, static peek at the app (not real data). */
function HeroPreview() {
  const leagues = [
    { name: "Work League", platform: "var(--espn)", me: 412.5, them: 389.0, left: "18 vs 15" },
    { name: "College Buddies", platform: "var(--sleeper)", me: 301.2, them: 322.8, left: "21 vs 19" },
  ];
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[520px]">
      <div className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-br from-[var(--ball)]/25 via-transparent to-[var(--accent)]/20 blur-2xl" />
      <div className="flex flex-col gap-3 rounded-[28px] border-[0.5px] border-separator bg-bg p-4 shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
        <div className="flex items-center justify-between px-1">
          <span className="text-[22px] font-bold">My Teams</span>
          <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-[12px] font-semibold text-success">2 leagues live</span>
        </div>

        <div className="rounded-[14px] bg-warning/10 px-3 py-2.5 text-[14px]">
          <span className="font-semibold">Lineup Check:</span> Tyrese Maxey is on your bench with a game tonight.{" "}
          <span className="font-semibold text-accent">Swap ›</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {leagues.map((l) => (
            <div key={l.name} className="list-group flex flex-col gap-1.5 p-3">
              <span className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l.platform }} />
                {l.name}
              </span>
              <span className="flex items-baseline justify-between text-[20px] font-semibold tabular-nums">
                {l.me.toFixed(1)}
                <span className="text-[15px] font-normal text-muted">{l.them.toFixed(1)}</span>
              </span>
              <span className="text-[12px] text-muted">Games left {l.left}</span>
            </div>
          ))}
        </div>

        <div className="list-group">
          <div className="flex items-baseline justify-between border-b-[0.5px] border-separator px-3 py-2">
            <span className="text-[13px] font-semibold uppercase text-muted">Tonight · BOS @ NY</span>
            <span className="text-[12px] text-muted">7:30 PM</span>
          </div>
          {[
            ["Jalen Brunson", "Work League · PG", "38.4"],
            ["Jayson Tatum", "College Buddies · SF", "45.1"],
            ["Derrick White", "Work League · BN", "27.9"],
          ].map(([name, where, avg], i) => (
            <div key={name} className={`flex items-center gap-2.5 px-3 py-2 ${i === 2 ? "opacity-50" : ""}`}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-fill text-[10px] font-semibold text-muted">
                {name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{name}</span>
                <span className="block truncate text-[11px] text-muted">{where}</span>
              </span>
              <span className="text-[14px] font-semibold tabular-nums">{avg}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-[14px] bg-surface px-3 py-2.5 text-[13px]">
          <IconTile color="#5856d6">
            <Swap />
          </IconTile>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Trade offer</span>
            <span className="block truncate text-muted">Team Rocket sent you an offer in Work League</span>
          </span>
        </div>
      </div>
    </div>
  );
}
