import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Empty = same-origin; frontend and backend served together, no hardcoded host.
  const runtimeBaseUrl = env.VITE_AGENT_RUNTIME_BASE ?? "http://127.0.0.1:8088";
  const userCenterBaseUrl = env.VITE_USER_CENTER_BASE ?? "http://127.0.0.1:18080";

  return {
    define: {
      BASE_URL: JSON.stringify(runtimeBaseUrl),
      USER_CENTER_BASE: JSON.stringify(userCenterBaseUrl),
      TOKEN: JSON.stringify(env.TOKEN || ""),
      MOBILE: false,
    },
    plugins: [react()],
    css: {
      modules: {
        localsConvention: "camelCase",
        generateScopedName: "[name]__[local]__[hash:base64:5]",
      },
      preprocessorOptions: {
        less: {
          javascriptEnabled: true,
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 1420,
      strictPort: true,
    },
    optimizeDeps: {
      include: ["@agentscope-ai/design"],
      esbuildOptions: {
        loader: {
          ".svg": "dataurl",
        },
      },
    },
    // build: {
    //   // Output to CoPaw's console directory,
    //   // so we don't need to copy files manually after build.
    //   outDir: path.resolve(__dirname, "../src/sealclaw/console"),
    //   emptyOutDir: true,
    // },
  };
});
