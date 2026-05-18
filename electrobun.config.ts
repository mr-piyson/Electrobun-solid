import type { ElectrobunConfig } from "electrobun";

const isDev = process.env.NODE_ENV !== "production";

export default {
  app: {
    name: "solid-app",
    identifier: "solidapp.electrobun.dev",
    version: "1.0.0",
  },

  build: {
    // During production, copy the compiled SolidJS code into the binary
    copy: isDev
      ? {}
      : {
          "dist/index.html": "views/mainview/index.html",
          "dist/assets": "views/mainview/assets",
        },
    watchIgnore: ["dist/**"],
    mac: { bundleCEF: false },
    linux: { bundleCEF: false },
    win: {
      bundleCEF: false, // Uses Windows native Edge WebView2 to keep the .exe ultra-light
    },
  },
} satisfies ElectrobunConfig;
