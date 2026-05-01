import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useMatch, useParams } from "react-router-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useAppStore } from "@/store/appStore";
import { exportStateToFile, readStateFromFile } from "@/lib/io";
import { cn } from "@/lib/cn";
import HelpDialog from "@/components/HelpDialog";
import Icon from "@/components/Icon";

export default function AppShell() {
  const { id } = useParams();
  const isClassRoute = useMatch("/classes/:id/*");
  const klass = useAppStore((s) => (id ? s.classes.find((c) => c.id === id) : undefined));
  const [helpOpen, setHelpOpen] = useState(false);

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

  // "?" anywhere opens the help dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setHelpOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5 shadow-topbar">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            className="rounded px-1 text-sm font-semibold tracking-tight text-ink hover:text-accent-blue"
            title="Back to all classes"
          >
            Seating Chart Designer
          </Link>
          {isClassRoute && klass && (
            <>
              <span className="h-5 w-px bg-slate-300" aria-hidden />
              <h1 className="truncate text-base font-semibold text-ink" title={klass.name}>
                {klass.name}
              </h1>
              <nav className="ml-2 flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5">
                <TabLink to={`/classes/${klass.id}/roster`}>Roster</TabLink>
                <TabLink to={`/classes/${klass.id}/room`}>Room</TabLink>
                <TabLink to={`/classes/${klass.id}/history`}>History</TabLink>
              </nav>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary"
            onClick={() => setHelpOpen(true)}
            title="Keyboard shortcuts (?)"
          >
            <Icon name="help-circle" size={14} />
            <span className="hidden md:inline">Help</span>
          </button>
          <TopbarMenu />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <Outlet />
      </main>
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

function TopbarMenu() {
  const fileRef = useRef<HTMLInputElement>(null);

  function exportNow() {
    // Exports the full Teacher's Desk classroom (every tool) — see io.ts.
    exportStateToFile();
  }

  const handleImport: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const replace = confirm(
        `Import "${file.name}"?\n\n` +
          `OK = Replace all current data.\nCancel = Merge (add to current data).`,
      );
      const mode: "replace" | "merge" = replace ? "replace" : "merge";
      const result = await readStateFromFile(file, mode);

      if (result.warnings.length) {
        alert(`Imported with notes:\n- ${result.warnings.join("\n- ")}`);
      }

      if (result.applied) {
        // Full-suite import: shared module already mutated localStorage. Reload
        // so every tool (including this one's Zustand store) re-hydrates.
        location.reload();
        return;
      }

      // Legacy seating-chart-only file — apply locally via the store.
      if (result.state) {
        const store = useAppStore.getState();
        if (replace) {
          store.replaceState(result.state);
        } else {
          store.replaceState({
            classes: [...store.classes, ...result.state.classes],
            activeClassId: store.activeClassId ?? result.state.activeClassId,
            schemaVersion: store.schemaVersion,
          });
        }
      }
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImport}
      />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            className="rounded-md border border-slate-300 bg-white p-2 text-ink hover:bg-slate-50"
            title="Menu"
          >
            <Icon name="more-horizontal" size={16} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 w-44 rounded-md border border-slate-200 bg-white p-1 text-sm shadow-lg"
          >
            <DropdownMenu.Item
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-slate-100"
              onSelect={() => fileRef.current?.click()}
            >
              <Icon name="upload" size={14} />
              <span>Import…</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-slate-100"
              onSelect={exportNow}
            >
              <Icon name="download" size={14} />
              <span>Export…</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}

function TabLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "rounded px-2.5 py-1 text-xs font-medium transition",
          isActive ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink",
        )
      }
    >
      {children}
    </NavLink>
  );
}
