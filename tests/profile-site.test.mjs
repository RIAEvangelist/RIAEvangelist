import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(ROOT, relativePath), "utf8");

test("NPM totals are exact sums of a unique maintained package inventory", async () => {
  const snapshot = JSON.parse(await read("data/npm-stats.json"));
  const names = snapshot.packages.map((pkg) => pkg.name);

  assert.equal(snapshot.packageCount, snapshot.packages.length);
  assert.equal(new Set(names).size, names.length);
  assert.ok(snapshot.packages.every((pkg) => pkg.maintainers.some((name) => name.toLowerCase() === snapshot.maintainer)));

  for (const period of ["week", "month", "year"]) {
    const total = snapshot.packages.reduce((sum, pkg) => sum + pkg.downloads[period], 0);
    assert.equal(snapshot.totals[period], total);
    assert.match(snapshot.periods[period].start, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(snapshot.periods[period].end, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("repository atlas accounts for every record and explains each one", async () => {
  const snapshot = JSON.parse(await read("data/repos.json"));
  const names = snapshot.repositories.map((repo) => repo.fullName);

  assert.equal(snapshot.counts.total, snapshot.repositories.length);
  assert.equal(new Set(names).size, names.length);
  assert.equal(snapshot.counts.original + snapshot.counts.forks, snapshot.counts.total);
  assert.equal(snapshot.counts.stars, snapshot.repositories.reduce((sum, repo) => sum + repo.stars, 0));
  assert.ok(snapshot.repositories.every((repo) => repo.explanation.trim().length > 0));
  assert.ok(snapshot.repositories.every((repo) => repo.url.startsWith("https://github.com/")));
});

test("profile README and site expose the telemetry experience", async () => {
  const [readme, html, script, svg] = await Promise.all([
    read("README.md"),
    read("index.html"),
    read("app.js"),
    read("assets/npm-downloads.svg"),
  ]);

  assert.match(readme, /assets\/npm-downloads\.svg/);
  assert.match(readme, /riaevangelist\.github\.io\/RIAEvangelist/);
  assert.match(html, /id="package-grid"/);
  assert.match(html, /id="repo-grid"/);
  assert.match(script, /data\/npm-stats\.json/);
  assert.match(script, /data\/repos\.json/);
  assert.match(svg, /WEEKLY/);
  assert.match(svg, /MONTHLY/);
  assert.match(svg, /YEARLY/);
  assert.match(svg, /js-message/);
});

test("implementation introduces no TypeScript or TSX", async () => {
  const forbidden = [];

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "dist") continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      if (entry.isFile() && (/\.(ts|tsx)$/i.test(entry.name) || /^tsconfig(?:\..+)?\.json$/i.test(entry.name))) {
        forbidden.push(path.relative(ROOT, fullPath));
      }
    }
  }

  await walk(ROOT);
  assert.deepEqual(forbidden, []);
});
