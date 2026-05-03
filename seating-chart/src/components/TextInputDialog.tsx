import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Icon from "@/components/Icon";

/**
 * Reusable single-line text input modal — replaces the few remaining
 * window.prompt() calls (arrangement label, box/circle furniture rename) and
 * gives the new "Duplicate room" flow a place to ask for a name. Suite-styled,
 * keyboard-friendly (Enter submits, Esc cancels), and supports inline
 * validation via a `validate` predicate.
 *
 * Open/close is driven by the parent — pass `open` and `onOpenChange`. On
 * submit we call `onSubmit(value)` then close the dialog; on cancel we just
 * close. The component never owns persistent state.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  placeholder?: string;
  initialValue?: string;
  /** Submit button label. Defaults to "Save". */
  submitLabel?: string;
  /** Cancel button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Returns null when the value is acceptable, or an error string to show
   *  inline (and disable the submit button). Receives the live trimmed value. */
  validate?: (value: string) => string | null;
  /** Allow empty submissions. Default false. */
  allowEmpty?: boolean;
  onSubmit: (value: string) => void;
}

export default function TextInputDialog({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  initialValue = "",
  submitLabel = "Save",
  cancelLabel = "Cancel",
  validate,
  allowEmpty = false,
  onSubmit,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset to the prefill every time the dialog opens. Without this a stale
  // value sticks across re-opens (e.g. label dialog re-used for two
  // arrangements would carry the previous label forward).
  useEffect(() => {
    if (open) {
      setValue(initialValue);
      // Focus + select on the next tick so Radix has finished mounting.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open, initialValue]);

  const trimmed = value.trim();
  const validationError = validate ? validate(trimmed) : null;
  const emptyError = !allowEmpty && trimmed.length === 0 ? "Required" : null;
  const errorMsg = validationError ?? emptyError;
  const canSubmit = errorMsg == null;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit(trimmed);
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5 shadow-xl focus:outline-none">
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

          <input
            ref={inputRef}
            className="input"
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />

          {/* Reserve a fixed line for the validation message so the layout
              doesn't jump when an error appears. Empty value validates
              "Required" only when the input has been touched at least once. */}
          <p className="mt-1 min-h-[1.25rem] text-xs text-red-600">
            {errorMsg && value.length > 0 ? errorMsg : " "}
          </p>

          <div className="mt-3 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="btn-secondary">{cancelLabel}</button>
            </Dialog.Close>
            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {submitLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
