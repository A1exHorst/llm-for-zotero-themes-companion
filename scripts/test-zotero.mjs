import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = fileURLToPath(new URL("../", import.meta.url));
const revision = "435dd1928949ddb9361c2039da3d1ac96034c300";
const upstream =
  process.env.LLM_THEME_UPSTREAM_PATH || resolve(root, ".test-upstream");
function run(command, args, cwd = root, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// shell is intentionally unnecessary: invoke npm through its JavaScript CLI.
const npmCLI = process.env.npm_execpath;
if (!existsSync(resolve(upstream, "package.json"))) {
  run("git", [
    "clone",
    "https://github.com/yilewang/llm-for-zotero.git",
    upstream,
  ]);
  run("git", ["checkout", revision], upstream);
}
if (!process.env.LLM_THEME_UPSTREAM_PATH) {
  if (npmCLI)
    run(process.execPath, [npmCLI, "ci", "--ignore-scripts"], upstream);
  else {
    // npm ci is a standard developer command; Windows needs its command shim.
    const result = spawnSync(npm, ["ci", "--ignore-scripts"], {
      cwd: upstream,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
run(process.execPath, [resolve(root, "scripts/build.mjs")]);
const testDir = resolve(upstream, ".companion-tests");
await mkdir(testDir, { recursive: true });
const source = await readFile(
  resolve(root, "test-zotero/companion.workflow.test.ts"),
  "utf8",
);
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const xpi = resolve(
  root,
  `build/llm-for-zotero-themes-companion-${pkg.version}.xpi`,
);
await writeFile(
  resolve(testDir, "companion.workflow.test.ts"),
  source
    .replace('"__COMPANION_XPI__"', JSON.stringify(xpi))
    .replace(
      '"__COMPANION_THEMES__"',
      JSON.stringify(resolve(root, "src/themes.ts").replaceAll("\\", "/")),
    ),
);
const scaffold = resolve(
  upstream,
  "node_modules/zotero-plugin-scaffold/bin/zotero-plugin.mjs",
);
// Node resolves parent node_modules too, which is useful for a local clean fixture.
const candidates = [
  scaffold,
  ...(
    createRequire(resolve(upstream, "package.json")).resolve.paths(
      "zotero-plugin-scaffold",
    ) || []
  ).map((directory) =>
    resolve(directory, "zotero-plugin-scaffold/bin/zotero-plugin.mjs"),
  ),
];
const actualScaffold = candidates.find((path) => existsSync(path));
if (!actualScaffold)
  throw new Error(
    "Install the original plugin's locked development dependencies before running native tests.",
  );
run(
  process.execPath,
  [actualScaffold, "test", "--no-watch", "--abort-on-fail"],
  upstream,
  {
    ...process.env,
    NODE_ENV: "test",
    LLM_FOR_ZOTERO_WORKFLOW_TESTS: "1",
    LLM_FOR_ZOTERO_TEST_ENTRIES: ".companion-tests",
  },
);
