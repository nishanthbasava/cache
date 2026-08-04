import Link from "next/link";

export default function BottomNav() {
  return (
    <nav className="flex justify-around border-t p-3">
      <Link className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted" href="/organize">
        Organize
      </Link>
      <Link className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted" href="/capture">
        Capture
      </Link>
      <Link className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted" href="/study">
        Study
      </Link>
    </nav>
  );
}
