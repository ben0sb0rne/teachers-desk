import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";
import Icon from "@/components/Icon";
import {
  getPreference,
  getTheme,
  setPreference,
  setTheme,
  type SuiteTheme,
} from "@shared/storage.js";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const THEME_OPTIONS: SuiteTheme[] = ["auto", "light", "dark"];

/**
 * Suite-wide settings dialog. Mirrors the design and sections of the vanilla
 * shared/settings.js dialog used by the homepage / about / bingo, just rendered
 * via Radix so it gets proper focus management and keyboard handling.
 *
 * Shows Appearance + Sound. The Data section (export / import) is not here
 * because the seating chart's existing TopbarMenu already has it AND supports
 * the legacy seating-chart-only file format that the shared module doesn't.
 */
export default function SuiteSettingsDialog({ open, onOpenChange }: Props) {
  const [theme, setLocalTheme] = useState<SuiteTheme>(() => getTheme() as SuiteTheme);
  const [muted, setMuted] = useState<boolean>(() => !!getPreference("soundMuted", false));
  const [volume, setVolume] = useState<number>(() => getPreference("soundVolume", 0.6) as number);

  // Re-sync from storage whenever the dialog opens (in case theme was changed
  // elsewhere — bingo's settings overlay, another tab, etc.).
  useEffect(() => {
    if (!open) return;
    setLocalTheme(getTheme() as SuiteTheme);
    setMuted(!!getPreference("soundMuted", false));
    setVolume(getPreference("soundVolume", 0.6) as number);
  }, [open]);

  function pickTheme(next: SuiteTheme) {
    setTheme(next);
    setLocalTheme(next);
  }

  function toggleMute(next: boolean) {
    setPreference("soundMuted", next);
    setMuted(next);
  }

  function changeVolume(next: number) {
    setPreference("soundVolume", next);
    setVolume(next);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col",
            "rounded-md border border-ink/15 bg-paper text-ink shadow-xl focus:outline-none font-slab",
          )}
        >
          <div className="flex items-center justify-between gap-4 border-b border-ink/10 px-5 py-3">
            <Dialog.Title className="text-xs font-bold uppercase tracking-wider">
              Settings
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="rounded p-1 text-ink-muted hover:bg-ink/5 hover:text-ink"
                aria-label="Close"
              >
                <Icon name="x" size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            {/* APPEARANCE */}
            <section className="mb-5">
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink-muted">
                Appearance
              </h3>
              <div className="flex items-center justify-between gap-3 text-sm">
                <label>Theme</label>
                <div className="inline-flex overflow-hidden rounded-md border border-ink/20">
                  {THEME_OPTIONS.map((t, i) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => pickTheme(t)}
                      className={cn(
                        "px-3 py-1 text-[11px] font-bold uppercase tracking-widest transition",
                        i < THEME_OPTIONS.length - 1 && "border-r border-ink/20",
                        t === theme
                          ? "bg-ink text-paper"
                          : "bg-transparent text-ink-muted hover:bg-ink/5 hover:text-ink",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* SOUND */}
            <section className="mb-2">
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink-muted">
                Sound
              </h3>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <label htmlFor="suite-mute">Mute all sounds</label>
                <input
                  id="suite-mute"
                  type="checkbox"
                  checked={muted}
                  onChange={(e) => toggleMute(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-accent-blue"
                />
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <label htmlFor="suite-volume">Volume</label>
                <input
                  id="suite-volume"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  disabled={muted}
                  onChange={(e) => changeVolume(parseFloat(e.target.value))}
                  className="w-44 accent-accent-blue disabled:opacity-50"
                />
              </div>
            </section>

            <p className="mt-4 text-[11px] text-ink-muted">
              Theme persists across all tools. Use Import / Export in the
              top-right menu for classroom data.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
