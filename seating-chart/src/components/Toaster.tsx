import * as Toast from "@radix-ui/react-toast";
import { useToasts } from "@/lib/toast";

/** Mounts once (in AppShell). Renders brief confirmations for otherwise-silent
 *  actions — arrangement saved, room duplicated/deleted, etc. Subtle paper card,
 *  bottom-right, auto-dismissing. */
export default function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <Toast.Provider swipeDirection="right" duration={2800}>
      {toasts.map((t) => (
        <Toast.Root
          key={t.id}
          open
          onOpenChange={(o) => {
            if (!o) dismiss(t.id);
          }}
          className="rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink shadow-paper"
        >
          <Toast.Description>{t.message}</Toast.Description>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed bottom-3 right-3 z-[60] m-0 flex w-72 max-w-[90vw] list-none flex-col gap-2 p-0 outline-none" />
    </Toast.Provider>
  );
}
