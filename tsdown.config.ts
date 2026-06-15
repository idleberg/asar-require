import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/require.ts"],
  format: "cjs",
  outDir: "lib",
  dts: true,
  clean: true,
});
