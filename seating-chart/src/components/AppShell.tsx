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

  // Toggle body.app-view on class-editor routes so the topstrip switches
  // from transparent (homepage) to paper-cream (app-view) per the suite
  // convention in shared/desk.css.
  useEffect(() => {
    document.body.classList.toggle("app-view", !!isClassRoute);
    document.body.classList.toggle("view-home", !isClassRoute);
    document.body.classList.toggle("view-class", !!isClassRoute);
    return () => {
      document.body.classList.remove("app-view", "view-home", "view-class");
    };
  }, [isClassRoute]);

  return (
    <div className="flex h-full flex-col">
      {/* Topstrip uses the shared breadcrumb pattern: every screen leads
          with [← THE TEACHER'S DESK], then drills down. Class-editor
          routes show the class switcher + Roster/Room/History tabs as a
          single contextual nav. Background is transparent on the index
          and paper-cream on class-editor routes (driven by body.app-view). */}
      <header className="suite-topstrip">
        <nav className="suite-breadcrumb" aria-label="Breadcrumb">
          <a href="../" className="crumb-home" title="Back to The Teacher's Desk">
            <Icon name="chevron-left" size={14} />
            <span>The Teacher's Desk</span>
          </a>
          {!isIndexRoute && (
            <Link to="/" title="Back to all classes">
              All Classes
            </Link>
          )}
          {isClassRoute && klass && (
            <span className="is-current">
              <ClassSwitcher currentClassId={klass.id} currentClassName={klass.name} />
            </span>
          )}
        </nav>
        {isClassRoute && klass && (
          <nav className="seating-tabs" aria-label="Class views">
            <TabLink to={`/classes/${klass.id}/roster`}>Roster</TabLink>
            <TabLink to={`/classes/${klass.id}/room`}>Room</TabLink>
            <TabLink to={`/classes/${klass.id}/history`}>History</TabLink>
          </nav>
        )}
        <div className="suite-topstrip-actions">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            title="Keyboard shortcuts (?)"
            aria-label="Help"
          >
            <Icon name="help-circle" size={20} />
          </button>
          <button
            type="button"
            className="settings-button"
            onClick={() => setSettingsOpen(true)}
            title="Settings (S)"
            aria-label="Settings"
          >
            <Icon name="settings" size={20} />
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
    <NavLink to={to} className={({ isActive }) => cn(isActive && "is-active")}>
      {children}
    </NavLink>
  );
}
