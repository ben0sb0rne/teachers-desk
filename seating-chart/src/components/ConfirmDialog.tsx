import { useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Icon from "@/components/Icon";

/**
 * Reusable yes/no confirmation modal — replaces window.confirm() across the
 * seating chart. Mirrors TextInputDialog's ergonomics: title / description /
 * configurable button labels / Esc cancels (Radix default) / Enter confirms.
 *
 * The cancel button is autofocused intentionally — destructive prompts should
 * default to "no", so a casual Enter without reading the dialog cancels
 * instead of confirming. Use `danger` to swap the confirm button to the red
 * btn-danger style for delete-style flows.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Confirm button label. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Render the confirm button as the red danger style. */
  danger?: boolean;
  onConfirm: () => void;
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Move focus to the cancel button after Radix mounts. Destructive prompts
  // shouldn't fire on a stray Enter keypress.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => cancelRef.current?.focus());
    }
  }, [open]);

  function handleConfirm() {
    onConfirm();
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5 shadow-xl focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleConfirm();
            }
          }}
        >
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-xs text-ink-muted">
                  {description}
                </Dialog.Description>
              )}
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

          <div className="mt-3 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button ref={cancelRef} className="btn-secondary">{cancelLabel}</button>
            </Dialog.Close>
            <button
              className={danger ? "btn-danger" : "btn-primary"}
              onClick={handleConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
