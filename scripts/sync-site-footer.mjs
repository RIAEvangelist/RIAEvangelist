import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderSiteFooter } from "./site-footer.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_PATH = path.join(ROOT, "index.html");
const START = "<!-- shared-site-footer:start -->";
const END = "<!-- shared-site-footer:end -->";
const CHECK_MODE = process.argv.includes("--check");

const html = await readFile(INDEX_PATH, "utf8");
const start = html.indexOf(START);
const end = html.indexOf(END);
if (start < 0 || end <= start) throw new Error("Missing shared site footer markers in index.html");

const rendered = renderSiteFooter("").split("\n").map((line) => `    ${line}`).join("\n");
const expectedBlock = `${START}\n${rendered}\n    ${END}`;
const currentBlock = html.slice(start, end + END.length);

if (currentBlock === expectedBlock) {
  console.log("Shared homepage footer is current.");
} else if (CHECK_MODE) {
  throw new Error("Homepage footer is out of sync; run node scripts/sync-site-footer.mjs");
} else {
  const updated = `${html.slice(0, start)}${expectedBlock}${html.slice(end + END.length)}`;
  await writeFile(INDEX_PATH, updated);
  console.log("Updated the shared homepage footer.");
}
