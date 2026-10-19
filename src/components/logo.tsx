import Link from "next/link";
import { Basketball } from "./icons";
import { IconTile } from "./list";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 text-[17px] font-semibold text-text">
      <IconTile color="var(--ball)">
        <Basketball />
      </IconTile>
      <span>Hoops Hub</span>
    </Link>
  );
}
