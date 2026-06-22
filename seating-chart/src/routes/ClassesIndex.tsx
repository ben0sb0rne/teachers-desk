import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useAppStore, findSeating } from "@/store/appStore";
import RoomStage from "@/components/canvas/RoomStage";
import Icon from "@/components/Icon";
import { cn } from "@/lib/cn";
import TextInputDialog from "@/components/TextInputDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { ClassRoom, Room } from "@/types";

export default function ClassesIndex() {
  const navigate = useNavigate();
  const rooms = useAppStore((s) => s.rooms);
  const classes = useAppStore((s) => s.classes);
  const createClass = useAppStore((s) => s.createClass);
  const renameClass = useAppStore((s) => s.renameClass);
  const deleteClass = useAppStore((s) => s.deleteClass);
  const addClassRoom = useAppStore((s) => s.addClassRoom);
  const removeClassRoom = useAppStore((s) => s.removeClassRoom);
  const createRoom = useAppStore((s) => s.createRoom);
  const renameRoom = useAppStore((s) => s.renameRoom);
  const duplicateRoom = useAppStore((s) => s.duplicateRoom);
  const deleteRoom = useAppStore((s) => s.deleteRoom);

  // ── Dialog targets ──
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const [newClassOpen, setNewClassOpen] = useState(false);
  const [renameRoomTarget, setRenameRoomTarget] = useState<{ id: string; name: string } | null>(null);
  const [duplicateRoomTarget, setDuplicateRoomTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteRoomTarget, setDeleteRoomTarget] = useState<{ id: string; name: string; usedBy: ClassRoom[] } | null>(null);
  const [renameClassTarget, setRenameClassTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteClassTarget, setDeleteClassTarget] = useState<{ id: string; name: string } | null>(null);
  const [addRoomTarget, setAddRoomTarget] = useState<{ classId: string; className: string; roomIds: string[] } | null>(null);
  const [removeRoomConfirm, setRemoveRoomConfirm] = useState<{ classId: string; roomId: string; roomName: string } | null>(null);

  /** room id → names of the classes taught in it. */
  const classNamesByRoom = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of classes) {
      for (const se of c.seatings) {
        const list = m.get(se.roomId) ?? [];
        list.push(c.name);
        m.set(se.roomId, list);
      }
    }
    return m;
  }, [classes]);

  const roomById = useMemo(() => {
    const m = new Map<string, Room>();
    for (const r of rooms) m.set(r.id, r);
    return m;
  }, [rooms]);

  function uniqueRoomName(base: string): string {
    const taken = new Set(rooms.map((r) => r.name.trim().toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; n < 999; n++) {
      const candidate = `${base} (${n})`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return base;
  }

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

  function handleNewRoom(name: string) {
    const id = createRoom(name);
    if (id) navigate(`/rooms/${id}`);
  }

  function handleNewClass(name: string) {
    const id = createClass(name);
    if (id) navigate(`/classes/${id}/roster`);
  }

  function openSeating(classId: string, roomId?: string) {
    navigate(roomId ? `/classes/${classId}/room?room=${roomId}` : `/classes/${classId}/room`);
  }

  function handleRemoveRoom(classId: string, roomId: string, roomName: string) {
    const c = classes.find((x) => x.id === classId);
    const se = c ? findSeating(c, roomId) : undefined;
    if (se && Object.keys(se.currentAssignments).length > 0) {
      setRemoveRoomConfirm({ classId, roomId, roomName });
    } else {
      removeClassRoom(classId, roomId);
    }
  }

  /** Create a fresh room and attach it to a class, then open it to lay out. */
  function createRoomForClass(classId: string, className: string) {
    const id = createRoom(uniqueRoomName(`${className} — room`));
    if (id) {
      addClassRoom(classId, id);
      setAddRoomTarget(null);
      navigate(`/rooms/${id}`);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* ───────────── Rooms ───────────── */}
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-ink">Rooms</h1>
      <p className="mb-4 text-sm text-ink-muted">
        Reusable desk layouts. Point several classes at one room — editing it updates them all.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {rooms.map((r) => (
          <RoomTile
            key={r.id}
            room={r}
            usedBy={classNamesByRoom.get(r.id) ?? []}
            onRename={() => setRenameRoomTarget({ id: r.id, name: r.name })}
            onDuplicate={() => setDuplicateRoomTarget({ id: r.id, name: r.name })}
            onDelete={() =>
              setDeleteRoomTarget({
                id: r.id,
                name: r.name,
                usedBy: classes.filter((c) => c.seatings.some((se) => se.roomId === r.id)),
              })
            }
          />
        ))}
        <AddTile label="New room" onClick={() => setAddRoomOpen(true)} />
      </div>

      {/* ───────────── Classes ───────────── */}
      <div className="mb-1 mt-10 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Classes</h1>
        <button className="btn-secondary" onClick={() => setNewClassOpen(true)}>
          <Icon name="plus" size={14} />
          New class
        </button>
      </div>
      <p className="mb-3 text-sm text-ink-muted">
        Each class has its own roster and seating. Attach one or more rooms to seat students in.
      </p>

      {classes.length === 0 ? (
        <div className="card p-6 text-center text-ink-muted">No classes yet — add one with “New class”.</div>
      ) : (
        <ul className="space-y-2">
          {classes.map((c) => {
            const classRooms = c.seatings
              .map((se) => roomById.get(se.roomId))
              .filter((r): r is Room => !!r);
            return (
              <li key={c.id} className="card flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-medium">{c.name}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-ink-muted">{pluralise(c.students.length, "student")}</span>
                    <span className="text-ink-muted" aria-hidden>·</span>
                    {classRooms.map((r) => (
                      <RoomChip
                        key={r.id}
                        name={r.name}
                        onOpen={() => openSeating(c.id, r.id)}
                        onRemove={() => handleRemoveRoom(c.id, r.id, r.name)}
                      />
                    ))}
                    <AddRoomChip
                      label={classRooms.length === 0 ? "Assign a room" : "Add room"}
                      onClick={() =>
                        setAddRoomTarget({ classId: c.id, className: c.name, roomIds: c.seatings.map((se) => se.roomId) })
                      }
                    />
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
        onSubmit={handleNewRoom}
      />

      <TextInputDialog
        open={newClassOpen}
        onOpenChange={setNewClassOpen}
        title="New class"
        description="Name the class (e.g. Period 3 Math). You'll add students and attach a room next."
        placeholder="e.g. Period 3 Math"
        submitLabel="Create class"
        validate={(v) =>
          classes.some((c) => c.name.trim().toLowerCase() === v.toLowerCase())
            ? "A class with that name already exists."
            : null
        }
        onSubmit={handleNewClass}
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
        onRemoveFromClass={(classId) => { if (deleteRoomTarget) removeClassRoom(classId, deleteRoomTarget.id); }}
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
        description="This deletes the class along with its roster and all of its seating. Room layouts are not affected. This cannot be undone."
        confirmLabel="Delete class"
        danger
        onConfirm={() => { if (deleteClassTarget) deleteClass(deleteClassTarget.id); }}
      />

      <ConfirmDialog
        open={removeRoomConfirm != null}
        onOpenChange={(o) => { if (!o) setRemoveRoomConfirm(null); }}
        title={removeRoomConfirm ? `Remove "${removeRoomConfirm.roomName}" from this class?` : ""}
        description="The class's seating in this room will be cleared (saved arrangements for it are removed). The room layout itself stays."
        confirmLabel="Remove room"
        danger
        onConfirm={() => { if (removeRoomConfirm) removeClassRoom(removeRoomConfirm.classId, removeRoomConfirm.roomId); }}
      />

      <AddRoomToClassDialog
        target={addRoomTarget}
        rooms={rooms}
        onClose={() => setAddRoomTarget(null)}
        onAddExisting={(roomId) => { if (addRoomTarget) { addClassRoom(addRoomTarget.classId, roomId); setAddRoomTarget(null); } }}
        onCreateNew={() => { if (addRoomTarget) createRoomForClass(addRoomTarget.classId, addRoomTarget.className); }}
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
      <div className="relative aspect-[3/2] bg-slate-100">
        {room.desks.length > 0 ? (
          <div className="absolute inset-0 flex">
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
              framePadding={10}
            />
          </div>
        ) : (
          <div className="grid h-full place-items-center px-3 text-center text-xs text-ink-muted">
            No desks yet — click to lay them out
          </div>
        )}
        {/* Click overlay → room editor, above the (non-interactive) canvas. */}
        <Link
          to={`/rooms/${room.id}`}
          aria-label={`Edit ${room.name} layout`}
          className="absolute inset-0 ring-inset ring-accent-blue/0 transition hover:ring-2 hover:ring-accent-blue/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/50"
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

/** A room a class is taught in: click the label to seat that room, × to detach. */
function RoomChip({ name, onOpen, onRemove }: { name: string; onOpen: () => void; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center rounded border border-ink/20 text-ink">
      <button
        type="button"
        onClick={onOpen}
        title={`Seat ${name}`}
        className="inline-flex max-w-[14rem] items-center gap-1 rounded-l px-1.5 py-0.5 hover:bg-ink/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40"
      >
        <Icon name="grid" size={11} />
        <span className="truncate">{name}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        title={`Remove ${name} from this class`}
        className="border-l border-ink/15 px-1 py-0.5 text-ink-muted hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40"
      >
        <Icon name="x" size={11} />
      </button>
    </span>
  );
}

function AddRoomChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded border border-dashed px-1.5 py-0.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40",
        "border-amber-300 text-amber-700 hover:bg-amber-50",
      )}
    >
      <Icon name="plus" size={11} />
      <span>{label}</span>
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

function ClassMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  return (
    <Menu>
      <MenuItem onSelect={onRename} icon="edit" label="Rename" />
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
 *  lists them with a "Remove" action (detach, then delete) rather than a dead end. */
function DeleteRoomDialog({
  target,
  onClose,
  onConfirmDelete,
  onRemoveFromClass,
}: {
  target: { id: string; name: string; usedBy: ClassRoom[] } | null;
  onClose: () => void;
  onConfirmDelete: () => void;
  onRemoveFromClass: (classId: string) => void;
}) {
  const open = target != null;
  const blocked = !!target && target.usedBy.length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5 shadow-xl focus:outline-none">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-semibold">
                {blocked ? `Detach before deleting "${target?.name}"` : `Delete "${target?.name}"?`}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-ink-muted">
                {blocked
                  ? "This room is still used by these classes. Remove it from each, then delete it."
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
              {target!.usedBy.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-ink/15 px-2.5 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate font-medium">{c.name}</span>
                  <button className="btn-secondary shrink-0 px-2 py-1 text-xs" onClick={() => onRemoveFromClass(c.id)}>
                    Remove
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
              <button className="btn-danger" onClick={() => { onConfirmDelete(); onClose(); }}>
                Delete room
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Attach a room to a class — pick an existing room (not already attached) or
 *  create a fresh one to lay out. */
function AddRoomToClassDialog({
  target,
  rooms,
  onClose,
  onAddExisting,
  onCreateNew,
}: {
  target: { classId: string; className: string; roomIds: string[] } | null;
  rooms: Room[];
  onClose: () => void;
  onAddExisting: (roomId: string) => void;
  onCreateNew: () => void;
}) {
  const open = target != null;
  const available = target ? rooms.filter((r) => !target.roomIds.includes(r.id)) : [];

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5 shadow-xl focus:outline-none">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-semibold">Add a room</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-ink-muted">
                {target ? `Pick a room for "${target.className}", or create a new one. Each room keeps its own seating.` : ""}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="rounded p-1 text-ink-muted hover:bg-slate-100 hover:text-ink" aria-label="Close">
                <Icon name="x" size={16} />
              </button>
            </Dialog.Close>
          </div>

          {available.length > 0 && (
            <ul className="mb-3 max-h-56 space-y-1 overflow-auto">
              {available.map((r) => (
                <li key={r.id}>
                  <button
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-ink/15 px-2.5 py-1.5 text-sm hover:bg-ink/5"
                    onClick={() => onAddExisting(r.id)}
                  >
                    <span className="min-w-0 truncate font-medium">{r.name}</span>
                    <span className="shrink-0 text-xs text-ink-muted">{pluralise(r.desks.length, "desk")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button className="btn-primary w-full justify-center" onClick={onCreateNew}>
            <Icon name="plus" size={14} />
            Create a new room
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
