import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import * as Popover from "@radix-ui/react-popover";
import { useAppStore } from "@/store/appStore";
import PasteNamesDialog from "@/components/roster/PasteNamesDialog";
import KeepApartEditor from "@/components/roster/KeepApartEditor";
import Icon from "@/components/Icon";

export default function Roster() {
  const { id } = useParams();
  const klass = useAppStore((s) => (id ? s.classes.find((c) => c.id === id) : undefined));
  const updateStudent = useAppStore((s) => s.updateStudent);
  const removeStudent = useAppStore((s) => s.removeStudent);
  const addStudents = useAppStore((s) => s.addStudents);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [newStudentName, setNewStudentName] = useState("");

  const filtered = useMemo(() => {
    if (!klass) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return klass.students;
    return klass.students.filter((s) => s.name.toLowerCase().includes(q));
  }, [klass, filter]);

  if (!klass) return <div className="p-6 text-ink-muted">Class not found.</div>;

  function handleAddSingle() {
    const name = newStudentName.trim();
    if (!name || !klass) return;
    addStudents(klass.id, [name]);
    setNewStudentName("");
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Roster · {klass.name}</h1>
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
          <button className="btn-secondary" onClick={() => setPasteOpen(true)}>Paste names</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[40%]" />
            <col className="w-[14%]" />
            <col className="w-[24%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Front row</th>
              <th className="px-4 py-2">Keep apart</th>
              <th className="px-4 py-2">Notes</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {klass.students.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">
                  No students yet — add one below or paste a list.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">
                  No matches for "{filter}".
                </td>
              </tr>
            ) : (
              filtered.map((st) => (
                <tr key={st.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2">
                    <input
                      className="input"
                      value={st.name}
                      onChange={(e) => updateStudent(klass.id, st.id, { name: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2">
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
                  <td className="px-4 py-2">
                    <KeepApartEditor classId={klass.id} student={st} students={klass.students} />
                  </td>
                  <td className="px-4 py-2">
                    <NotesEditor
                      classId={klass.id}
                      studentId={st.id}
                      studentName={st.name}
                      notes={st.notes ?? ""}
                      onChange={(notes) => updateStudent(klass.id, st.id, { notes })}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        if (confirm(`Remove ${st.name}?`)) removeStudent(klass.id, st.id);
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50/50">
            <tr>
              <td className="px-4 py-2" colSpan={4}>
                <div className="flex items-center gap-2">
                  <input
                    className="input"
                    placeholder="Add a single student…"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddSingle()}
                  />
                </div>
              </td>
              <td className="px-4 py-2 text-right">
                <button
                  className="btn-secondary"
                  onClick={handleAddSingle}
                  disabled={!newStudentName.trim()}
                >
                  <Icon name="plus" size={14} />
                  Add
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <PasteNamesDialog open={pasteOpen} onOpenChange={setPasteOpen} classId={klass.id} />
    </div>
  );
}

function NotesEditor({
  studentName,
  notes,
  onChange,
}: {
  classId: string;
  studentId: string;
  studentName: string;
  notes: string;
  onChange: (notes: string) => void;
}) {
  const hasNotes = notes.trim().length > 0;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium hover:bg-slate-50"
          title={hasNotes ? `Notes for ${studentName}` : "Add a note"}
        >
          <Icon name="sticky-note" size={12} />
          {hasNotes ? <span className="h-1.5 w-1.5 rounded-full bg-accent-blue" aria-label="has notes" /> : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className="z-50 w-72 rounded-md border border-slate-200 bg-white p-3 shadow-lg"
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
