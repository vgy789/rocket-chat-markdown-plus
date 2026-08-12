import { readFile } from "node:fs/promises";
import { resolveVersion } from "./release-version.mjs";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const artifact = await readFile(new URL("dist/rocket-chat-markdown-plus.user.js", root), "utf8");
const version = artifact.match(/^\/\/ @version\s+(\S+)$/m)?.[1];
const expectedVersion = resolveVersion(packageJson.version);

if (version !== expectedVersion) {
  throw new Error(`Metadata version ${version ?? "missing"} does not match ${expectedVersion}.`);
}
for (const match of ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"]) {
  if (!artifact.includes(`// @match        ${match}`)) {
    throw new Error(`The required @match entry is missing: ${match}`);
  }
}
if (!artifact.startsWith("// ==UserScript==")) {
  throw new Error("The built artifact does not start with a userscript metadata block.");
}
if (!artifact.includes("// @grant        none") || !artifact.includes("// @noframes")) {
  throw new Error("The userscript must run without grants and outside child frames.");
}
if (artifact.includes("__VERSION__")) {
  throw new Error("The metadata version placeholder was not replaced.");
}

console.log(`Metadata is valid for v${version}.`);
