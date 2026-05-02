// Type declarations for the suite-wide shared storage module.
// The runtime lives at /shared/storage.js (vanilla ES module, no TS source).
// This declaration lets TypeScript files in seating-chart consume it via the
// `@shared/storage.js` path alias defined in tsconfig.json + vite.config.ts.

declare module "@shared/storage.js" {
  export class StorageQuotaError extends Error {}
  export class ImportFormatError extends Error {}
  export class RosterDuplicateError extends Error {}

  // Low-level (dot-path)
  export function get(path: string): unknown;
  export function set(path: string, value: unknown): void;
  export function remove(path: string): void;

  // Domain helpers
  export function getPreference<T = unknown>(key: string, defaultValue?: T): T;
  export function setPreference(key: string, value: unknown): void;

  // Theme — 'auto' | 'light' | 'dark'; default 'auto'.
  // setTheme persists, applies the data-theme attribute, and dispatches a
  // 'themechange' window event so non-CSS consumers (Konva canvas) can re-render.
  export type SuiteTheme = "auto" | "light" | "dark";
  export function getTheme(): SuiteTheme;
  export function setTheme(theme: SuiteTheme): void;
  export function applyTheme(theme: SuiteTheme): void;

  export function getRoster(classId: string): string[];
  export function setRoster(classId: string, names: string[]): void;
  /** Rename a roster member; dispatches a `rosterrename` window event with
   *  `detail: { classId, oldName, newName }`. Throws RosterDuplicateError
   *  if newName collides with another name in the same class. */
  export function renameStudent(classId: string, oldName: string, newName: string): string;
  export function listPeriods(): string[];

  // Class metadata
  export type ClassSource = "canonical" | "seating-chart";
  export interface ClassListEntry {
    id: string;
    name: string;
    source: ClassSource;
  }
  export function getClassName(classId: string): string | null;
  export function setClassName(classId: string, name: string): void;
  export function listClasses(): ClassListEntry[];
  export function deleteClass(classId: string): void;

  export function getCallCount(classId: string, name: string): number;
  export function incrementCallCount(classId: string, name: string): number;
  export function getToolState<T = unknown>(toolName: string): T | null;
  export function setToolState(toolName: string, value: unknown | null): void;

  /** Per-student tool metadata, keyed by canonical name. Auto-cleaned by
   *  setRoster (drops removed names) / renameStudent (rekeys) /
   *  deleteClass (drops the whole class bucket). */
  export function getToolMeta<T = unknown>(toolName: string, classId: string, name: string): T | undefined;
  export function setToolMeta(toolName: string, classId: string, name: string, value: unknown): void;
  export function patchToolMeta(toolName: string, classId: string, name: string, patch: object): void;
  export function removeToolMeta(toolName: string, classId: string, name: string): void;

  // Export / import
  export interface ClassroomExport {
    format: "teachersdesk-classroom-export";
    version: number;
    exportedAt: string;
    data: {
      rosters: Record<string, string[]>;
      callCounts: Record<string, Record<string, number>>;
      preferences: Record<string, unknown>;
      tools: Record<string, unknown>;
    };
  }
  export function exportClassroom(): ClassroomExport;
  export function importClassroom(json: unknown, mode?: "replace" | "merge"): void;
  export function downloadExport(): void;
}

declare module "@shared/roster-bridge.js" {
  export interface ClassListEntry {
    id: string;
    name: string;
    source: "canonical" | "seating-chart";
  }
  export interface RosterChangeDetail {
    classId: string;
    names: string[];
    added: string[];
    removed: string[];
  }
  export interface RosterRenameDetail {
    classId: string;
    oldName: string;
    newName: string;
  }

  // Snapshot reads (re-exports from storage)
  export function getClasses(): ClassListEntry[];
  export function getRoster(classId: string): string[];
  export function getClassName(classId: string): string | null;
  export function getCallCount(classId: string, name: string): number;
  export function getToolMeta<T = unknown>(toolName: string, classId: string, name: string): T | undefined;
  export function setClassName(classId: string, name: string): void;
  export function setRoster(classId: string, names: string[]): void;
  export function renameStudent(classId: string, oldName: string, newName: string): string;
  export function deleteClass(classId: string): void;
  export function setToolMeta(toolName: string, classId: string, name: string, value: unknown): void;
  export function patchToolMeta(toolName: string, classId: string, name: string, patch: object): void;
  export function removeToolMeta(toolName: string, classId: string, name: string): void;
  export function incrementCallCount(classId: string, name: string): number;

  // Subscriptions — each returns an unsubscribe function.
  export function onClassesChange(cb: () => void): () => void;
  export function onClassDelete(cb: (detail: { classId: string }) => void): () => void;
  export function onRosterChange(
    classId: string | null | undefined,
    cb: (detail: RosterChangeDetail) => void,
  ): () => void;
  export function onRosterRename(
    classId: string | null | undefined,
    cb: (oldName: string, newName: string, detail: RosterRenameDetail) => void,
  ): () => void;
  export function onAnyChange(cb: () => void): () => void;
}
