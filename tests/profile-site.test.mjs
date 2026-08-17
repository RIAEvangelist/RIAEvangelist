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

  assert.deepEqual(snapshot.maintainers, ["riaevangelist", "thewizardnexus"]);
  assert.equal(snapshot.packageCount, snapshot.packages.length);
  assert.equal(new Set(names).size, names.length);
  assert.ok(snapshot.packages.every((pkg) => pkg.maintainers.some((name) => snapshot.maintainers.includes(name.toLowerCase()))));
  assert.ok(snapshot.packages.every((pkg) => pkg.trackedMaintainers.length > 0));
  assert.ok(names.includes("dbopfs"));

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
  assert.deepEqual(snapshot.owners.map((owner) => owner.login), ["RIAEvangelist", "TheWizardNexus"]);
  assert.equal(snapshot.owners.reduce((sum, owner) => sum + owner.repositoryCount, 0), snapshot.counts.total);
  assert.ok(snapshot.repositories.some((repo) => repo.fullName === "TheWizardNexus/DBOPFS"));
  assert.ok(snapshot.repositories.every((repo) => repo.explanation.trim().length > 0));
  assert.ok(snapshot.repositories.every((repo) => repo.url.startsWith("https://github.com/")));
});

test("historical NPM archive reconciles every year, module, and lifetime total", async () => {
  const index = JSON.parse(await read("data/npm-history/index.json"));
  const packageNames = index.packages.map((pkg) => pkg.name).sort();
  const years = await Promise.all(index.years.map(({ file }) => read(`data/npm-history/${file}`).then(JSON.parse)));

  assert.deepEqual(index.authors, ["riaevangelist", "thewizardnexus"]);
  assert.equal(index.packageCount, index.packages.length);
  assert.equal(new Set(packageNames).size, packageNames.length);
  assert.equal(index.lifetimeTotal, index.years.reduce((sum, year) => sum + year.total, 0));
  assert.equal(index.lifetimeTotal, index.packages.reduce((sum, pkg) => sum + pkg.total, 0));
  assert.equal(index.monthly.reduce((sum, [, value]) => sum + value, 0), index.lifetimeTotal);
  assert.equal(index.firstRecordedDownload.date, "2015-02-27");
  assert.equal(index.firstRecordedDownload.downloads, 35);
  assert.equal(index.firstRecordedDownload.packages.reduce((sum, pkg) => sum + pkg.downloads, 0), 35);
  assert.equal(index.period.availableFrom, "2015-01-10");
  assert.equal(index.dataQuality.officialTotal, index.lifetimeTotal);
  assert.equal(index.dataQuality.correction, index.dataQuality.officialTotal - index.dataQuality.npmStatReferenceTotal);

  for (const pkg of index.packages) {
    assert.equal(pkg.annual.reduce((sum, [, value]) => sum + value, 0), pkg.total);
    assert.equal(pkg.monthly.reduce((sum, [, value]) => sum + value, 0), pkg.total);
  }

  for (const year of years) {
    assert.deepEqual(year.authors, index.authors);
    assert.equal(year.dates.length, year.overall.length);
    assert.equal(year.packages.length, index.packageCount);
    assert.deepEqual(year.packages.map((pkg) => pkg.name).sort(), packageNames);
    assert.equal(year.total, year.overall.reduce((sum, value) => sum + value, 0));
    assert.equal(year.total, year.packages.reduce((sum, pkg) => sum + pkg.total, 0));
    assert.equal(year.dataQuality.officialTotal, year.total);
    assert.ok(year.overall.every((value) => Number.isSafeInteger(value) && value >= 0));
    assert.ok(year.dates.every((date, index) => date.startsWith(`${year.year}-`) && (!index || date > year.dates[index - 1])));
    assert.ok(year.packages.every((pkg) => pkg.downloads.length === year.dates.length));
    assert.ok(year.packages.every((pkg) => pkg.downloads.every((value) => Number.isSafeInteger(value) && value >= 0)));
    assert.ok(year.packages.every((pkg) => pkg.total === pkg.downloads.reduce((sum, value) => sum + value, 0)));
  }

  const unavailable = years.find((year) => year.year === 2014);
  const firstAvailable = years.find((year) => year.year === 2015);
  const current = years.at(-1);
  const dbopfs = index.packages.find((pkg) => pkg.name === "dbopfs");
  assert.deepEqual(unavailable.dates, []);
  assert.equal(unavailable.period.availableFrom, null);
  assert.equal(firstAvailable.dates[0], "2015-01-10");
  assert.equal(current.period.partial, current.period.requestedUntil !== `${current.year}-12-31`);
  assert.deepEqual(dbopfs.authors, ["thewizardnexus"]);
  assert.ok(dbopfs.total > 0);
});

test("profile README and site expose the telemetry experience", async () => {
  const [readme, html, script, styles, svg] = await Promise.all([
    read("README.md"),
    read("index.html"),
    read("app.js"),
    read("styles.css"),
    read("assets/npm-downloads.svg"),
  ]);

  assert.match(readme, /assets\/npm-downloads\.svg/);
  assert.match(readme, /riaevangelist\.github\.io\/RIAEvangelist/);
  assert.match(html, /id="package-grid"/);
  assert.match(html, /id="repo-grid"/);
  assert.match(html, /id="repo-owner"/);
  assert.match(html, /id="history-chart"/);
  assert.match(html, /id="history-range"/);
  assert.match(html, /id="history-table-foot"/);
  assert.match(script, /data\/npm-stats\.json/);
  assert.match(script, /data\/repos\.json/);
  assert.match(script, /data\/npm-history\/index\.json/);
  assert.match(script, /averageStartMonth = "2021-01"/);
  assert.match(script, /Average since 2021/);
  assert.match(script, /historyTableFoot\.innerHTML/);
  assert.ok(script.indexOf("initializeHistory();") < script.indexOf("[state.npm, state.repos]"));
  assert.match(styles, /#history-chart\[hidden\]/);
  assert.match(readme, /thewizardnexus/);
  assert.match(readme, /recorded NPM downloads since February 27, 2015/);
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
