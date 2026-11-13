// Copies every client repo listed in hosted.json into site/_sites/<name>/ so the make4yu
// Cloudflare project can serve it at <name>.make4yu.com (see functions/_middleware.js).
// Usage: node scripts/sync-sites.mjs            (clones each repo from GitHub)
//        node scripts/sync-sites.mjs name=/path (use a local checkout for that site, for testing)
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "site", "_sites");
const SKIP = new Set([".git", ".github", "README.md", "LICENSE", "make4yu.json", "node_modules", ".gitignore", ".DS_Store"]);
const local = Object.fromEntries(process.argv.slice(2).filter(a => a.includes("=")).map(a => a.split("=")));
const sites = JSON.parse(fs.readFileSync(path.join(ROOT, "hosted.json"), "utf8"));

const NOT_FOUND = name => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#111;color:#eee;text-align:center}a{color:#eee}</style></head>
<body><div><h1 style="font-weight:600">Page not found</h1><p><a href="/">Go to the home page</a></p></div></body></html>\n`;

function copy(src, dst) {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const a = path.join(src, e.name), b = path.join(dst, e.name);
    if (e.isDirectory()) { fs.mkdirSync(b, { recursive: true }); copy(a, b); }
    else if (e.isFile()) fs.copyFileSync(a, b);
  }
}

fs.mkdirSync(OUT, { recursive: true });
const wanted = Object.keys(sites).filter(k => !k.startsWith("_"));
for (const name of wanted) {
  if (!/^[a-z0-9-]+$/.test(name) || name === "www") { console.error(`skip "${name}": use lowercase letters, numbers and dashes`); continue; }
  let src = local[name], tmp;
  if (!src) {
    tmp = fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "site-"));
    execFileSync("git", ["clone", "--depth", "1", "--quiet", `https://github.com/${sites[name]}.git`, tmp], { stdio: "inherit" });
    src = tmp;
  }
  const dst = path.join(OUT, name);
  fs.rmSync(dst, { recursive: true, force: true }); fs.mkdirSync(dst, { recursive: true });
  copy(src, dst);
  if (!fs.existsSync(path.join(dst, "404.html"))) fs.writeFileSync(path.join(dst, "404.html"), NOT_FOUND(name));
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${name}: copied from ${sites[name]}`);
}
// remove sites that were taken out of hosted.json
for (const d of fs.readdirSync(OUT)) if (!wanted.includes(d)) { fs.rmSync(path.join(OUT, d), { recursive: true, force: true }); console.log(`${d}: removed`); }
