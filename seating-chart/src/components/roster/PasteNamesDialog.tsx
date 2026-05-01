import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAppStore } from "@/store/appStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
}

export default function PasteNamesDialog({ open, onOpenChange, classId }: Props) {
  const addStudents = useAppStore((s) => s.addStudents);
  const [text, setText] = useState("");

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  function handleAdd() {
    if (lines.length === 0) return;
    addStudents(classId, lines);
    setText("");
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl focus:outline-none">
          <Dialog.Title className="mb-1 text-lg font-semibold">Paste student names</Dialog.Title>
          <Dialog.Description className="mb-4 text-sm text-ink-muted">
            One name per line. Empty lines are ignored.
          </Dialog.Description>
          <textarea
            className="input h-56 resize-none font-mono text-sm"
            placeholder={"Ada Lovelace\nAlan Turing\nGrace Hopper"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-ink-muted">{lines.length} student{lines.length === 1 ? "" : "s"} ready</span>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <button className="btn-secondary">Cancel</button>
              </Dialog.Close>
              <button className="btn-primary" onClick={handleAdd} disabled={lines.length === 0}>
                Add {lines.length || ""}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
