import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useAppStore } from "@/store/appStore";
import Icon from "@/components/Icon";
import { cn } from "@/lib/cn";

export default function ClassesIndex() {
  const navigate = useNavigate();
  const classes = useAppStore((s) => s.classes);
  const createClass = useAppStore((s) => s.createClass);
  const renameClass = useAppStore((s) => s.renameClass);
  const duplicateClass = useAppStore((s) => s.duplicateClass);
  const deleteClass = useAppStore((s) => s.deleteClass);
  const [newName, setNewName] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

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
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Your classes</h1>
      <p className="mb-6 text-sm text-ink-muted">
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
          <button className="btn-primary whitespace-nowrap" onClick={handleCreate}>Create</button>
        </div>
        {newError && <p className="mt-2 text-xs text-red-600">{newError}</p>}
      </div>

      {classes.length === 0 ? (
        <div className="card p-8 text-center text-ink-muted">No classes yet — add one above.</div>
      ) : (
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
                      onDuplicate={() => {
                        const newId = duplicateClass(c.id);
                        if (newId) navigate(`/classes/${newId}/roster`);
                      }}
                      onDelete={() => {
                        if (confirm(`Delete "${c.name}"? This cannot be undone.`)) deleteClass(c.id);
                      }}
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
  onDuplicate,
  onDelete,
}: {
  onRename: () => void;
  onDuplicate: () => void;
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
          className="z-50 w-40 rounded-md border border-slate-200 bg-white p-1 text-sm shadow-lg"
        >
          <MenuItem onSelect={onRename} icon="edit" label="Rename" />
          <MenuItem onSelect={onDuplicate} icon="copy" label="Duplicate" />
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
