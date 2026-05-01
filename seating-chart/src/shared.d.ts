// Type declarations for the suite-wide shared storage module.
// The runtime lives at /shared/storage.js (vanilla ES module, no TS source).
// This declaration lets TypeScript files in seating-chart consume it via the
// `@shared/storage.js` path alias defined in tsconfig.json + vite.config.ts.

declare module "@shared/storage.js" {
  export class StorageQuotaError extends Error {}
  export class ImportFormatError extends Error {}

  // Low-level (dot-path)
  export function get(path: string): unknown;
  export function set(path: string, value: unknown): void;
  export function remove(path: string): void;

  // Domain helpers
  export function getPreference<T = unknown>(key: string, defaultValue?: T): T;
  export function setPreference(key: string, value: unknown): void;
  export function getRoster(classId: string): string[];
  export function setRoster(classId: string, names: string[]): void;
  export function listPeriods(): string[];
  export function getCallCount(classId: string, name: string): number;
  export function incrementCallCount(classId: string, name: string): number;
  export function getToolState<T = unknown>(toolName: string): T | null;
  export function setToolState(toolName: string, value: unknown | null): void;

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
