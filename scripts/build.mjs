import { readFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { resolveVersion } from "./release-version.mjs";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const version = resolveVersion(packageJson.version);
const metadata = (await readFile(new URL("userscript.meta.txt", root), "utf8")).replaceAll(
  "__VERSION__",
  version,
);

await mkdir(new URL("dist", root), { recursive: true });
await build({
  entryPoints: [new URL("src/main.ts", root).pathname],
  outfile: new URL("dist/rocket-chat-markdown-plus.user.js", root).pathname,
  bundle: true,
  banner: { js: metadata.trimEnd() },
  charset: "utf8",
  format: "iife",
  legalComments: "none",
  minify: false,
  platform: "browser",
  target: ["chrome120"],
});
