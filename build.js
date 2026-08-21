"use strict";
const entrypoint = "./src/index.ts"; // Adjust if your entry file is elsewhere
const outdir = "./dist";
// 1. Build ESM (.mjs)
const esmResult = await Bun.build({
    entrypoints: [entrypoint],
    outdir,
    target: "node",
    format: "esm",
    naming: "[name].mjs", // Forces output to index.mjs
});
if (!esmResult.success) {
    console.error("ESM Build failed", esmResult.logs);
    process.exit(1);
}
// 2. Build CommonJS (.cjs)
const cjsResult = await Bun.build({
    entrypoints: [entrypoint],
    outdir,
    target: "node",
    format: "cjs",
    naming: "[name].cjs", // Forces output to index.cjs
});
if (!cjsResult.success) {
    console.error("CJS Build failed", cjsResult.logs);
    process.exit(1);
}
console.log("✅ Dual ESM/CJS build completed successfully!");
