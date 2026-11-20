import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY_DIR = path.join(ROOT, "data", "npm-history");
const INDEX_PATH = path.join(HISTORY_DIR, "index.json");
const CURRENT_SNAPSHOT_PATH = path.join(ROOT, "data", "npm-stats.json");
const README_PATH = path.join(ROOT, "README.md");
const CHART_DIR = path.join(ROOT, "assets", "npm-history-chart");
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

function historyChart(index) {
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
  const month = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const monthLabel = (value) => month.format(new Date(`${value}-01T00:00:00Z`));
  const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const first = index.firstRecordedDownload;
  const firstPackages = first.packages.map((pkg) => `${pkg.name} ${fullNumber(pkg.downloads)}`).join(" · ");
  const maximum = Math.max(...index.monthly.map(([, value]) => value), 0);
  const ceiling = maximum > 0 ? maximum * 1.08 : 1;
  const plot = { left: 108, right: 1260, top: 346, bottom: 686 };
  const points = index.monthly.map(([period, value], position) => ({
    period,
    value,
    x: plot.left + (index.monthly.length === 1 ? 0.5 : position / (index.monthly.length - 1)) * (plot.right - plot.left),
    y: plot.bottom - value / ceiling * (plot.bottom - plot.top),
  }));
  const peak = points.reduce((best, point) => !best || point.value > best.value ? point : best, null);
  const line = points.map((point, position) => `${position ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = `${line} L${points.at(-1).x.toFixed(2)},${plot.bottom} L${points[0].x.toFixed(2)},${plot.bottom} Z`;
  const grid = Array.from({ length: 5 }, (_, tick) => {
    const y = plot.top + (plot.bottom - plot.top) * tick / 4;
    return `<path d="M${plot.left},${y} H${plot.right}" stroke="#ffffff" stroke-opacity=".075"/>
    <text x="94" y="${y + 5}" text-anchor="end" fill="#a39db7" font-size="15">${compact.format(Math.round(ceiling * (1 - tick / 4)))}</text>`;
  }).join("\n");
  const labelPositions = new Set(Array.from({ length: 6 }, (_, position) => Math.round(position / 5 * (points.length - 1))));
  const labels = [...labelPositions].map((position) => `<text x="${points[position].x.toFixed(2)}" y="719" text-anchor="middle" fill="#a39db7" font-size="15">${monthLabel(points[position].period)}</text>`).join("\n");
  const through = longDate(index.period.through);
  const nextDay = new Date(`${index.period.through}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const partialMonth = isoDate(nextDay).slice(0, 7) === index.period.through.slice(0, 7);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="824" viewBox="0 0 1320 824" role="img" aria-labelledby="title description" data-through="${index.period.through}">
  <title id="title">All modules: ${fullNumber(index.lifetimeTotal)} recorded NPM downloads through ${through}</title>
  <desc id="description">Monthly download trend from ${longDate(index.period.availableFrom)} through ${through}, including all ${index.packageCount} contributing modules. First recorded downloads: ${longDate(first.date)}, ${fullNumber(first.downloads)} downloads. Peak month: ${monthLabel(peak.period)}, ${fullNumber(peak.value)} downloads. ${partialMonth ? "Latest month is partial." : "Latest month is complete."}</desc>
  <defs>
    <linearGradient id="line" x1="0" x2="1"><stop stop-color="#ff4fa7"/><stop offset=".52" stop-color="#8c6cff"/><stop offset="1" stop-color="#39e6e6"/></linearGradient>
    <linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#8c6cff" stop-opacity=".38"/><stop offset=".58" stop-color="#ff4fa7" stop-opacity=".12"/><stop offset="1" stop-color="#39e6e6" stop-opacity=".01"/></linearGradient>
    <linearGradient id="banner"><stop stop-color="#211529"/><stop offset="1" stop-color="#101726"/></linearGradient>
  </defs>
  <rect width="1320" height="824" rx="24" fill="#080812"/>
  <g font-family="Arial, Helvetica, sans-serif">
    <rect x="24" y="24" width="1272" height="142" rx="18" fill="url(#banner)" stroke="#493354"/>
    <text x="52" y="57" fill="#ff70b7" font-size="15" font-weight="700" letter-spacing="3">FIRST RECORDED DOWNLOAD</text>
    <text x="52" y="101" fill="#f5f1ff" font-size="36" font-weight="700">${longDate(first.date)}</text>
    <text x="52" y="136" fill="#b9b2ce" font-size="17">${fullNumber(first.downloads)} downloads across ${first.packages.length} modules: ${xml(firstPackages)}</text>
    <rect x="24" y="190" width="1272" height="610" rx="18" fill="#0d0d1b" stroke="#292438"/>
    <text x="52" y="229" fill="#ff70b7" font-size="15" font-weight="700" letter-spacing="3">RECORDED LIFETIME</text>
    <text x="52" y="276" fill="#f5f1ff" font-size="36" font-weight="700">All modules</text>
    <text x="1260" y="278" text-anchor="end" fill="#c6ff4a" font-size="48" font-weight="700">${fullNumber(index.lifetimeTotal)}</text>
    <text x="52" y="309" fill="#b9b2ce" font-size="17">${longDate(index.period.availableFrom)} to ${through} · monthly trend</text>
    <text x="1260" y="309" text-anchor="end" fill="#b9b2ce" font-size="16">RECORDED DOWNLOADS</text>
    <g font-family="Consolas, monospace">${grid}${labels}</g>
    <path d="${area}" fill="url(#area)"/>
    <path d="${line}" fill="none" stroke="url(#line)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M${peak.x.toFixed(2)},${plot.top} V${plot.bottom}" stroke="#c6ff4a" stroke-opacity=".36"/>
    <circle cx="${peak.x.toFixed(2)}" cy="${peak.y.toFixed(2)}" r="6" fill="#c6ff4a" stroke="#080812" stroke-width="2"><title>${monthLabel(peak.period)}: ${fullNumber(peak.value)} downloads</title></circle>
    <path d="M52,744 H1268" stroke="#292438"/>
    <text x="52" y="777" fill="#b9b2ce" font-size="16">${points.length} months · ${index.packageCount} contributing modules · Official NPM API</text>
    <text x="1260" y="777" text-anchor="end" fill="#39e6e6" font-size="16">${partialMonth ? "Latest month is partial · " : ""}Refreshed daily</text>
  </g>
</svg>\n`;
}

async function updateProfilePresentation(index) {
  const start = "<!-- profile-npm-history:start -->";
  const end = "<!-- profile-npm-history:end -->";
  const block = `${start}\n<p align="center">\n  <a href="https://riaevangelist.github.io/RIAEvangelist/"><strong>Explore the live open-source dashboard →</strong></a><br>\n  <strong>${billionFloor(index.lifetimeTotal)}+ billion recorded NPM package downloads since ${longDate(index.firstRecordedDownload.date)}</strong>\n</p>\n${end}`;
  const readme = await readFile(README_PATH, "utf8");
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  const updated = pattern.test(readme)
    ? readme.replace(pattern, block)
    : readme.replace("<!-- profile-telemetry-counts:end -->", `<!-- profile-telemetry-counts:end -->\n\n${block}`);
  const chartStart = "<!-- profile-npm-history-chart:start -->";
  const chartEnd = "<!-- profile-npm-history-chart:end -->";
  // A versioned filename survives GitHub's raw-image redirects and normal image caching.
  const chartFilename = `${index.generatedAt.replaceAll(":", "-")}.svg`;
  const chartUrl = `assets/npm-history-chart/${chartFilename}`;
  const chartBlock = `${chartStart}\n<p align="center">\n  <a href="https://riaevangelist.github.io/RIAEvangelist/#history">\n    <img src="${chartUrl}" width="100%" alt="All modules: ${fullNumber(index.lifetimeTotal)} recorded NPM downloads through ${longDate(index.period.through)}">\n  </a>\n</p>\n\n<p align="center"><sub>Automatically refreshed daily. Downloads through ${longDate(index.period.through)}. Open the dashboard to explore each module and year.</sub></p>\n${chartEnd}`;
  await mkdir(CHART_DIR, { recursive: true });
  await writeFile(path.join(CHART_DIR, chartFilename), historyChart(index), "utf8");
  await writeFile(README_PATH, updated.replace(new RegExp(`${chartStart}[\\s\\S]*?${chartEnd}`), chartBlock), "utf8");
  // Keep the previous chart for cached README views; Git retains older revisions.
  const previousCharts = (await readdir(CHART_DIR)).filter((name) => name !== chartFilename && /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z\.svg$/.test(name)).sort();
  const keepPrevious = previousCharts.at(-1);
  await Promise.all(previousCharts.filter((name) => name !== keepPrevious).map((name) => unlink(path.join(CHART_DIR, name))));
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
    await updateProfilePresentation(existingIndex);
    console.log(`NPM history is fresh (${Math.round(age / 60000)} minutes old); chart and README refreshed from the archive.`);
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
await updateProfilePresentation(index);

console.log(`Recorded ${fullNumber(index.lifetimeTotal)} downloads across ${index.packageCount} packages through ${index.period.through}.`);
console.log(`First recorded day: ${index.firstRecordedDownload.date} (${fullNumber(index.firstRecordedDownload.downloads)} downloads).`);
