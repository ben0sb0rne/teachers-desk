// Import / export glue for the seating chart.
//
// The suite-wide export lives in /shared/storage.js and produces a single
// JSON file containing every tool's data (bingo settings, seating-chart
// classes, preferences, rosters, call counts).
//
// We continue to support a SECOND format here: pre-suite seating-chart-only
// exports (`{ classes, activeClassId, schemaVersion }`). Users may have
// these saved on disk from before the suite migration; we accept them and
// apply them locally.

import type { AppState } from "@/types";
import { SCHEMA_VERSION } from "@/types";
import { runMigrations } from "@/lib/migrations";
import * as sharedStorage from "@shared/storage.js";

/**
 * Trigger a download of the FULL Teacher's Desk classroom (every tool).
 * The `_state` argument is accepted for backwards compatibility with the
 * pre-suite call sites; the full suite export does not need it.
 */
export function exportStateToFile(_state?: AppState) {
  sharedStorage.downloadExport();
}

export interface ParsedImport {
  /**
   * Present when the imported file was a legacy seating-chart-only export.
   * Caller is expected to call `replaceState(state)` (or merge) to apply.
   */
  state?: AppState;

  /**
   * True when the imported file was a full suite export. The shared module
   * has already been mutated; the caller should reload the page so every
   * tool picks up the new data cleanly.
   */
  applied?: boolean;

  warnings: string[];
}

const SUITE_FORMAT_ID = "teachersdesk-classroom-export";

export async function readStateFromFile(
  file: File,
  mode: "replace" | "merge" = "replace",
): Promise<ParsedImport> {
  const text = await file.text();
  const data = JSON.parse(text) as unknown;

  if (!data || typeof data !== "object") {
    throw new Error("File is not a JSON object");
  }
  const obj = data as Record<string, unknown>;

  // ── Format A: full Teacher's Desk suite export ──
  if (obj.format === SUITE_FORMAT_ID) {
    const warnings: string[] = [];
    const incomingVersion = typeof obj.version === "number" ? obj.version : 1;
    if (incomingVersion > 1) {
      warnings.push(
        `Imported file is suite v${incomingVersion}; this app is v1. Some fields may be ignored.`,
      );
    }
    // Apply via the shared module — this writes preferences, rosters,
    // tools.bingo, tools["seating-chart"], etc. into one place.
    sharedStorage.importClassroom(obj, mode);
    return { applied: true, warnings };
  }

  // ── Format B: legacy seating-chart-only export ──
  if (Array.isArray(obj.classes)) {
    const warnings: string[] = [];
    const incomingVersion = typeof obj.schemaVersion === "number" ? obj.schemaVersion : 1;
    if (incomingVersion < SCHEMA_VERSION) {
      warnings.push(
        `Imported file was schema v${incomingVersion}; upgraded to v${SCHEMA_VERSION} on the fly.`,
      );
    } else if (incomingVersion > SCHEMA_VERSION) {
      warnings.push(
        `Imported file is schema v${incomingVersion} (newer than this app's v${SCHEMA_VERSION}). Some fields may be ignored.`,
      );
    }
    const state = runMigrations(obj, incomingVersion);
    return { state, warnings };
  }

  throw new Error(
    "Unrecognized file format. Expected a Teacher's Desk classroom export or a legacy seating-chart export.",
  );
}
