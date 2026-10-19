import Link from "next/link";
import { Basketball, LinkIcon, Trophy, Versus } from "@/components/icons";
import { Group, IconTile, Row } from "@/components/list";
import { Logo } from "@/components/logo";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-5 py-4">
        <Logo />
        <Link href="/sign-in" className="text-[17px] text-accent">
          Sign In
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-8 pb-16 sm:pt-16">
        <h1 className="large-title px-1 text-balance">All your leagues. One place.</h1>
        <p className="mt-3 px-1 text-[17px] text-muted text-pretty">
          See every fantasy basketball team you manage, side by side. ESPN today, with Yahoo and Sleeper on the way.
        </p>

        <Group className="mt-8">
          <Row
            icon={
              <IconTile color="var(--ball)">
                <Basketball />
              </IconTile>
            }
            title="Every league, one screen"
            subtitle="All your teams at a glance"
          />
          <Row
            icon={
              <IconTile color="var(--accent)">
                <Versus />
              </IconTile>
            }
            title="Live matchups"
            subtitle="Your score vs. this week's opponent"
          />
          <Row
            icon={
              <IconTile color="var(--warning)">
                <Trophy />
              </IconTile>
            }
            title="Standings"
            subtitle="Where you rank in every league"
          />
          <Row
            icon={
              <IconTile color="var(--success)">
                <LinkIcon />
              </IconTile>
            }
            title="ESPN, Yahoo, Sleeper"
            subtitle="Connect once, stay in sync"
          />
        </Group>

        <div className="mt-8 flex flex-col gap-3">
          <Link href="/sign-up" className="btn btn-primary">
            Get Started
          </Link>
          <Link href="/sign-in" className="btn btn-secondary">
            I Have an Account
          </Link>
        </div>
      </main>
    </div>
  );
}
