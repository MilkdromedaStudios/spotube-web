// Checks that extension/manifest.json is valid, every file it names exists, and every script parses.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const dir = "extension";
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const problems = [];

if (manifest.manifest_version !== 3) problems.push("manifest_version must be 3");
for (const field of ["name", "version", "description"]) if (!manifest[field]) problems.push(`missing ${field}`);

const files = [
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...(manifest.content_scripts ?? []).flatMap((c) => [...(c.js ?? []), ...(c.css ?? [])]),
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
].filter(Boolean);
for (const f of files) if (!existsSync(join(dir, f))) problems.push(`missing file ${f}`);

// Files the panel page loads.
const panel = readFileSync(join(dir, manifest.side_panel.default_path), "utf8");
for (const [, f] of panel.matchAll(/(?:src|href)="([^":]+\.(?:js|css))"/g)) if (!existsSync(join(dir, f))) problems.push(`panel loads missing ${f}`);

for (const f of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
  try {
    execFileSync(process.execPath, ["--check", join(dir, f)], { stdio: "pipe" });
  } catch (e) {
    problems.push(`${f} doesn't parse: ${e.stderr}`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`extension OK: ${files.length} files checked`);
