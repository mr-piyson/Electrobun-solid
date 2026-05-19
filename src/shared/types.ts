import type { RPCSchema } from "electrobun/bun";

// ─── Result for a single path ────────────────────────────────
export type PathStatus = "pending" | "deleted" | "absent" | "rebooted" | "failed";

export interface PathResult {
  path: string;
  status: PathStatus;
}

// ─── Shared RPC contract ─────────────────────────────────────
export type AppRPCType = {
  /** Functions that execute in the Bun (main) process */
  bun: RPCSchema<{
    requests: {
      /** Scan and return all target paths with their current existence status */
      scan: {
        params: Record<string, never>;
        response: PathResult[];
      };
      /** Delete all found paths; streams progress via messages */
      uninstall: {
        params: Record<string, never>;
        response: { success: boolean; rebootNeeded: boolean };
      };
      /** Open the log file in the system default text editor */
      openLog: {
        params: Record<string, never>;
        response: { logPath: string };
      };
    };
    messages: Record<string, never>;
  }>;

  /** Functions / messages that execute in the WebView (renderer) */
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: {
      /** Pushed from bun for each path as it finishes deletion */
      pathProgress: PathResult & { done: number; total: number };
    };
  }>;
};
