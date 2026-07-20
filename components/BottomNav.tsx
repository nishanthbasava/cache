import { Button } from "@/components/ui/button";

export default function BottomNav() {
  return (
    <nav className="flex justify-around border-t p-3">
      <Button variant="ghost">Capture</Button>
      <Button variant="ghost">Organize</Button>
      <Button variant="ghost">Study</Button>
    </nav>
  );
}