/**
 * Epicor Uninstaller — App Component (SolidJS)
 * Renders: Header → Body (path list + stats) → Footer
 * Screens:  Scan → Confirm Dialog → Delete Progress → Summary
 */

import { Show, For, createSignal } from "solid-js";
// import { electroview } from "./index";
import { phase, setPhase, paths, setPaths, progress, progressPct, counts, rebootNeeded } from "./store";
import type { PathStatus } from "../shared/types";
import { electroview } from "./main";

// ── Status config ─────────────────────────────────────────────
const STATUS = {
  pending: { icon: "·", label: "Pending", cls: "text-zinc-500" },
  deleted: { icon: "✓", label: "Deleted", cls: "text-emerald-400" },
  absent: { icon: "–", label: "Not Found", cls: "text-zinc-600" },
  rebooted: { icon: "↺", label: "On Reboot", cls: "text-amber-400" },
  failed: { icon: "✗", label: "Failed", cls: "text-red-400" },
} satisfies Record<PathStatus, { icon: string; label: string; cls: string }>;

// ── Helpers ───────────────────────────────────────────────────
function shortPath(p: string): string {
  const lower = p.toLowerCase();
  if (lower.startsWith("c:\\users\\")) {
    const parts = p.split("\\");
    return "~\\" + parts.slice(2).join("\\");
  }
  return p;
}

// ── Confirm Dialog ────────────────────────────────────────────
function ConfirmDialog(props: { onConfirm: () => void; onCancel: () => void }) {
  const [checked, setChecked] = createSignal(false);
  const found = () => counts().found;

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div class="w-[420px] rounded-xl border border-zinc-700 bg-[#13161e] p-8 shadow-2xl">
        {/* Warning icon */}
        <div class="mb-5 flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/20 text-orange-400 text-xl font-bold">
            ⚠
          </div>
          <h2 class="font-mono text-sm font-bold uppercase tracking-widest text-orange-400">Confirm Deletion</h2>
        </div>

        <p class="mb-6 text-sm leading-relaxed text-zinc-300">
          This will permanently delete <span class="font-bold text-white">{found()} Epicor path(s)</span> for{" "}
          <span class="font-bold text-white">all users</span> on this machine.
          <br />
          <span class="mt-2 block text-zinc-500">This action cannot be undone.</span>
        </p>

        {/* Checkbox */}
        <label class="mb-6 flex cursor-pointer items-center gap-3 select-none">
          <div
            onClick={() => setChecked((c) => !c)}
            class={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all ${
              checked() ? "border-orange-500 bg-orange-500 text-white" : "border-zinc-600 bg-zinc-800"
            }`}
          >
            {checked() && <span class="text-xs font-bold">✓</span>}
          </div>
          <span class="text-sm text-zinc-300" onClick={() => setChecked((c) => !c)}>
            I understand this is irreversible
          </span>
        </label>

        {/* Buttons */}
        <div class="flex gap-3">
          <button
            onClick={props.onCancel}
            class="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            onClick={props.onConfirm}
            disabled={!checked()}
            class={`flex-1 rounded-lg py-2.5 text-sm font-bold transition ${
              checked()
                ? "bg-orange-600 text-white hover:bg-orange-500 cursor-pointer"
                : "bg-zinc-800 text-zinc-600 cursor-not-allowed border border-zinc-700"
            }`}
          >
            🗑 Delete Now
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────
export function App() {
  const [showConfirm, setShowConfirm] = createSignal(false);

  // ── Actions ─────────────────────────────────────────────────
  async function handleScan() {
    setPhase("scanning");
    setPaths([]);
    try {
      const results = await electroview.rpc.request.scan({});
      setPaths(results);
      setPhase("idle");
    } catch (e) {
      console.error("Scan failed", e);
      setPhase("idle");
    }
  }

  function handleUninstallClick() {
    setShowConfirm(true);
  }

  async function handleConfirm() {
    setShowConfirm(false);
    setPhase("deleting");
    try {
      await electroview.rpc.request.uninstall({});
      // phase is set to "done" via pathProgress messages in store
    } catch (e) {
      console.error("Uninstall failed", e);
      setPhase("done");
    }
  }

  async function handleOpenLog() {
    await electroview.rpc.request.openLog({});
  }

  // Auto-scan on mount
  setTimeout(handleScan, 300);

  // ── Status summary bar text ──────────────────────────────────
  const statusText = () => {
    const p = phase();
    const c = counts();
    if (p === "scanning") return "Scanning for Epicor paths…";
    if (p === "deleting") return `Deleting…  ${progress().done} / ${progress().total}`;
    if (p === "done") {
      const parts = [];
      if (c.deleted) parts.push(`${c.deleted} deleted`);
      if (c.rebooted) parts.push(`${c.rebooted} on reboot`);
      if (c.failed) parts.push(`${c.failed} failed`);
      if (c.absent) parts.push(`${c.absent} not found`);
      return parts.join("  ·  ") || "Complete";
    }
    if (paths().length > 0) {
      return c.found > 0
        ? `Found ${c.found} path(s) to remove. Click Uninstall to proceed.`
        : "No Epicor files found on this machine.";
    }
    return "Ready";
  };

  const canUninstall = () => phase() === "idle" && counts().found > 0;

  const isDeleting = () => phase() === "deleting";
  const isDone = () => phase() === "done";

  return (
    <div class="flex h-screen flex-col bg-[#0d0f14] text-[#e8eaf0] font-sans overflow-hidden select-none">
      {/* ── Confirm Dialog ────────────────────────────────────── */}
      <Show when={showConfirm()}>
        <ConfirmDialog onConfirm={handleConfirm} onCancel={() => setShowConfirm(false)} />
      </Show>

      {/* ── Header ────────────────────────────────────────────── */}
      <header class="flex shrink-0 items-stretch border-b border-zinc-800 bg-[#13161e]">
        {/* Accent bar */}
        <div class="w-1.5 shrink-0 bg-orange-500" />

        <div class="flex flex-1 items-center gap-4 px-6 py-4">
          {/* App icon placeholder */}
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-400 text-lg">
            🗑
          </div>
          <div>
            <h1 class="font-mono text-lg font-bold uppercase tracking-widest text-[#e8eaf0]">Epicor Uninstaller</h1>
            <p class="font-mono text-[10px] text-zinc-500">
              Removes all Epicor data for every user on this machine · Requires Administrator
            </p>
          </div>
        </div>

        {/* Admin badge */}
        <div class="flex items-center pr-6">
          <span class="rounded border border-emerald-700/50 bg-emerald-900/30 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-400">
            ● Admin
          </span>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────── */}
      <main class="flex flex-1 gap-4 overflow-hidden p-4">
        {/* Left — Path List */}
        <section class="flex flex-1 flex-col rounded-xl border border-zinc-800 bg-[#13161e] overflow-hidden">
          {/* List header */}
          <div class="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <span class="font-mono text-[10px] font-bold uppercase tracking-widest text-orange-400">Target Paths</span>
            <span class="font-mono text-[10px] text-zinc-500">
              {counts().found} found / {paths().length} total
            </span>
          </div>

          {/* Scanning shimmer */}
          <Show when={phase() === "scanning"}>
            <div class="flex flex-1 flex-col gap-2 p-3">
              <For each={[1, 2, 3, 4, 5, 6]}>{() => <div class="h-9 animate-pulse rounded-lg bg-zinc-800/60" />}</For>
            </div>
          </Show>

          {/* Empty state */}
          <Show when={phase() !== "scanning" && paths().length === 0}>
            <div class="flex flex-1 items-center justify-center text-sm text-zinc-600">
              Press Rescan to discover Epicor paths
            </div>
          </Show>

          {/* Path rows */}
          <Show when={paths().length > 0}>
            <div class="flex-1 overflow-y-auto p-2 space-y-1.5">
              <For each={paths()}>
                {(item) => {
                  const cfg = STATUS[item.status];
                  const rowBg = () => {
                    if (item.status === "deleted") return "bg-emerald-950/40 border-emerald-900/30";
                    if (item.status === "failed") return "bg-red-950/40 border-red-900/30";
                    if (item.status === "rebooted") return "bg-amber-950/40 border-amber-900/30";
                    if (item.status === "absent") return "border-transparent";
                    return "bg-zinc-800/50 border-zinc-700/30";
                  };

                  return (
                    <div
                      class={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-all duration-300 ${rowBg()}`}
                    >
                      {/* Status icon */}
                      <span class={`w-5 shrink-0 text-center font-mono text-sm font-bold ${cfg.cls}`}>{cfg.icon}</span>

                      {/* Path */}
                      <span
                        class={`flex-1 truncate font-mono text-xs ${
                          item.status === "absent" ? "text-zinc-600" : "text-zinc-200"
                        }`}
                        title={item.path}
                      >
                        {shortPath(item.path)}
                      </span>

                      {/* Badge */}
                      <span class={`shrink-0 font-mono text-[9px] font-bold uppercase tracking-wider ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </section>

        {/* Right — Stats Panel */}
        <aside class="flex w-52 shrink-0 flex-col gap-3">
          {/* Summary card */}
          <div class="rounded-xl border border-zinc-800 bg-[#13161e] p-4">
            <p class="mb-3 font-mono text-[10px] font-bold uppercase tracking-widest text-orange-400">Summary</p>
            <div class="space-y-2">
              <For each={Object.entries(STATUS).filter(([k]) => k !== "pending")}>
                {([key, cfg]) => (
                  <div class="flex items-center justify-between">
                    <span class={`text-xs ${cfg.cls}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                    <span class={`font-mono text-xs font-bold ${cfg.cls}`}>{(counts() as any)[key] || "—"}</span>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* Progress card */}
          <div class="rounded-xl border border-zinc-800 bg-[#13161e] p-4">
            <p class="mb-3 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Progress</p>

            {/* Track */}
            <div class="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                class={`h-full rounded-full transition-all duration-300 ${
                  isDone() && counts().failed === 0 ? "bg-emerald-500" : "bg-orange-500"
                }`}
                style={{ width: `${progressPct() * 100}%` }}
              />
            </div>

            <p class="mt-2 text-right font-mono text-[10px] text-zinc-500">
              {progress().done} / {progress().total || paths().length}
            </p>
          </div>

          {/* Status message */}
          <div class="rounded-xl border border-zinc-800 bg-[#13161e] p-4">
            <p
              class={`text-xs leading-relaxed ${isDone() && counts().failed === 0 && !rebootNeeded() ? "text-emerald-400" : "text-zinc-400"}`}
            >
              {statusText()}
            </p>
          </div>

          {/* Reboot notice */}
          <Show when={rebootNeeded()}>
            <div class="rounded-xl border border-amber-800/40 bg-amber-950/30 p-4">
              <p class="font-mono text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-1">
                ↺ Reboot Required
              </p>
              <p class="text-xs text-amber-300/70 leading-relaxed">
                Some locked files are scheduled for removal on next system restart.
              </p>
            </div>
          </Show>
        </aside>
      </main>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer class="flex shrink-0 items-center gap-3 border-t border-zinc-800 bg-[#13161e] px-5 py-3">
        {/* Rescan */}
        <button
          onClick={handleScan}
          disabled={isDeleting()}
          class="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ⟳ Rescan
        </button>

        {/* Open Log */}
        <button
          onClick={handleOpenLog}
          class="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700"
        >
          📄 Open Log
        </button>

        {/* Spacer */}
        <div class="flex-1" />

        {/* Status text in footer */}
        <Show when={isDeleting()}>
          <span class="font-mono text-xs text-orange-400 animate-pulse">Deleting…</span>
        </Show>

        {/* Uninstall */}
        <button
          onClick={handleUninstallClick}
          disabled={!canUninstall()}
          class={`rounded-lg px-6 py-2 text-sm font-bold transition ${
            canUninstall()
              ? "bg-orange-600 text-white hover:bg-orange-500 cursor-pointer"
              : "cursor-not-allowed bg-zinc-800 text-zinc-600 border border-zinc-700"
          }`}
        >
          🗑 Uninstall
        </button>
      </footer>
    </div>
  );
}
