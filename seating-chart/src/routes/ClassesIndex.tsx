import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useAppStore, findSeating } from "@/store/appStore";
import RoomStage from "@/components/canvas/RoomStage";
import Icon from "@/components/Icon";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
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
    <div className="mx-auto max-w-6xl p-6">
      {rooms.length === 0 && classes.length === 0 && (
        <div className="mb-6 rounded-md border border-ink/15 bg-paper/60 p-4 text-sm text-ink-muted">
          <strong className="text-ink">Welcome.</strong> Start with a <em>room</em> (your desk
          layout) and a <em>class</em> (your students). Add the room to the class and seat them.
        </div>
      )}

      {/* ───────────── Classes (daily use — lead with them) ───────────── */}
      <div className="mb-1 flex flex-wrap items-center gap-3 border-b-2 border-ink/40 pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Classes</h1>
        <button className="btn-secondary" onClick={() => setNewClassOpen(true)}>
          <Icon name="plus" size={14} />
          New class
        </button>
      </div>
      <p className="mb-4 text-sm text-ink-muted">
        Your rosters. A class can hold seating for more than one room.
      </p>

      {classes.length === 0 ? (
        <div className="card p-6 text-center text-ink-muted">No classes yet — add one with “New class”.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => {
            const classRooms = c.seatings
              .map((se) => roomById.get(se.roomId))
              .filter((r): r is Room => !!r);
            return (
              <ClassCard
                key={c.id}
                klass={c}
                classRooms={classRooms}
                onSeat={(roomId) => openSeating(c.id, roomId)}
                onAddRoom={() =>
                  setAddRoomTarget({ classId: c.id, className: c.name, roomIds: c.seatings.map((se) => se.roomId) })
                }
                onRemoveRoom={(roomId, roomName) => handleRemoveRoom(c.id, roomId, roomName)}
                onRename={() => setRenameClassTarget({ id: c.id, name: c.name })}
                onDelete={() => setDeleteClassTarget({ id: c.id, name: c.name })}
              />
            );
          })}
        </div>
      )}

      {/* ───────────── Rooms (reusable layouts — secondary) ───────────── */}
      <div className="mb-1 mt-10 flex flex-wrap items-center gap-3 border-b-2 border-ink/40 pb-2">
        <h2 className="text-xl font-bold tracking-tight text-ink">Rooms</h2>
        <button className="btn-secondary" onClick={() => setAddRoomOpen(true)}>
          <Icon name="plus" size={14} />
          New room
        </button>
      </div>
      <p className="mb-4 text-sm text-ink-muted">
        Reusable layouts. Fix a room once — every class in it updates.
      </p>

      {rooms.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AddTile label="New room" onClick={() => setAddRoomOpen(true)} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
        </div>
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
        description="Name the class (e.g. Period 3 Math). You'll add students and a room next."
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
          if (newId) {
            toast(`Duplicated to “${v}”`);
            navigate(`/rooms/${newId}`);
          }
        }}
      />

      <DeleteRoomDialog
        target={deleteRoomTarget}
        onClose={() => setDeleteRoomTarget(null)}
        onConfirmDelete={() => { if (deleteRoomTarget) { deleteRoom(deleteRoomTarget.id); toast("Room deleted"); } }}
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
        onConfirm={() => { if (deleteClassTarget) { deleteClass(deleteClassTarget.id); toast("Class deleted"); } }}
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

/** Saturated (non-pastel) identity dot per class, picked stably from the id so
 *  cards read apart at a glance on a projector. */
const CLASS_ACCENTS = ["#1D9E75", "#378ADD", "#BA7517", "#D85A30", "#534AB7", "#639922"];
function classAccent(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CLASS_ACCENTS[h % CLASS_ACCENTS.length];
}

/** A class as a two-region card. The TOP region is the roster — the class's
 *  identity: name, count, a printed snippet of student names, one Roster
 *  action. The BOTTOM region is an inset "Rooms" panel with one row per
 *  attached room (each with its own seating thumbnail + Seating action), so
 *  the class→rooms one-to-many is visible in the structure itself. */
function ClassCard({
  klass,
  classRooms,
  onSeat,
  onAddRoom,
  onRemoveRoom,
  onRename,
  onDelete,
}: {
  klass: ClassRoom;
  classRooms: Room[];
  onSeat: (roomId?: string) => void;
  onAddRoom: () => void;
  onRemoveRoom: (roomId: string, name: string) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const accent = classAccent(klass.id);
  const snippet = klass.students.slice(0, 6).map((s) => s.name);
  const overflow = klass.students.length - snippet.length;
  return (
    <div className="card flex flex-col overflow-hidden border-ink/25 shadow-paper">
      {/* ── Roster region ── */}
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: accent }} aria-hidden />
            <span className="truncate text-base font-bold uppercase tracking-wide">{klass.name}</span>
          </div>
          <ClassMenu onRename={onRename} onDelete={onDelete} />
        </div>
        <div className="text-sm font-semibold">{pluralise(klass.students.length, "student")}</div>
        {snippet.length > 0 ? (
          <p className="text-xs leading-relaxed text-ink-muted">
            {snippet.join(" · ")}
            {overflow > 0 && ` · +${overflow} more`}
          </p>
        ) : (
          <p className="text-xs text-ink-muted">No students yet — open the roster to add them.</p>
        )}
        <Link to={`/classes/${klass.id}/roster`} className="btn-secondary mt-1 justify-center">
          <Icon name="edit" size={14} />
          Roster
        </Link>
      </div>

      {/* ── Rooms sub-panel: seating lives per room ── */}
      <div className="mt-auto border-t border-ink/15 bg-ink/5 p-3">
        <div className="label mb-2">Rooms</div>
        <div className="space-y-2">
          {classRooms.map((r) => (
            <ClassRoomRow
              key={r.id}
              room={r}
              klass={klass}
              onSeat={() => onSeat(r.id)}
              onRemove={() => onRemoveRoom(r.id, r.name)}
            />
          ))}
          <button
            type="button"
            onClick={onAddRoom}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-ink/25 px-2 py-1.5 text-xs text-ink-muted transition hover:border-ink/45 hover:bg-ink/5 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40"
          >
            <Icon name="plus" size={12} />
            {classRooms.length === 0 ? "Add a room to seat this class" : "Add room"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One attached room inside a class card: that room's own seating thumbnail,
 *  its name, a Seating action, and a quiet detach. */
function ClassRoomRow({
  room,
  klass,
  onSeat,
  onRemove,
}: {
  room: Room;
  klass: ClassRoom;
  onSeat: () => void;
  onRemove: () => void;
}) {
  const seating = klass.seatings.find((se) => se.roomId === room.id);
  return (
    <div className="flex items-center gap-2 rounded border border-ink/15 bg-paper p-1.5">
      <button
        type="button"
        onClick={onSeat}
        aria-label={`Open seating for ${room.name}`}
        className="relative h-14 w-24 shrink-0 overflow-hidden rounded-sm border border-ink/15 bg-wood/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/50"
      >
        {room.desks.length > 0 && (
          <span className="pointer-events-none absolute inset-0 flex">
            <RoomStage
              interactive={false}
              room={room}
              students={klass.students}
              assignments={seating?.currentAssignments ?? {}}
              roomId={room.id}
              nameDisplay={klass.nameDisplay}
              showFurniture={false}
              showFrontWallLabel={false}
              showFrontRowMarkers={false}
              showEmptySeatDots={false}
              fitToDesks
              framePadding={4}
            />
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1 truncate text-sm font-medium">{room.name}</div>
      <button type="button" className="btn-secondary" onClick={onSeat}>
        Seating
      </button>
      <button
        type="button"
        onClick={onRemove}
        title={`Remove ${room.name} from this class`}
        className="rounded p-1 text-ink-muted hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40"
      >
        <Icon name="x" size={12} />
      </button>
    </div>
  );
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
    <div className="card flex flex-col overflow-hidden border-ink/25 shadow-paper">
      <div className="relative aspect-[3/2] border-b border-ink/15 bg-wood/40">
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
        <div className="flex shrink-0 items-center gap-1">
          <Link to={`/rooms/${room.id}`} className="btn-secondary">
            <Icon name="edit" size={13} />
            Edit layout
          </Link>
          <RoomMenu onRename={onRename} onDuplicate={onDuplicate} onDelete={onDelete} />
        </div>
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
      <DropdownMenu.Separator className="my-1 h-px bg-ink/15" />
      <MenuItem onSelect={onDelete} icon="trash" label="Delete" danger />
    </Menu>
  );
}

function ClassMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  return (
    <Menu>
      <MenuItem onSelect={onRename} icon="edit" label="Rename" />
      <DropdownMenu.Separator className="my-1 h-px bg-ink/15" />
      <MenuItem onSelect={onDelete} icon="trash" label="Delete" danger />
    </Menu>
  );
}

function Menu({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="rounded-md border border-ink/30 bg-paper p-2 text-ink hover:bg-ink/5"
          title="More actions"
        >
          <Icon name="more-horizontal" size={16} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-48 rounded-md border border-ink/15 bg-paper p-1 text-sm shadow-lift"
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
        "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-ink/10",
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded bg-paper p-5 shadow-lift focus:outline-none">
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
              <button className="rounded p-1 text-ink-muted hover:bg-ink/10 hover:text-ink" aria-label="Close">
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded bg-paper p-5 shadow-lift focus:outline-none">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-semibold">Add a room</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-ink-muted">
                {target ? `Pick a room for "${target.className}", or create a new one. Each room keeps its own seating.` : ""}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="rounded p-1 text-ink-muted hover:bg-ink/10 hover:text-ink" aria-label="Close">
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
