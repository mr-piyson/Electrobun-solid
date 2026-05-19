import { BrowserWindow, Updater } from "electrobun/bun";
import { existsSync, rmSync } from "fs";
import { readdir } from "fs/promises";
import { join } from "path";
import type { AppRPCType, PathResult, PathStatus } from "../shared/types";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// Check if Vite dev server is running for HMR
// async function getMainViewUrl(): Promise<string> {
//   const channel = await Updater.localInfo.channel();
//   if (channel === "dev") {
//     try {
//       await fetch(DEV_SERVER_URL, { method: "HEAD" });
//       console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
//       return DEV_SERVER_URL;
//     } catch {
//       console.log("Vite dev server not running. Run 'bun run dev:hmr' for HMR support.");
//     }
//   }
//   return "views://mainview/index.html";
// }

// const url = await getMainViewUrl();

// const isDev = process.env.NODE_ENV === "development";

// const mainWindow = new BrowserWindow({
//   title: "Solid App",
//   url: isDev ? "http://localhost:5173" : "views://mainview/index.html",
//   frame: {
//     width: 900,
//     height: 700,
//     x: 200,
//     y: 200,
//   },
// });

/**
 * Epicor Uninstaller — Main Process (Bun)
 * =========================================
 * Handles:
 *  • Creating the BrowserWindow
 *  • UAC elevation check (Windows)
 *  • Scanning for Epicor paths
 *  • Force-deleting with 3-layer fallback
 *  • Reboot-schedule fallback via MoveFileEx
 *  • Streaming per-path progress to the renderer via RPC messages
 *  • Opening the log file
 */

// ── Logging ──────────────────────────────────────────────────
const LOG_PATH = join(process.env.TEMP ?? process.env.TMP ?? "C:\\Temp", "epicor_uninstall.log");

function log(level: "INFO" | "WARN" | "ERROR", msg: string) {
  const line = `${new Date().toISOString()}  ${level.padEnd(5)}  ${msg}\n`;
  Bun.file(LOG_PATH).writer().write(line); // non-blocking append
  console.log(line.trim());
}

// ── UAC check (Windows only) ─────────────────────────────────
async function isAdmin(): Promise<boolean> {
  if (process.platform !== "win32") return true; // dev on Mac/Linux: skip
  try {
    const proc = Bun.spawnSync(["net", "session"], { stderr: "pipe" });
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

async function elevateAndRestart(): Promise<void> {
  // Re-launch self with PowerShell Start-Process -Verb RunAs
  const exePath = process.execPath;
  Bun.spawnSync(["powershell", "-Command", `Start-Process '${exePath}' -Verb RunAs`]);
  process.exit(0);
}

// ── Filesystem helpers ────────────────────────────────────────
const EXCLUDE_USERS = new Set(["public", "default", "default user", "all users"]);

async function getUserHomes(): Promise<string[]> {
  const usersRoot = "C:\\Users";
  if (!existsSync(usersRoot)) return [];
  try {
    const entries = await readdir(usersRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !EXCLUDE_USERS.has(e.name.toLowerCase()))
      .map((e) => join(usersRoot, e.name));
  } catch {
    return [];
  }
}

async function buildTargetList(): Promise<string[]> {
  const fixed = ["C:\\ProgramData\\Epicor", "C:\\Epicor"];
  const homes = await getUserHomes();
  const perUser = homes.flatMap((h) => [
    join(h, "AppData", "Local", "Epicor"),
    join(h, "AppData", "Roaming", "Epicor"),
  ]);
  return [...fixed, ...perUser];
}

/** Strip read-only / hidden / system attributes recursively */
function stripAttribs(p: string) {
  try {
    Bun.spawnSync(["attrib", "-R", "-H", "-S", p, "/S", "/D"], {
      stderr: "pipe",
      stdout: "pipe",
    });
  } catch {
    /* non-fatal */
  }
}

/** Schedule deletion on next Windows reboot via MoveFileEx */
function scheduleRebootDelete(p: string): boolean {
  if (process.platform !== "win32") return false;
  try {
    const proc = Bun.spawnSync(
      [
        "powershell",
        "-Command",
        `Add-Type -Name WinAPI -Namespace Win32 -MemberDefinition '[DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool MoveFileEx(string lpExistingFileName, string lpNewFileName, int dwFlags);'; [Win32.WinAPI]::MoveFileEx('${p}', $null, 4)`,
      ],
      { stderr: "pipe", stdout: "pipe" },
    );
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

function forceRemove(p: string): PathStatus {
  if (!existsSync(p)) {
    log("INFO", `SKIP (not found): ${p}`);
    return "absent";
  }

  stripAttribs(p);

  // Attempt 1 – Bun/Node rmSync
  try {
    rmSync(p, { recursive: true, force: true });
    if (!existsSync(p)) {
      log("INFO", `DELETED: ${p}`);
      return "deleted";
    }
  } catch {
    /* fall through */
  }

  // Attempt 2 – cmd rd /s /q
  try {
    Bun.spawnSync(["cmd", "/c", "rd", "/s", "/q", p], {
      stderr: "pipe",
      stdout: "pipe",
    });
    if (!existsSync(p)) {
      log("INFO", `DELETED (cmd): ${p}`);
      return "deleted";
    }
  } catch {
    /* fall through */
  }

  // Attempt 3 – schedule on reboot
  if (scheduleRebootDelete(p)) {
    log("WARN", `REBOOT SCHEDULED: ${p}`);
    return "rebooted";
  }

  log("ERROR", `FAILED: ${p}`);
  return "failed";
}

// ── Main entry point ─────────────────────────────────────────
async function main() {
  // Elevate on Windows if needed
  if (process.platform === "win32" && !(await isAdmin())) {
    await elevateAndRestart();
    return;
  }

  log("INFO", "=".repeat(60));
  log("INFO", `Epicor Uninstaller started  ${new Date().toISOString()}`);

  // ── RPC definition ─────────────────────────────────────────
  let winRef: InstanceType<typeof BrowserWindow> | null = null;

  const rpc = BrowserView.defineRPC<AppRPCType>({
    maxRequestTime: 120_000, // 2 min for long uninstalls
    handlers: {
      requests: {
        scan: async () => {
          const paths = await buildTargetList();
          const results: PathResult[] = paths.map((p) => ({
            path: p,
            status: existsSync(p) ? "pending" : "absent",
          }));
          log("INFO", `Scan found ${results.filter((r) => r.status === "pending").length} existing path(s)`);
          return results;
        },

        uninstall: async () => {
          const paths = await buildTargetList();
          const existing = paths.filter((p) => existsSync(p));
          const total = paths.length;
          let done = 0;

          log("INFO", `Uninstall started — ${existing.length} path(s) to delete`);

          for (const p of paths) {
            const status = forceRemove(p);
            done++;
            // Push progress to renderer
            winRef?.webview.rpc.send.pathProgress({
              path: p,
              status,
              done,
              total,
            });
            // Small yield so Bun doesn't starve the event loop
            await Bun.sleep(50);
          }

          const rebootNeeded = false; // tracked per-path in renderer
          log("INFO", "Uninstall complete");
          return { success: true, rebootNeeded };
        },

        openLog: async () => {
          try {
            if (process.platform === "win32") {
              Bun.spawnSync(["cmd", "/c", "start", "", LOG_PATH]);
            } else {
              Bun.spawnSync(["open", LOG_PATH]);
            }
          } catch {
            /* ignore */
          }
          return { logPath: LOG_PATH };
        },
      },
      messages: {},
    },
  });

  // ── Create window ──────────────────────────────────────────
  const win = new BrowserWindow({
    title: "Epicor Uninstaller",
    url: "views://renderer/index.html",
    titleBarStyle: "hiddenInset",
    rpc,
  });

  winRef = win;
}

main();
