import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useAppStore } from "@/store/appStore";
import Icon from "@/components/Icon";
import { cn } from "@/lib/cn";
import TextInputDialog from "@/components/TextInputDialog";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function ClassesIndex() {
  const navigate = useNavigate();
  const classes = useAppStore((s) => s.classes);
  const createClass = useAppStore((s) => s.createClass);
  const renameClass = useAppStore((s) => s.renameClass);
  const duplicateRoom = useAppStore((s) => s.duplicateRoom);
  const deleteClass = useAppStore((s) => s.deleteClass);
  const [newName, setNewName] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  /** When set, the duplicate-room dialog is open for this source class. */
  const [duplicateSource, setDuplicateSource] = useState<{ id: string; name: string } | null>(null);
  /** When set, the delete-class confirmation is open for this class. */
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  /** Pick a non-colliding default name for a duplicated room: `${base} (copy)`,
   *  bumping to `(copy 2)`, `(copy 3)`, … if needed. */
  function defaultCopyName(base: string): string {
    const taken = new Set(classes.map((c) => c.name.trim().toLowerCase()));
    const first = `${base} (copy)`;
    if (!taken.has(first.toLowerCase())) return first;
    for (let n = 2; n < 100; n++) {
      const candidate = `${base} (copy ${n})`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return first;
  }

  function handleDuplicateConfirm(newName: string) {
    if (!duplicateSource) return;
    const newId = duplicateRoom(duplicateSource.id, newName);
    setDuplicateSource(null);
    if (newId) navigate(`/classes/${newId}/roster`);
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setNewError("Please enter a class name.");
      return;
    }
    const id = createClass(name);
    if (id === null) {
      setNewError(`A class named "${name}" already exists.`);
      return;
    }
    setNewName("");
    setNewError(null);
    navigate(`/classes/${id}/roster`);
  }

  function handleRename(id: string, fallback: string) {
    const name = editValue.trim();
    if (!name) {
      setEditError("Class name can't be empty.");
      return;
    }
    if (name === fallback) {
      setEditingId(null);
      setEditError(null);
      return;
    }
    const ok = renameClass(id, name);
    if (!ok) {
      setEditError(`A class named "${name}" already exists.`);
      return;
    }
    setEditingId(null);
    setEditError(null);
  }

  function startRename(id: string, current: string) {
    setEditingId(id);
    setEditValue(current);
    setEditError(null);
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Heading + subtitle sit on the wood-bg directly (no card behind them).
          Use text-paper-on-wood, which is always-light cream and doesn't theme
          dark like text-paper does. */}
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-paper-on-wood">Your classes</h1>
      <p className="mb-6 text-sm text-paper-on-wood/70">
        Each class has its own roster, room layout, and seating history.
      </p>

      <div className="card mb-8 p-4">
        <label className="label mb-2">Add a new class</label>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="e.g. Period 3 Math"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (newError) setNewError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button className="btn-secondary whitespace-nowrap" onClick={handleCreate}>Create</button>
        </div>
        {newError && <p className="mt-2 text-xs text-red-600">{newError}</p>}
      </div>

      {classes.length === 0 ? (
        <div className="card p-8 text-center text-ink-muted">No classes yet — add one above.</div>
      ) : null}

      <TextInputDialog
        open={duplicateSource != null}
        onOpenChange={(open) => { if (!open) setDuplicateSource(null); }}
        title="Duplicate room"
        description={
          duplicateSource
            ? `Clone the room layout from "${duplicateSource.name}" into a fresh class with no students or seating history. Tweak the name below.`
            : ""
        }
        placeholder="e.g. Period 4 Math"
        initialValue={duplicateSource ? defaultCopyName(duplicateSource.name) : ""}
        submitLabel="Duplicate"
        validate={(v) => {
          if (classes.some((c) => c.name.trim().toLowerCase() === v.trim().toLowerCase())) {
            return "A class with that name already exists.";
          }
          return null;
        }}
        onSubmit={handleDuplicateConfirm}
      />

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title={pendingDelete ? `Delete "${pendingDelete.name}"?` : ""}
        description="This deletes the class along with its roster, room layout, and seating history. This cannot be undone."
        confirmLabel="Delete class"
        danger
        onConfirm={() => {
          if (pendingDelete) deleteClass(pendingDelete.id);
        }}
      />

      {classes.length > 0 && (
        <ul className="space-y-2">
          {classes.map((c) => (
            <li key={c.id} className="card p-4">
              {editingId === c.id ? (
                <div>
                  <div className="flex items-center gap-2">
                    <input
                      className="input"
                      value={editValue}
                      autoFocus
                      onChange={(e) => {
                        setEditValue(e.target.value);
                        if (editError) setEditError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(c.id, c.name);
                        else if (e.key === "Escape") {
                          setEditingId(null);
                          setEditError(null);
                        }
                      }}
                    />
                    <button className="btn-secondary whitespace-nowrap" onClick={() => handleRename(c.id, c.name)}>
                      Save
                    </button>
                    <button
                      className="btn-secondary whitespace-nowrap"
                      onClick={() => {
                        setEditingId(null);
                        setEditError(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {editError && <p className="mt-2 text-xs text-red-600">{editError}</p>}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-medium">{c.name}</div>
                    <div className="truncate text-xs text-ink-muted">
                      {pluralise(c.students.length, "student")} · {pluralise(c.room.desks.length, "desk")} ·{" "}
                      {pluralise(c.arrangements.length, "arrangement")}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      to={`/classes/${c.id}/roster`}
                      className="btn-secondary whitespace-nowrap"
                    >
                      Roster
                    </Link>
                    <Link
                      to={`/classes/${c.id}/room`}
                      className="btn-primary whitespace-nowrap"
                    >
                      Open room
                    </Link>
                    <ClassMenu
                      onRename={() => startRename(c.id, c.name)}
                      onDuplicateRoom={() => setDuplicateSource({ id: c.id, name: c.name })}
                      onDelete={() => setPendingDelete({ id: c.id, name: c.name })}
                    />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function pluralise(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function ClassMenu({
  onRename,
  onDuplicateRoom,
  onDelete,
}: {
  onRename: () => void;
  onDuplicateRoom: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="rounded-md border border-slate-300 bg-white p-2 text-ink hover:bg-slate-50" title="More actions">
          <Icon name="more-horizontal" size={16} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-48 rounded-md border border-slate-200 bg-white p-1 text-sm shadow-lg"
        >
          <MenuItem onSelect={onRename} icon="edit" label="Rename" />
          <MenuItem onSelect={onDuplicateRoom} icon="copy" label="Duplicate room" />
          <DropdownMenu.Separator className="my-1 h-px bg-slate-200" />
          <MenuItem onSelect={onDelete} icon="trash" label="Delete" danger />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuItem({
  onSelect,
  icon,
  label,
  danger = false,
}: {
  onSelect: () => void;
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  danger?: boolean;
}) {
  return (
    <DropdownMenu.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-slate-100",
        danger && "text-red-600 data-[highlighted]:bg-red-50",
      )}
      onSelect={onSelect}
    >
      <Icon name={icon} size={14} />
      <span>{label}</span>
    </DropdownMenu.Item>
  );
}
