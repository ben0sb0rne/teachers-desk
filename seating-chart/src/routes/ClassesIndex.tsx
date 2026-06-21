import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useAppStore } from "@/store/appStore";
import Icon from "@/components/Icon";
import { cn } from "@/lib/cn";
import TextInputDialog from "@/components/TextInputDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { Room, RoomId } from "@/types";

export default function ClassesIndex() {
  const navigate = useNavigate();
  const rooms = useAppStore((s) => s.rooms);
  const classes = useAppStore((s) => s.classes);
  const createClass = useAppStore((s) => s.createClass);
  const renameClass = useAppStore((s) => s.renameClass);
  const deleteClass = useAppStore((s) => s.deleteClass);
  const setClassRoom = useAppStore((s) => s.setClassRoom);
  const createRoom = useAppStore((s) => s.createRoom);
  const renameRoom = useAppStore((s) => s.renameRoom);
  const duplicateRoom = useAppStore((s) => s.duplicateRoom);
  const deleteRoom = useAppStore((s) => s.deleteRoom);

  // ── Create inputs ──
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomError, setNewRoomError] = useState<string | null>(null);
  const [newClassName, setNewClassName] = useState("");
  const [newClassRoomId, setNewClassRoomId] = useState<string>(""); // "" = a fresh blank room
  const [newClassError, setNewClassError] = useState<string | null>(null);

  // ── Dialog targets ──
  const [renameRoomTarget, setRenameRoomTarget] = useState<{ id: string; name: string } | null>(null);
  const [duplicateRoomTarget, setDuplicateRoomTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteRoomTarget, setDeleteRoomTarget] = useState<{ id: string; name: string; blockedBy: string[] } | null>(null);
  const [renameClassTarget, setRenameClassTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteClassTarget, setDeleteClassTarget] = useState<{ id: string; name: string } | null>(null);
  const [changeRoomTarget, setChangeRoomTarget] = useState<
    { id: string; name: string; roomId: RoomId | null; hasSeating: boolean } | null
  >(null);

  const usageByRoom = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of classes) if (c.roomId) m.set(c.roomId, (m.get(c.roomId) ?? 0) + 1);
    return m;
  }, [classes]);

  const roomNameFor = (roomId: RoomId | null): string | null =>
    roomId ? rooms.find((r) => r.id === roomId)?.name ?? null : null;

  function handleCreateRoom() {
    const name = newRoomName.trim();
    if (!name) {
      setNewRoomError("Please enter a room name.");
      return;
    }
    const id = createRoom(name);
    if (id === null) {
      setNewRoomError(`A room named "${name}" already exists.`);
      return;
    }
    setNewRoomName("");
    setNewRoomError(null);
    navigate(`/rooms/${id}`);
  }

  function handleCreateClass() {
    const name = newClassName.trim();
    if (!name) {
      setNewClassError("Please enter a class name.");
      return;
    }
    const id = createClass(name, newClassRoomId || undefined);
    if (id === null) {
      setNewClassError(`A class named "${name}" already exists.`);
      return;
    }
    setNewClassName("");
    setNewClassRoomId("");
    setNewClassError(null);
    navigate(`/classes/${id}/roster`);
  }

  /** Pick a non-colliding default name for a duplicated room: `${base} (copy)`,
   *  bumping to `(copy 2)`, `(copy 3)`, … if needed. */
  function defaultCopyName(base: string): string {
    const taken = new Set(rooms.map((r) => r.name.trim().toLowerCase()));
    const first = `${base} (copy)`;
    if (!taken.has(first.toLowerCase())) return first;
    for (let n = 2; n < 100; n++) {
      const candidate = `${base} (copy ${n})`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return first;
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* ───────────── Rooms ───────────── */}
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-paper-on-wood">Rooms</h1>
      <p className="mb-4 text-sm text-paper-on-wood/70">
        Reusable desk layouts. Point several classes at one room — editing it updates them all.
      </p>

      <div className="card mb-4 p-4">
        <label className="label mb-2">New room</label>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="e.g. Room 214"
            value={newRoomName}
            onChange={(e) => {
              setNewRoomName(e.target.value);
              if (newRoomError) setNewRoomError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleCreateRoom()}
          />
          <button className="btn-secondary whitespace-nowrap" onClick={handleCreateRoom}>
            Create room
          </button>
        </div>
        {newRoomError && <p className="mt-2 text-xs text-red-600">{newRoomError}</p>}
      </div>

      {rooms.length === 0 ? (
        <div className="card mb-8 p-6 text-center text-ink-muted">No rooms yet — create one above.</div>
      ) : (
        <ul className="mb-8 space-y-2">
          {rooms.map((r) => {
            const used = usageByRoom.get(r.id) ?? 0;
            return (
              <li key={r.id} className="card flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-medium">{r.name}</div>
                  <div className="truncate text-xs text-ink-muted">
                    {pluralise(r.desks.length, "desk")} · used by {pluralise(used, "class", "classes")}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link to={`/rooms/${r.id}`} className="btn-primary whitespace-nowrap">
                    Edit layout
                  </Link>
                  <RoomMenu
                    onRename={() => setRenameRoomTarget({ id: r.id, name: r.name })}
                    onDuplicate={() => setDuplicateRoomTarget({ id: r.id, name: r.name })}
                    onDelete={() =>
                      setDeleteRoomTarget({
                        id: r.id,
                        name: r.name,
                        blockedBy: classes.filter((c) => c.roomId === r.id).map((c) => c.name),
                      })
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ───────────── Classes ───────────── */}
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-paper-on-wood">Classes</h1>
      <p className="mb-4 text-sm text-paper-on-wood/70">
        Each class has its own roster and seating. Give it a room to seat students in.
      </p>

      <div className="card mb-4 p-4">
        <label className="label mb-2">Add a class</label>
        <div className="flex flex-wrap gap-2">
          <input
            className="input min-w-[12rem] flex-1"
            placeholder="e.g. Period 3 Math"
            value={newClassName}
            onChange={(e) => {
              setNewClassName(e.target.value);
              if (newClassError) setNewClassError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleCreateClass()}
          />
          <select
            className="input w-auto"
            value={newClassRoomId}
            onChange={(e) => setNewClassRoomId(e.target.value)}
            title="Which room is this class in?"
          >
            <option value="">New blank room</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button className="btn-secondary whitespace-nowrap" onClick={handleCreateClass}>
            Create
          </button>
        </div>
        {newClassError && <p className="mt-2 text-xs text-red-600">{newClassError}</p>}
      </div>

      {classes.length === 0 ? (
        <div className="card p-6 text-center text-ink-muted">No classes yet — add one above.</div>
      ) : (
        <ul className="space-y-2">
          {classes.map((c) => {
            const rn = roomNameFor(c.roomId);
            return (
              <li key={c.id} className="card flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-medium">{c.name}</div>
                  <div className="truncate text-xs text-ink-muted">
                    {pluralise(c.students.length, "student")} ·{" "}
                    {rn ? (
                      <>Room: {rn}</>
                    ) : (
                      <span className="text-amber-700">No room</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link to={`/classes/${c.id}/roster`} className="btn-secondary whitespace-nowrap">
                    Roster
                  </Link>
                  <Link to={`/classes/${c.id}/room`} className="btn-primary whitespace-nowrap">
                    Seating
                  </Link>
                  <ClassMenu
                    onRename={() => setRenameClassTarget({ id: c.id, name: c.name })}
                    onChangeRoom={() =>
                      setChangeRoomTarget({
                        id: c.id,
                        name: c.name,
                        roomId: c.roomId,
                        hasSeating: Object.keys(c.currentAssignments ?? {}).length > 0,
                      })
                    }
                    onDelete={() => setDeleteClassTarget({ id: c.id, name: c.name })}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ───────────── Dialogs ───────────── */}
      <TextInputDialog
        open={renameRoomTarget != null}
        onOpenChange={(o) => { if (!o) setRenameRoomTarget(null); }}
        title="Rename room"
        initialValue={renameRoomTarget?.name ?? ""}
        submitLabel="Save"
        validate={(v) =>
          rooms.some((r) => r.id !== renameRoomTarget?.id && r.name.trim().toLowerCase() === v.toLowerCase())
            ? "A room with that name already exists."
            : null
        }
        onSubmit={(v) => { if (renameRoomTarget) renameRoom(renameRoomTarget.id, v); }}
      />

      <TextInputDialog
        open={duplicateRoomTarget != null}
        onOpenChange={(o) => { if (!o) setDuplicateRoomTarget(null); }}
        title="Duplicate room"
        description={
          duplicateRoomTarget
            ? `Make an independent copy of "${duplicateRoomTarget.name}"'s layout. The copy isn't linked — edit it freely.`
            : ""
        }
        initialValue={duplicateRoomTarget ? defaultCopyName(duplicateRoomTarget.name) : ""}
        submitLabel="Duplicate"
        validate={(v) =>
          rooms.some((r) => r.name.trim().toLowerCase() === v.toLowerCase())
            ? "A room with that name already exists."
            : null
        }
        onSubmit={(v) => {
          if (!duplicateRoomTarget) return;
          const newId = duplicateRoom(duplicateRoomTarget.id, v);
          if (newId) navigate(`/rooms/${newId}`);
        }}
      />

      <ConfirmDialog
        open={deleteRoomTarget != null}
        onOpenChange={(o) => { if (!o) setDeleteRoomTarget(null); }}
        title={
          deleteRoomTarget
            ? deleteRoomTarget.blockedBy.length > 0
              ? `Can't delete "${deleteRoomTarget.name}"`
              : `Delete "${deleteRoomTarget.name}"?`
            : ""
        }
        description={
          deleteRoomTarget
            ? deleteRoomTarget.blockedBy.length > 0
              ? `It's still used by ${deleteRoomTarget.blockedBy.join(", ")}. Point those classes at a different room first (Change room), then delete it.`
              : "This deletes the room layout. Classes aren't affected. This cannot be undone."
            : undefined
        }
        confirmLabel={deleteRoomTarget && deleteRoomTarget.blockedBy.length > 0 ? "OK" : "Delete room"}
        danger={!!deleteRoomTarget && deleteRoomTarget.blockedBy.length === 0}
        onConfirm={() => {
          if (deleteRoomTarget && deleteRoomTarget.blockedBy.length === 0) deleteRoom(deleteRoomTarget.id);
        }}
      />

      <TextInputDialog
        open={renameClassTarget != null}
        onOpenChange={(o) => { if (!o) setRenameClassTarget(null); }}
        title="Rename class"
        initialValue={renameClassTarget?.name ?? ""}
        submitLabel="Save"
        validate={(v) =>
          classes.some((c) => c.id !== renameClassTarget?.id && c.name.trim().toLowerCase() === v.toLowerCase())
            ? "A class with that name already exists."
            : null
        }
        onSubmit={(v) => { if (renameClassTarget) renameClass(renameClassTarget.id, v); }}
      />

      <ConfirmDialog
        open={deleteClassTarget != null}
        onOpenChange={(o) => { if (!o) setDeleteClassTarget(null); }}
        title={deleteClassTarget ? `Delete "${deleteClassTarget.name}"?` : ""}
        description="This deletes the class along with its roster and seating history. The room layout is not affected. This cannot be undone."
        confirmLabel="Delete class"
        danger
        onConfirm={() => { if (deleteClassTarget) deleteClass(deleteClassTarget.id); }}
      />

      <ChangeRoomDialog
        target={changeRoomTarget}
        rooms={rooms}
        onClose={() => setChangeRoomTarget(null)}
        onConfirm={(roomId) => { if (changeRoomTarget) setClassRoom(changeRoomTarget.id, roomId); }}
      />
    </div>
  );
}

function pluralise(n: number, word: string, plural?: string): string {
  return `${n} ${n === 1 ? word : plural ?? `${word}s`}`;
}

function RoomMenu({
  onRename,
  onDuplicate,
  onDelete,
}: {
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <Menu>
      <MenuItem onSelect={onRename} icon="edit" label="Rename" />
      <MenuItem onSelect={onDuplicate} icon="copy" label="Duplicate" />
      <DropdownMenu.Separator className="my-1 h-px bg-slate-200" />
      <MenuItem onSelect={onDelete} icon="trash" label="Delete" danger />
    </Menu>
  );
}

function ClassMenu({
  onRename,
  onChangeRoom,
  onDelete,
}: {
  onRename: () => void;
  onChangeRoom: () => void;
  onDelete: () => void;
}) {
  return (
    <Menu>
      <MenuItem onSelect={onRename} icon="edit" label="Rename" />
      <MenuItem onSelect={onChangeRoom} icon="grid" label="Change room" />
      <DropdownMenu.Separator className="my-1 h-px bg-slate-200" />
      <MenuItem onSelect={onDelete} icon="trash" label="Delete" danger />
    </Menu>
  );
}

function Menu({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="rounded-md border border-slate-300 bg-white p-2 text-ink hover:bg-slate-50"
          title="More actions"
        >
          <Icon name="more-horizontal" size={16} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-48 rounded-md border border-slate-200 bg-white p-1 text-sm shadow-lg"
        >
          {children}
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

/** Reassign which room a class is taught in. Switching rooms clears the class's
 *  current seating (seat ids differ); we warn before saving when there's
 *  something to lose. */
function ChangeRoomDialog({
  target,
  rooms,
  onClose,
  onConfirm,
}: {
  target: { id: string; name: string; roomId: RoomId | null; hasSeating: boolean } | null;
  rooms: Room[];
  onClose: () => void;
  onConfirm: (roomId: RoomId | null) => void;
}) {
  const [selected, setSelected] = useState<string>("");
  useEffect(() => {
    if (target) setSelected(target.roomId ?? "");
  }, [target]);

  const open = target != null;
  const changed = !!target && (selected || null) !== (target.roomId ?? null);

  function handleSave() {
    if (!changed) return;
    onConfirm(selected || null);
    onClose();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5 shadow-xl focus:outline-none">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-semibold">Change room</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-ink-muted">
                {target ? `Choose which room "${target.name}" is taught in.` : ""}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="rounded p-1 text-ink-muted hover:bg-slate-100 hover:text-ink" aria-label="Close">
                <Icon name="x" size={16} />
              </button>
            </Dialog.Close>
          </div>

          <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">No room</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          <p className="mt-2 min-h-[1.25rem] text-xs text-amber-700">
            {target?.hasSeating && changed
              ? "Heads up: changing the room clears this class's current seating (saved arrangements are kept)."
              : " "}
          </p>

          <div className="mt-3 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="btn-secondary">Cancel</button>
            </Dialog.Close>
            <button className="btn-primary" onClick={handleSave} disabled={!changed}>
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
