import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY_DIR = path.join(ROOT, "data", "npm-history");
const INDEX_PATH = path.join(HISTORY_DIR, "index.json");
const CURRENT_SNAPSHOT_PATH = path.join(ROOT, "data", "npm-stats.json");
const README_PATH = path.join(ROOT, "README.md");
const AUTHORS = ["riaevangelist", "thewizardnexus"];
const FIRST_REQUEST_YEAR = 2014;
const NPM_HISTORY_FLOOR = "2015-01-10";
const USER_AGENT = "RIAEvangelist-profile-history/1.0";
let expectedPackages = [];

const force = process.argv.includes("--force");
const allYears = process.argv.includes("--all");
const yearArgument = process.argv.find((argument) => argument.startsWith("--year="));
const untilArgument = process.argv.find((argument) => argument.startsWith("--until="));
const staleHoursArgument = process.argv.find((argument) => argument.startsWith("--max-age-hours="));
const maxAgeHours = staleHoursArgument ? Number(staleHoursArgument.split("=")[1]) : 0;

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function yesterdayUtc() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return isoDate(date);
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && isoDate(new Date(`${value}T00:00:00Z`)) === value;
}

const until = untilArgument ? untilArgument.split("=")[1] : yesterdayUtc();
if (!validDate(until)) throw new Error(`Invalid --until date: ${until}`);
const finalYear = Number(until.slice(0, 4));
if (finalYear < FIRST_REQUEST_YEAR) throw new Error(`--until must be ${FIRST_REQUEST_YEAR} or later.`);

const requestedYear = yearArgument ? Number(yearArgument.split("=")[1]) : null;
if (requestedYear && (!Number.isInteger(requestedYear) || requestedYear < FIRST_REQUEST_YEAR || requestedYear > finalYear)) {
  throw new Error(`--year must be between ${FIRST_REQUEST_YEAR} and ${finalYear}.`);
}

function calendarDates(from, through) {
  if (!from || !through || from > through) return [];
  const dates = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${through}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function fetchJson(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 750 * (2 ** (attempt - 1))));
    }
  }
  throw new Error(`Unable to fetch ${url}: ${lastError?.message || lastError}`);
}

function sourceUrl(author, year, through) {
  return `https://npm-stat.com/api/download-counts?author=${author}&from=${year}-01-01&until=${through}`;
}

function rangeChunks(from, through, maximumDays = 365) {
  const chunks = [];
  let cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${through}T00:00:00Z`);
  while (cursor <= end) {
    const chunkStart = isoDate(cursor);
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + maximumDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push([chunkStart, isoDate(chunkEnd)]);
    cursor = new Date(chunkEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return chunks;
}

function normalizeCount(value, packageName, date) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Invalid download count for ${packageName} on ${date}.`);
  }
  return count;
}

async function createYearSnapshot(year, generatedAt) {
  const requestedThrough = year === finalYear ? until : `${year}-12-31`;
  const referenceUrls = AUTHORS.map((author) => sourceUrl(author, year, requestedThrough));
  const responses = [];
  for (const url of referenceUrls) {
    console.log(`Fetching ${year}: ${url}`);
    const response = await fetchJson(url);
    if (!response || typeof response !== "object" || Array.isArray(response)) {
      throw new Error(`Unexpected npm-stat response for ${year}.`);
    }
    responses.push(response);
  }

  const reference = new Map();
  responses.forEach((response, index) => {
    for (const [name, points] of Object.entries(response)) {
      if (!reference.has(name)) reference.set(name, points);
    }
    const expectedForAuthor = expectedPackages
      .filter((pkg) => pkg.authors.includes(AUTHORS[index]))
      .map((pkg) => pkg.name);
    const missing = expectedForAuthor.filter((name) => !Object.hasOwn(response, name));
    if (missing.length) {
      throw new Error(`npm-stat omitted expected ${AUTHORS[index]} packages for ${year}: ${missing.join(", ")}`);
    }
  });
  const names = expectedPackages.map((pkg) => pkg.name);
  const unexpected = [...reference.keys()].filter((name) => !names.includes(name));
  if (unexpected.length) {
    throw new Error(`npm-stat returned packages absent from data/npm-stats.json: ${unexpected.join(", ")}. Refresh current telemetry first.`);
  }
  if (!names.length) throw new Error(`npm-stat returned no packages for ${year}.`);
  const packageAuthors = new Map(expectedPackages.map((pkg) => [pkg.name, pkg.authors]));

  const from = year < 2015 ? null : year === 2015 ? NPM_HISTORY_FLOOR : `${year}-01-01`;
  const dates = calendarDates(from, requestedThrough);
  const officialPoints = new Map(names.map((name) => [name, new Map()]));
  const officialUrls = [];
  if (dates.length) {
    const encodedNames = names.map(encodeURIComponent).join(",");
    for (const [chunkStart, chunkEnd] of rangeChunks(dates[0], dates.at(-1))) {
      const officialUrl = `https://api.npmjs.org/downloads/range/${chunkStart}:${chunkEnd}/${encodedNames}`;
      officialUrls.push(officialUrl);
      const official = await fetchJson(officialUrl);
      for (const name of names) {
        const series = official[name]?.downloads;
        if (!Array.isArray(series)) throw new Error(`Official NPM history is missing ${name} for ${chunkStart}:${chunkEnd}.`);
        for (const point of series) {
          if (!validDate(point.day)) throw new Error(`Official NPM history returned an invalid date for ${name}.`);
          officialPoints.get(name).set(point.day, normalizeCount(point.downloads, name, point.day));
        }
      }
    }
  }

  let referenceTotal = 0;
  let referenceMissingPointCount = 0;
  let correctedPointCount = 0;
  const packages = names.map((name) => {
    const points = reference.get(name);
    if (!points || typeof points !== "object" || Array.isArray(points)) {
      throw new Error(`Unexpected series for ${name} in ${year}.`);
    }
    const downloads = dates.map((date) => {
      if (!officialPoints.get(name).has(date)) throw new Error(`Official NPM history is missing ${name} on ${date}.`);
      const officialCount = officialPoints.get(name).get(date);
      if (!Object.hasOwn(points, date)) {
        referenceMissingPointCount += 1;
      } else {
        const referenceCount = normalizeCount(points[date], name, date);
        referenceTotal += referenceCount;
        if (referenceCount !== officialCount) correctedPointCount += 1;
      }
      return officialCount;
    });
    return {
      name,
      authors: packageAuthors.get(name),
      total: downloads.reduce((sum, value) => sum + value, 0),
      downloads,
    };
  });

  const overall = dates.map((_, index) => packages.reduce((sum, pkg) => sum + pkg.downloads[index], 0));
  const total = overall.reduce((sum, value) => sum + value, 0);
  const peakValue = Math.max(...overall, 0);
  const peakIndex = peakValue ? overall.indexOf(peakValue) : -1;
  const firstIndex = overall.findIndex((value) => value > 0);

  return {
    schemaVersion: 1,
    authors: AUTHORS,
    year,
    generatedAt,
    source: {
      referenceProvider: "npm-stat.com",
      referenceUrls,
      authority: "NPM download-count API",
      officialUrls,
      responsePackageCount: names.length,
    },
    period: {
      requestedFrom: `${year}-01-01`,
      requestedUntil: requestedThrough,
      availableFrom: dates[0] || null,
      availableUntil: dates.at(-1) || null,
      partial: requestedThrough !== `${year}-12-31`,
    },
    dates,
    overall,
    total,
    dataQuality: {
      officialTotal: total,
      npmStatReferenceTotal: referenceTotal,
      correction: total - referenceTotal,
      correctedPointCount,
      referenceMissingPointCount,
      status: dates.length ? "officially reconciled" : "unavailable before NPM history floor",
    },
    activePackageCount: packages.filter((pkg) => pkg.total > 0).length,
    peakDay: peakIndex >= 0 ? { date: dates[peakIndex], downloads: peakValue } : null,
    firstRecordedDay: firstIndex >= 0 ? { date: dates[firstIndex], downloads: overall[firstIndex] } : null,
    packages,
  };
}

function add(map, key, value) {
  map.set(key, (map.get(key) || 0) + value);
}

function sortedEntries(map) {
  return [...map.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function buildIndex(years, generatedAt) {
  const overallMonthly = new Map();
  const packageTotals = new Map();
  let lifetimeTotal = 0;
  let referenceTotal = 0;
  let correctedPointCount = 0;
  let referenceMissingPointCount = 0;
  let firstRecordedDownload = null;
  let peakDay = null;

  for (const year of years) {
    lifetimeTotal += year.total;
    referenceTotal += year.dataQuality.npmStatReferenceTotal;
    correctedPointCount += year.dataQuality.correctedPointCount;
    referenceMissingPointCount += year.dataQuality.referenceMissingPointCount;
    year.dates.forEach((date, index) => {
      const downloads = year.overall[index];
      add(overallMonthly, date.slice(0, 7), downloads);
      if (downloads > 0 && (!firstRecordedDownload || date < firstRecordedDownload.date)) {
        firstRecordedDownload = {
          date,
          downloads,
          packages: year.packages
            .map((pkg) => ({ name: pkg.name, downloads: pkg.downloads[index] }))
            .filter((pkg) => pkg.downloads > 0)
            .sort((left, right) => right.downloads - left.downloads || left.name.localeCompare(right.name)),
        };
      }
      if (downloads > 0 && (!peakDay || downloads > peakDay.downloads)) peakDay = { date, downloads };
    });

    for (const pkg of year.packages) {
      if (!packageTotals.has(pkg.name)) {
        packageTotals.set(pkg.name, { name: pkg.name, authors: pkg.authors, total: 0, annual: new Map(), monthly: new Map() });
      }
      const summary = packageTotals.get(pkg.name);
      summary.authors = [...new Set([...summary.authors, ...pkg.authors])].sort((left, right) => left.localeCompare(right));
      summary.total += pkg.total;
      summary.annual.set(String(year.year), pkg.total);
      year.dates.forEach((date, index) => add(summary.monthly, date.slice(0, 7), pkg.downloads[index]));
    }
  }

  const yearNumbers = years.map((year) => year.year);
  const packages = [...packageTotals.values()]
    .map((pkg) => ({
      name: pkg.name,
      authors: pkg.authors,
      total: pkg.total,
      annual: yearNumbers.map((year) => [String(year), pkg.annual.get(String(year)) || 0]),
      monthly: sortedEntries(pkg.monthly),
    }))
    .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name));

  return {
    schemaVersion: 1,
    authors: AUTHORS,
    generatedAt,
    source: {
      referenceProvider: "npm-stat.com",
      referenceHomepage: "https://www.npm-stat.com/",
      referenceQuery: "https://npm-stat.com/api/download-counts?author={author}&from={from}&until={until}",
      authority: "Official NPM download-count API",
      authorityDocumentation: "https://github.com/npm/registry/blob/main/docs/download-counts.md",
      availableFrom: NPM_HISTORY_FLOOR,
      semantics: "Successful package-tarball downloads for packages currently returned for these owned maintainer accounts; not unique users or verified installations.",
      quality: "Annual npm-stat reference series are reconciled against the official NPM range API before publication.",
    },
    period: {
      requestedFrom: `${FIRST_REQUEST_YEAR}-01-01`,
      availableFrom: NPM_HISTORY_FLOOR,
      through: years.map((year) => year.period.availableUntil).filter(Boolean).sort().at(-1) || null,
    },
    lifetimeTotal,
    dataQuality: {
      officialTotal: lifetimeTotal,
      npmStatReferenceTotal: referenceTotal,
      correction: lifetimeTotal - referenceTotal,
      correctedPointCount,
      referenceMissingPointCount,
      status: "officially reconciled",
    },
    packageCount: packages.length,
    firstRecordedDownload,
    peakDay,
    monthly: sortedEntries(overallMonthly),
    years: years.map((year) => ({
      year: year.year,
      file: `${year.year}.json`,
      total: year.total,
      availableFrom: year.period.availableFrom,
      availableUntil: year.period.availableUntil,
      partial: year.period.partial,
      activePackageCount: year.activePackageCount,
      peakDay: year.peakDay,
    })),
    packages,
  };
}

async function readIndex() {
  try {
    return JSON.parse(await readFile(INDEX_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function readYearFiles() {
  const files = (await readdir(HISTORY_DIR)).filter((name) => /^\d{4}\.json$/.test(name));
  const years = await Promise.all(files.map(async (name) => JSON.parse(await readFile(path.join(HISTORY_DIR, name), "utf8"))));
  return years.filter((year) => year.year >= FIRST_REQUEST_YEAR && year.year <= finalYear).sort((a, b) => a.year - b.year);
}

function packageInventory(packages) {
  return packages
    .map((pkg) => `${pkg.name}:${[...(pkg.authors || [])].sort((left, right) => left.localeCompare(right)).join(",")}`)
    .sort((left, right) => left.localeCompare(right));
}

function sameInventory(left, right) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function fullNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function billionFloor(value) {
  return (Math.floor(value / 10_000_000) / 100).toFixed(2);
}

function longDate(value) {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

async function updateReadme(index) {
  const start = "<!-- profile-npm-history:start -->";
  const end = "<!-- profile-npm-history:end -->";
  const block = `${start}\n<p align="center">\n  <a href="https://riaevangelist.github.io/RIAEvangelist/"><strong>Explore the live open-source dashboard →</strong></a><br>\n  <strong>${billionFloor(index.lifetimeTotal)}+ billion recorded NPM package downloads since ${longDate(index.firstRecordedDownload.date)}</strong>\n</p>\n${end}`;
  const readme = await readFile(README_PATH, "utf8");
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  const updated = pattern.test(readme)
    ? readme.replace(pattern, block)
    : readme.replace("<!-- profile-telemetry-counts:end -->", `<!-- profile-telemetry-counts:end -->\n\n${block}`);
  await writeFile(README_PATH, updated, "utf8");
}

await mkdir(HISTORY_DIR, { recursive: true });
const currentSnapshot = JSON.parse(await readFile(CURRENT_SNAPSHOT_PATH, "utf8"));
if (!Array.isArray(currentSnapshot.packages) || !currentSnapshot.packages.length) {
  throw new Error("data/npm-stats.json does not contain a maintained package inventory.");
}
expectedPackages = currentSnapshot.packages
  .map((pkg) => ({ name: pkg.name, authors: [...new Set(pkg.trackedMaintainers || [])].sort((left, right) => left.localeCompare(right)) }))
  .sort((left, right) => left.name.localeCompare(right.name));
if (expectedPackages.some((pkg) => !pkg.authors.length || pkg.authors.some((author) => !AUTHORS.includes(author)))) {
  throw new Error("data/npm-stats.json contains a package without a recognized tracked maintainer.");
}
if (new Set(expectedPackages.map((pkg) => pkg.name)).size !== expectedPackages.length) {
  throw new Error("data/npm-stats.json contains duplicate package names.");
}
const existingIndex = await readIndex();
if (!force && !allYears && !requestedYear && maxAgeHours > 0 && existingIndex) {
  const age = Date.now() - Date.parse(existingIndex.generatedAt);
  if (Number.isFinite(age) && age < maxAgeHours * 60 * 60 * 1000 && existingIndex.period?.through >= until) {
    console.log(`NPM history is fresh (${Math.round(age / 60000)} minutes old); no update needed.`);
    process.exit(0);
  }
}

const generatedAt = new Date().toISOString();
let targets = allYears || (!existingIndex && !requestedYear)
  ? Array.from({ length: finalYear - FIRST_REQUEST_YEAR + 1 }, (_, index) => FIRST_REQUEST_YEAR + index)
  : [requestedYear || finalYear];

for (const year of targets) {
  const snapshot = await createYearSnapshot(year, generatedAt);
  await writeFile(path.join(HISTORY_DIR, `${year}.json`), `${JSON.stringify(snapshot)}\n`, "utf8");
}

if (!allYears && !requestedYear && existingIndex) {
  const current = JSON.parse(await readFile(path.join(HISTORY_DIR, `${finalYear}.json`), "utf8"));
  const currentInventory = packageInventory(current.packages);
  const previousInventory = packageInventory(existingIndex.packages);
  if (!sameInventory(currentInventory, previousInventory)) {
    console.log("Package inventory changed; refreshing closed calendar years.");
    targets = Array.from({ length: finalYear - FIRST_REQUEST_YEAR }, (_, index) => FIRST_REQUEST_YEAR + index);
    for (const year of targets) {
      const snapshot = await createYearSnapshot(year, generatedAt);
      await writeFile(path.join(HISTORY_DIR, `${year}.json`), `${JSON.stringify(snapshot)}\n`, "utf8");
    }
  }
}

let years = await readYearFiles();
const missingYears = Array.from({ length: finalYear - FIRST_REQUEST_YEAR + 1 }, (_, index) => FIRST_REQUEST_YEAR + index)
  .filter((year) => !years.some((snapshot) => snapshot.year === year));
for (const year of missingYears) {
  const snapshot = await createYearSnapshot(year, generatedAt);
  await writeFile(path.join(HISTORY_DIR, `${year}.json`), `${JSON.stringify(snapshot)}\n`, "utf8");
}
years = await readYearFiles();

const index = buildIndex(years, generatedAt);
if (!index.firstRecordedDownload) throw new Error("No non-zero NPM download day was found in the available history.");
await writeFile(INDEX_PATH, `${JSON.stringify(index)}\n`, "utf8");
await updateReadme(index);

console.log(`Recorded ${fullNumber(index.lifetimeTotal)} downloads across ${index.packageCount} packages through ${index.period.through}.`);
console.log(`First recorded day: ${index.firstRecordedDownload.date} (${fullNumber(index.firstRecordedDownload.downloads)} downloads).`);
