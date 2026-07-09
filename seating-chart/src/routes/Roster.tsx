import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import * as Popover from "@radix-ui/react-popover";
import { useAppStore } from "@/store/appStore";
import PasteNamesDialog from "@/components/roster/PasteNamesDialog";
import KeepApartEditor from "@/components/roster/KeepApartEditor";
import ConfirmDialog from "@/components/ConfirmDialog";
import Icon from "@/components/Icon";

export default function Roster() {
  const { id } = useParams();
  const klass = useAppStore((s) => (id ? s.classes.find((c) => c.id === id) : undefined));
  const updateStudent = useAppStore((s) => s.updateStudent);
  const removeStudent = useAppStore((s) => s.removeStudent);
  const addStudents = useAppStore((s) => s.addStudents);
  const setAutoOrder = useAppStore((s) => s.setAutoOrder);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newNumber, setNewNumber] = useState("");
  /** When set, the remove-student confirmation is open for this student. */
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null);

  const filtered = useMemo(() => {
    if (!klass) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return klass.students;
    return klass.students.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.studentNumber ?? "").toLowerCase().includes(q),
    );
  }, [klass, filter]);

  if (!klass) return <div className="p-6 text-ink-muted">Class not found.</div>;

  const canAdd = newFirst.trim().length > 0 || newLast.trim().length > 0;

  function handleAddSingle() {
    if (!canAdd || !klass) return;
    addStudents(klass.id, [{ firstName: newFirst, lastName: newLast, studentNumber: newNumber }]);
    setNewFirst("");
    setNewLast("");
    setNewNumber("");
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Roster · {klass.name}</h1>
          <p className="text-sm text-ink-muted">
            {klass.students.length} students
            {filter && filtered.length !== klass.students.length && (
              <> · {filtered.length} match "{filter}"</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Icon
              name="search"
              size={14}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <input
              className="input pl-7"
              placeholder="Search students…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <label
            className="flex cursor-pointer select-none items-center gap-1.5 whitespace-nowrap text-sm text-ink"
            title="Keep the roster sorted by last name and number students 1–N automatically. Manual numbers are overwritten while this is on."
          >
            <input
              type="checkbox"
              checked={!!klass.autoOrder}
              onChange={(e) => setAutoOrder(klass.id, e.target.checked)}
            />
            A–Z + auto-number
          </label>
          <button className="btn-secondary" onClick={() => setPasteOpen(true)}>Paste names</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[17%]" />
            <col className="w-[17%]" />
            <col className="w-[8%]" />
            <col className="w-[11%]" />
            <col className="w-[21%]" />
            <col className="w-[10%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead className="border-b border-ink/15 text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-3 py-2">First</th>
              <th className="px-3 py-2">Last</th>
              <th className="px-3 py-2" title="Student number (optional, manual)">#</th>
              <th className="px-3 py-2">Front row</th>
              <th className="px-3 py-2">Keep apart</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {klass.students.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">
                  No students yet — add one below or paste a list.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">
                  No matches for "{filter}".
                </td>
              </tr>
            ) : (
              filtered.map((st) => (
                <tr key={st.id} className="border-b border-ink/10 last:border-0">
                  <td className="px-3 py-2">
                    <input
                      className="input"
                      value={st.firstName ?? ""}
                      placeholder="First"
                      onChange={(e) => updateStudent(klass.id, st.id, { firstName: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input"
                      value={st.lastName ?? ""}
                      placeholder="Last"
                      onChange={(e) => updateStudent(klass.id, st.id, { lastName: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input disabled:opacity-60"
                      value={st.studentNumber ?? ""}
                      placeholder="—"
                      disabled={!!klass.autoOrder}
                      title={klass.autoOrder ? "Numbers are automatic while A–Z + auto-number is on" : undefined}
                      onChange={(e) =>
                        updateStudent(klass.id, st.id, { studentNumber: e.target.value || undefined })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={st.needsFrontRow}
                        onChange={(e) =>
                          updateStudent(klass.id, st.id, { needsFrontRow: e.target.checked })
                        }
                      />
                    </label>
                  </td>
                  <td className="px-3 py-2">
                    <KeepApartEditor classId={klass.id} student={st} students={klass.students} />
                  </td>
                  <td className="px-3 py-2">
                    <NotesEditor
                      studentName={st.name}
                      notes={st.notes ?? ""}
                      onChange={(notes) => updateStudent(klass.id, st.id, { notes })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="btn-secondary"
                      onClick={() => setPendingRemove({ id: st.id, name: st.name })}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="border-t border-ink/15 bg-ink/5">
            <tr>
              <td className="px-3 py-2">
                <input
                  className="input"
                  placeholder="First"
                  value={newFirst}
                  onChange={(e) => setNewFirst(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddSingle()}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  className="input"
                  placeholder="Last"
                  value={newLast}
                  onChange={(e) => setNewLast(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddSingle()}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  className="input"
                  placeholder="#"
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddSingle()}
                />
              </td>
              <td className="px-3 py-2" colSpan={3}>
                <span className="text-xs text-ink-muted">Add a single student, or use “Paste names”.</span>
              </td>
              <td className="px-3 py-2 text-right">
                <button className="btn-secondary" onClick={handleAddSingle} disabled={!canAdd}>
                  <Icon name="plus" size={14} />
                  Add
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <PasteNamesDialog open={pasteOpen} onOpenChange={setPasteOpen} classId={klass.id} />

      <ConfirmDialog
        open={pendingRemove != null}
        onOpenChange={(open) => { if (!open) setPendingRemove(null); }}
        title={pendingRemove ? `Remove ${pendingRemove.name}?` : ""}
        description="This drops the student from the roster. Their assignments in saved arrangements stay intact."
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (pendingRemove) removeStudent(klass.id, pendingRemove.id);
        }}
      />
    </div>
  );
}

function NotesEditor({
  studentName,
  notes,
  onChange,
}: {
  studentName: string;
  notes: string;
  onChange: (notes: string) => void;
}) {
  const hasNotes = notes.trim().length > 0;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className={
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium " +
            (hasNotes
              ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
              : "border-ink/30 bg-paper text-ink-muted hover:bg-ink/5")
          }
          title={hasNotes ? `Notes for ${studentName}` : "Add a note"}
        >
          <Icon name="sticky-note" size={12} />
          {hasNotes ? <span className="h-1.5 w-1.5 rounded-full bg-accent-blue" aria-label="has notes" /> : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className="z-50 w-72 rounded-md border border-ink/15 bg-paper p-3 shadow-lift"
        >
          <div className="mb-2 text-xs font-semibold text-ink">
            Notes — <span className="text-accent-blue">{studentName}</span>
          </div>
          <textarea
            className="input h-32 resize-none text-sm"
            placeholder="Anything worth remembering — accommodations, allergies, group preferences…"
            value={notes}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
          />
          <p className="mt-2 text-[10px] text-ink-muted">
            Notes stay with this student; they're saved with the class.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
