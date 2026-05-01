import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";
import Icon from "@/components/Icon";

interface ShortcutRow {
  keys: string[];
  label: string;
}

const TABS = [
  {
    id: "selection",
    label: "Selection",
    rows: [
      { keys: ["Click"], label: "Select an item" },
      { keys: ["Shift", "+", "Click"], label: "Add or remove from selection" },
      { keys: ["Drag on empty area"], label: "Marquee-select multiple items" },
      { keys: ["Ctrl", "+", "A"], label: "Select all desks and furniture" },
      { keys: ["Esc"], label: "Clear selection" },
    ] satisfies ShortcutRow[],
  },
  {
    id: "editing",
    label: "Editing",
    rows: [
      { keys: ["Drag"], label: "Move a selected item (drag any one to move all)" },
      { keys: ["Drag corner"], label: "Resize a selected item" },
      { keys: ["Drag rotation handle"], label: "Rotate" },
      { keys: ["Shift", "+", "Drag rotation"], label: "Snap rotation to 45°" },
      { keys: ["Right-click desk"], label: "Toggle front-row for that desk" },
      { keys: ["Right-click seat"], label: "Toggle front-row for that seat" },
      { keys: ["Click seat"], label: "Assign a student" },
      { keys: ["Delete"], label: "Remove selected items" },
      { keys: ["Ctrl", "+", "C"], label: "Copy selected items" },
      { keys: ["Ctrl", "+", "V"], label: "Paste at offset" },
      { keys: ["Ctrl", "+", "D"], label: "Duplicate selected items" },
    ] satisfies ShortcutRow[],
  },
  {
    id: "app",
    label: "App",
    rows: [
      { keys: ["Ctrl", "+", "Z"], label: "Undo" },
      { keys: ["Ctrl", "+", "Shift", "+", "Z"], label: "Redo" },
      { keys: ["?"], label: "Open this help" },
    ] satisfies ShortcutRow[],
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function HelpDialog({ open, onOpenChange }: Props) {
  const [active, setActive] = useState<TabId>("selection");
  const tab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-white shadow-xl focus:outline-none">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-3">
            <div>
              <Dialog.Title className="text-base font-semibold">Keyboard shortcuts</Dialog.Title>
              <Dialog.Description className="text-xs text-ink-muted">
                Quick reference for the room canvas and global app commands.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="rounded p-1 text-ink-muted hover:bg-slate-100 hover:text-ink"
                aria-label="Close"
              >
                <Icon name="x" size={16} />
              </button>
            </Dialog.Close>
          </div>

          <nav className="flex shrink-0 gap-1 border-b border-slate-200 px-3 py-2" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={active === t.id}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium transition",
                  active === t.id
                    ? "bg-ink text-white"
                    : "text-ink-muted hover:bg-slate-100 hover:text-ink",
                )}
                onClick={() => setActive(t.id as TabId)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
            <ul className="space-y-1">
              {tab.rows.map((row, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-4 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
                >
                  <span className="text-ink-muted">{row.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {row.keys.map((k, j) =>
                      k === "+" ? (
                        <span key={j} className="text-ink-muted">+</span>
                      ) : (
                        <kbd
                          key={j}
                          className="inline-block min-w-[24px] rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-center text-xs font-mono font-medium text-ink shadow-sm"
                        >
                          {k}
                        </kbd>
                      ),
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="shrink-0 border-t border-slate-200 px-5 py-2 text-[11px] text-ink-muted">
            On macOS, ⌘ works the same as Ctrl.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
