import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import Zip from "adm-zip";
import { fileURLToPath } from "node:url";

const pkg = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const root = new URL("../", import.meta.url);
const output = new URL("build/addon/", root);
if (!fileURLToPath(output).startsWith(fileURLToPath(new URL("build/", root))))
  throw new Error("Unsafe build directory");
await rm(fileURLToPath(output), { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL("addon/", root), output, { recursive: true });
await cp(new URL("LICENSE", root), new URL("LICENSE", output));
await build({
  entryPoints: [fileURLToPath(new URL("src/index.ts", root))],
  outfile: fileURLToPath(new URL("content/companion.js", output)),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "firefox115",
});
const manifest = JSON.parse(
  await readFile(new URL("manifest.json", output), "utf8"),
);
manifest.version = pkg.version;
await writeFile(
  new URL("manifest.json", output),
  JSON.stringify(manifest, null, 2) + "\n",
);
const zip = new Zip();
zip.addLocalFolder(fileURLToPath(output));
const filename = new URL(
  `build/llm-for-zotero-themes-companion-${pkg.version}.xpi`,
  root,
);
zip.writeZip(fileURLToPath(filename));
console.log(`Built ${filename.pathname}`);
