import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useAppStore } from "@/store/appStore";
import RoomStage from "@/components/canvas/RoomStage";
import Icon from "@/components/Icon";
import { cn } from "@/lib/cn";
import TextInputDialog from "@/components/TextInputDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { Room, RoomId } from "@/types";

/** A blocking class for a delete: enough to open ChangeRoomDialog for it. */
interface BlockingClass {
  id: string;
  name: string;
  hasSeating: boolean;
}

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

  // ── Add-a-class row ──
  const [newClassName, setNewClassName] = useState("");
  const [newClassRoomId, setNewClassRoomId] = useState<string>(""); // "" = a fresh blank room
  const [newClassError, setNewClassError] = useState<string | null>(null);

  // ── Dialog targets ──
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const [renameRoomTarget, setRenameRoomTarget] = useState<{ id: string; name: string } | null>(null);
  const [duplicateRoomTarget, setDuplicateRoomTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteRoomTarget, setDeleteRoomTarget] = useState<{ id: string; name: string; blockedBy: BlockingClass[] } | null>(null);
  const [renameClassTarget, setRenameClassTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteClassTarget, setDeleteClassTarget] = useState<{ id: string; name: string } | null>(null);
  const [changeRoomTarget, setChangeRoomTarget] = useState<
    { id: string; name: string; roomId: RoomId | null; hasSeating: boolean } | null
  >(null);

  /** room id → names of the classes taught in it. */
  const classNamesByRoom = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of classes) {
      if (!c.roomId) continue;
      const list = m.get(c.roomId) ?? [];
      list.push(c.name);
      m.set(c.roomId, list);
    }
    return m;
  }, [classes]);

  const roomNameFor = (roomId: RoomId | null): string | null =>
    roomId ? rooms.find((r) => r.id === roomId)?.name ?? null : null;

  function handleCreateRoom(name: string) {
    const id = createRoom(name);
    if (id) navigate(`/rooms/${id}`);
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

  function openDeleteRoom(room: Room) {
    const blockedBy: BlockingClass[] = classes
      .filter((c) => c.roomId === room.id)
      .map((c) => ({ id: c.id, name: c.name, hasSeating: Object.keys(c.currentAssignments ?? {}).length > 0 }));
    setDeleteRoomTarget({ id: room.id, name: room.name, blockedBy });
  }

  function openChangeRoom(c: { id: string; name: string; roomId: RoomId | null; currentAssignments?: Record<string, string> }) {
    setChangeRoomTarget({
      id: c.id,
      name: c.name,
      roomId: c.roomId,
      hasSeating: Object.keys(c.currentAssignments ?? {}).length > 0,
    });
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* ───────────── Rooms ───────────── */}
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-ink">Rooms</h1>
      <p className="mb-4 text-sm text-ink-muted">
        Reusable desk layouts. Point several classes at one room — editing it updates them all.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((r) => (
          <RoomTile
            key={r.id}
            room={r}
            usedBy={classNamesByRoom.get(r.id) ?? []}
            onRename={() => setRenameRoomTarget({ id: r.id, name: r.name })}
            onDuplicate={() => setDuplicateRoomTarget({ id: r.id, name: r.name })}
            onDelete={() => openDeleteRoom(r)}
          />
        ))}
        <AddTile label="New room" onClick={() => setAddRoomOpen(true)} />
      </div>

      {/* ───────────── Classes ───────────── */}
      <h1 className="mb-1 mt-10 text-2xl font-bold tracking-tight text-ink">Classes</h1>
      <p className="mb-3 text-sm text-ink-muted">
        Each class has its own roster and seating. Give it a room to seat students in.
      </p>

      <div className="mb-1 flex flex-wrap items-center gap-2">
        <input
          className="input min-w-[12rem] flex-1"
          placeholder="Add a class — e.g. Period 3 Math"
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
          Add class
        </button>
      </div>
      {newClassError && <p className="mb-2 text-xs text-red-600">{newClassError}</p>}

      {classes.length === 0 ? (
        <div className="card mt-3 p-6 text-center text-ink-muted">No classes yet — add one above.</div>
      ) : (
        <ul className="mt-3 space-y-2">
          {classes.map((c) => {
            const rn = roomNameFor(c.roomId);
            return (
              <li key={c.id} className="card flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-medium">{c.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                    <span>{pluralise(c.students.length, "student")}</span>
                    <span aria-hidden>·</span>
                    <RoomChip name={rn} onClick={() => openChangeRoom(c)} />
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
                    onChangeRoom={() => openChangeRoom(c)}
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
        open={addRoomOpen}
        onOpenChange={setAddRoomOpen}
        title="New room"
        description="Name this room layout (e.g. your room number). You'll lay out desks next."
        placeholder="e.g. Room 214"
        submitLabel="Create room"
        validate={(v) =>
          rooms.some((r) => r.name.trim().toLowerCase() === v.toLowerCase())
            ? "A room with that name already exists."
            : null
        }
        onSubmit={handleCreateRoom}
      />

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

      <DeleteRoomDialog
        target={deleteRoomTarget}
        onClose={() => setDeleteRoomTarget(null)}
        onConfirmDelete={() => { if (deleteRoomTarget) deleteRoom(deleteRoomTarget.id); }}
        onChangeRoomFor={(cls) => {
          const room = deleteRoomTarget;
          setDeleteRoomTarget(null);
          if (room) setChangeRoomTarget({ id: cls.id, name: cls.name, roomId: room.id, hasSeating: cls.hasSeating });
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

function usedByLabel(names: string[]): string {
  if (names.length === 0) return "Not used by any class yet";
  if (names.length <= 2) return `Used by ${names.join(", ")}`;
  return `Used by ${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

/** A room as a tile: live read-only layout thumbnail (click → editor), name,
 *  which classes use it, and a ⋯ menu. */
function RoomTile({
  room,
  usedBy,
  onRename,
  onDuplicate,
  onDelete,
}: {
  room: Room;
  usedBy: string[];
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="relative aspect-[4/3] bg-slate-100">
        {room.desks.length > 0 ? (
          <RoomStage
            interactive={false}
            room={room}
            students={[]}
            assignments={{}}
            roomId={room.id}
            showFrontWallLabel={false}
            showFrontRowMarkers={false}
            showEmptySeatDots={false}
            fitContents
          />
        ) : (
          <div className="grid h-full place-items-center px-3 text-center text-xs text-ink-muted">
            No desks yet — click to lay them out
          </div>
        )}
        {/* Click overlay → room editor. Sits above the (non-interactive) canvas. */}
        <Link
          to={`/rooms/${room.id}`}
          aria-label={`Edit ${room.name} layout`}
          className="absolute inset-0 rounded-t-md ring-inset ring-accent-blue/0 transition hover:ring-2 hover:ring-accent-blue/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/50"
        />
      </div>
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{room.name}</div>
          <div className="truncate text-xs text-ink-muted">{usedByLabel(usedBy)}</div>
        </div>
        <RoomMenu onRename={onRename} onDuplicate={onDuplicate} onDelete={onDelete} />
      </div>
    </div>
  );
}

/** Dashed "add" cell that matches the room tiles' height in its grid row. */
function AddTile({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[12rem] w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-ink/20 text-ink-muted transition hover:border-ink/40 hover:bg-ink/5 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40"
    >
      <Icon name="plus" size={26} />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

/** The room a class is in, as a clickable pill that opens the room switcher. */
function RoomChip({ name, onClick }: { name: string | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Change room"
      className={cn(
        "inline-flex max-w-[16rem] items-center gap-1 rounded border px-1.5 py-0.5 text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40",
        name
          ? "border-ink/20 text-ink hover:bg-ink/5"
          : "border-amber-300 text-amber-700 hover:bg-amber-50",
      )}
    >
      <Icon name="grid" size={11} />
      <span className="truncate">{name ?? "Assign a room"}</span>
      <Icon name="chevron-down" size={11} />
    </button>
  );
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

/** Delete a room. Keeps the in-use guard: if classes still use it, the dialog
 *  lists them with a "Change room" action (repoint, then delete) rather than a
 *  dead end. */
function DeleteRoomDialog({
  target,
  onClose,
  onConfirmDelete,
  onChangeRoomFor,
}: {
  target: { id: string; name: string; blockedBy: BlockingClass[] } | null;
  onClose: () => void;
  onConfirmDelete: () => void;
  onChangeRoomFor: (cls: BlockingClass) => void;
}) {
  const open = target != null;
  const blocked = !!target && target.blockedBy.length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5 shadow-xl focus:outline-none">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-semibold">
                {blocked ? `Reassign before deleting "${target?.name}"` : `Delete "${target?.name}"?`}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-ink-muted">
                {blocked
                  ? "This room is still in use. Move each class to another room, then delete it."
                  : "This removes the room layout. Classes aren't affected. This can't be undone."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="rounded p-1 text-ink-muted hover:bg-slate-100 hover:text-ink" aria-label="Close">
                <Icon name="x" size={16} />
              </button>
            </Dialog.Close>
          </div>

          {blocked && (
            <ul className="mb-1 space-y-1.5">
              {target!.blockedBy.map((cls) => (
                <li
                  key={cls.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-ink/15 px-2.5 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate font-medium">{cls.name}</span>
                  <button
                    className="btn-secondary shrink-0 px-2 py-1 text-xs"
                    onClick={() => onChangeRoomFor(cls)}
                  >
                    Change room
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="btn-secondary">{blocked ? "Done" : "Cancel"}</button>
            </Dialog.Close>
            {!blocked && (
              <button
                className="btn-danger"
                onClick={() => { onConfirmDelete(); onClose(); }}
              >
                Delete room
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
