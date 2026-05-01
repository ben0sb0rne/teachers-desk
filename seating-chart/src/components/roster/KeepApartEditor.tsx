import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import type { Student } from "@/types";
import { useAppStore } from "@/store/appStore";
import Icon from "@/components/Icon";

interface Props {
  classId: string;
  student: Student;
  students: Student[];
}

export default function KeepApartEditor({ classId, student, students }: Props) {
  const toggleKeepApart = useAppStore((s) => s.toggleKeepApart);
  const [filter, setFilter] = useState("");

  const others = students.filter((s) => s.id !== student.id);
  const filtered = others.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()));
  const count = student.keepApart.length;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium hover:bg-slate-50"
          title={
            count === 0
              ? "Pick students to keep apart from"
              : `Kept apart from ${count} student${count === 1 ? "" : "s"}`
          }
        >
          <Icon name="edit" size={12} />
          <span>Edit</span>
          {count > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-blue px-1 text-[10px] font-semibold text-white">
              {count}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className="z-50 w-72 rounded-md border border-slate-200 bg-white p-2 shadow-lg"
        >
          <div className="mb-2 px-1 text-xs font-semibold text-ink">
            Keep <span className="text-accent-blue">{student.name}</span> apart from…
          </div>
          <input
            className="input mb-2"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoFocus
          />
          <div className="max-h-64 overflow-auto">
            {filtered.length === 0 ? (
              <div className="p-2 text-xs text-ink-muted">No matches.</div>
            ) : (
              filtered.map((s) => {
                const checked = student.keepApart.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleKeepApart(classId, student.id, s.id)}
                    />
                    <span className="text-sm">{s.name}</span>
                  </label>
                );
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
