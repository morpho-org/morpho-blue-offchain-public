/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { extname, relative, resolve } from "path";

import react from "@vitejs/plugin-react";
import { glob } from "glob";
import { vitePluginTevm } from "tevm/bundler/vite-plugin";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { externalizeDeps } from "vite-plugin-externalize-deps";
// import { viteStaticCopy } from "vite-plugin-static-copy";
import svgr from "vite-plugin-svgr";

import vitePluginTevmTypes from "./vite-plugin-tevm-types.ts";

// https://vite.dev/config/
export default defineConfig({
  // NOTE: Can use `svgr({ include: "**/*.svg" })` and add `,svg` to the rollup glob pattern to transpile _all_
  // SVGs to JS rather than only those which are used in components
  plugins: [
    vitePluginTevm(),
    vitePluginTevmTypes(),
    // NOTE: The following can be used to include raw `.sol` files in the bundle
    // viteStaticCopy({
    //   structured: false,
    //   targets: [
    //     {
    //       src: "src/**/*.sol",
    //       dest: "",
    //       rename: (_fileName, _fileExtension, fullPath) => relative("src", fullPath),
    //     },
    //   ],
    // }),
    svgr(),
    react(),
    dts({ tsconfigPath: "./tsconfig.package.json" }),
    /* NOTE: The following works too, but results in a slightly larger bundle since it doesn't externalize
    Node built-ins (the plugin does).
    ```
    import packageJson from "./package.json";
    //...
    build.rollupOptions.external = Object.keys(packageJson.peerDependencies)
    ```
    */
    externalizeDeps({ deps: false, peerDeps: true, devDeps: false }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/main.ts"),
      formats: ["es"],
    },
    rollupOptions: {
      input: Object.fromEntries(
        glob
          .sync("src/**/*.{ts,tsx,sol}", {
            ignore: ["src/**/*.d.ts"],
          })
          .map((file) => [
            // The name of the entry point
            // lib/nested/foo.ts becomes nested/foo
            relative("src", extname(file) === ".sol" ? file : file.slice(0, file.length - extname(file).length)),
            // The absolute path to the entry file
            // lib/nested/foo.ts becomes /project/lib/nested/foo.ts
            fileURLToPath(new URL(file, import.meta.url)),
          ]),
      ),
      output: {
        dir: "dist",
        assetFileNames: "assets/[name][extname]",
        entryFileNames: "[name].js",
      },
    },
    copyPublicDir: false,
  },
  test: {
    include: ["test/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
