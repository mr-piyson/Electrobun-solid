/**
 * Global reactive store (SolidJS signals + derived)
 */

import { createSignal, createMemo } from "solid-js";
import type { PathResult, PathStatus } from "../shared/types";

export type AppPhase = "idle" | "scanning" | "confirming" | "deleting" | "done";

// ── Core signals ──────────────────────────────────────────────
export const [phase, setPhase] = createSignal<AppPhase>("idle");
export const [paths, setPaths] = createSignal<PathResult[]>([]);
export const [progress, setProgress] = createSignal({ done: 0, total: 0 });
export const [rebootNeeded, setRebootNeeded] = createSignal(false);

// ── Derived counts ────────────────────────────────────────────
export const counts = createMemo(() => {
  const all = paths();
  return {
    pending: all.filter((p) => p.status === "pending").length,
    deleted: all.filter((p) => p.status === "deleted").length,
    absent: all.filter((p) => p.status === "absent").length,
    rebooted: all.filter((p) => p.status === "rebooted").length,
    failed: all.filter((p) => p.status === "failed").length,
    found: all.filter(
      (p) => p.status === "pending" || p.status === "deleted" || p.status === "rebooted" || p.status === "failed",
    ).length,
  };
});

export const progressPct = createMemo(() => {
  const { done, total } = progress();
  return total === 0 ? 0 : done / total;
});

// ── Action: update a single path from bun stream ─────────────
export function setPathProgress(payload: PathResult & { done: number; total: number }) {
  setPaths((prev) => prev.map((p) => (p.path === payload.path ? { ...p, status: payload.status } : p)));
  setProgress({ done: payload.done, total: payload.total });

  if (payload.status === "rebooted") {
    setRebootNeeded(true);
  }

  // If all done, move to done phase
  if (payload.done >= payload.total) {
    setPhase("done");
  }
}
