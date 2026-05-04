import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useMatch, useParams } from "react-router-dom";
import { useAppStore } from "@/store/appStore";
import { cn } from "@/lib/cn";
import HelpDialog from "@/components/HelpDialog";
import SuiteSettingsDialog from "@/components/SuiteSettingsDialog";
import ClassSwitcher from "@/components/ClassSwitcher";
import Icon from "@/components/Icon";

export default function AppShell() {
  const { id } = useParams();
  const isClassRoute = useMatch("/classes/:id/*");
  const isIndexRoute = useMatch({ path: "/", end: true });
  const klass = useAppStore((s) => (id ? s.classes.find((c) => c.id === id) : undefined));
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Global undo / redo (works on every screen).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        useAppStore.temporal.getState().undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        useAppStore.temporal.getState().redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // "?" opens help, "S" opens settings — both work anywhere except in inputs.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Single header. The .suite-topstrip class (defined in shared/desk.css) gives
          us the cream surface, ink border, and slab-serif font. The seating chart's
          own tool nav (class name, tabs, help, menu) lives inside the same strip. */}
      <header className="suite-topstrip">
        <div className="suite-topstrip-left">
          {/* Out-of-app link: leaves the React app, navigates to the suite root.
              The wordmark is its own affordance — no back-arrow needed. */}
          <a className="suite-wordmark" href="../" title="Back to The Teacher's Desk">
            The Teacher's Desk
          </a>
          {/* In-app link to the classes index. Hidden when we're already
              there — would just be a no-op link otherwise. */}
          {!isIndexRoute && (
            <Link
              to="/"
              className="suite-tool-name hover:text-accent-blue"
              title="Back to all classes"
            >
              All Classes
            </Link>
          )}
          {isClassRoute && klass && (
            <>
              <span className="h-5 w-px bg-ink/20" aria-hidden />
              <ClassSwitcher currentClassId={klass.id} currentClassName={klass.name} />
              <nav className="ml-2 flex items-center gap-0.5 rounded-md bg-ink/5 p-0.5">
                <TabLink to={`/classes/${klass.id}/roster`}>Roster</TabLink>
                <TabLink to={`/classes/${klass.id}/room`}>Room</TabLink>
                <TabLink to={`/classes/${klass.id}/history`}>History</TabLink>
              </nav>
            </>
          )}
        </div>
        <div className="suite-topstrip-right">
          {/* Order across every tool's topstrip is Help → Settings → Fullscreen
              (the seating chart has no fullscreen toggle so it stops at
              Settings). Both buttons use btn-secondary so heights match. */}
          <button
            className="btn-secondary"
            onClick={() => setHelpOpen(true)}
            title="Keyboard shortcuts (?)"
          >
            <Icon name="help-circle" size={14} />
            <span className="hidden md:inline">Help</span>
          </button>
          {/* Use the shared .settings-button class so the gear matches the
              36x36 paper-card square the bingo + picker tools render. The
              shell rule lives in shared/desk.css; the inner Icon sizes to
              18px to fill the same area as the .settings-button-icon SVG
              the vanilla tools inject. */}
          <button
            type="button"
            className="settings-button"
            onClick={() => setSettingsOpen(true)}
            title="Settings (S)"
            aria-label="Settings"
          >
            <Icon name="settings" size={18} />
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <Outlet />
      </main>
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <SuiteSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function TabLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "rounded px-2.5 py-1 text-xs font-medium transition",
          // Active tab pops up out of the bg-ink/5 nav onto the topstrip's cream surface.
          isActive ? "bg-paper text-ink shadow-sm" : "text-ink-muted hover:text-ink",
        )
      }
    >
      {children}
    </NavLink>
  );
}
