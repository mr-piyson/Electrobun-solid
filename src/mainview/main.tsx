/**
 * Epicor Uninstaller — Renderer (SolidJS)
 * =========================================
 * Bootstraps the SolidJS app and wires up Electroview RPC.
 */

import { render } from "solid-js/web";
import { Electroview } from "electrobun/view";
import type { AppRPCType } from "../shared/types";
import { App } from "./App";
import { setPathProgress } from "./store";

// ── Wire up RPC ───────────────────────────────────────────────
const rpc = Electroview.defineRPC<AppRPCType>({
  handlers: {
    requests: {},
    messages: {
      pathProgress: (payload) => {
        // Called by bun for each path as it finishes
        setPathProgress(payload);
      },
    },
  },
});

export const electroview = new Electroview({ rpc });

// ── Mount SolidJS ─────────────────────────────────────────────
const root = document.getElementById("root");
if (!root) throw new Error("No #root element found");
render(() => <App />, root);
