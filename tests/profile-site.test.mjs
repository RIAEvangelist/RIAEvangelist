import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(ROOT, relativePath), "utf8");
const SITE_BASE = "https://riaevangelist.github.io/RIAEvangelist";
const MUSIC_PAGE_SIZE = 8;
const CATALOG_MUSIC_IDS = [
  "991043380511",
  "057829997363",
  "057829695757",
  "057829695276",
  "057829531826",
  "055855317322",
  "056870317687",
  "057829090484",
  "057829090965",
  "055855493170",
  "056870580272",
  "055905207047",
  "056870653440",
  "990591026711",
  "055855208002",
  "056870328232",
  "056870046389",
  "055905804222",
  "055905520306",
  "055905545057",
  "055855935991",
  "055855925855",
  "055855493026",
  "055855803566",
  "055855503190",
  "055855934024",
  "055855877093",
  "055855368287",
  "055905426578",
  "056870029849",
  "055905804314",
  "990591026773",
  "055855492982",
  "055855934178",
  "055905224013",
  "055905278726",
];
const PROFILE_MUSIC_IDS = [
  "991043380511",
  "057829997363",
  "057829695757",
  "057829695276",
  "057829531826",
  "057829090484",
  "057829090965",
  "055855493170",
  "056870653440",
  "056870580272",
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function assertHttps(value, label) {
  const url = new URL(value);
  assert.equal(url.protocol, "https:", `${label} must use HTTPS`);
  assert.ok(url.hostname, `${label} must have a hostname`);
}

function extractAttribute(html, pattern, label) {
  const match = html.match(pattern);
  assert.ok(match, `Missing ${label}`);
  return match[1];
}

function assertNoRootRelativeUrls(html, label) {
  assert.doesNotMatch(html, /\b(?:href|src)=["']\/(?!\/)/, `${label} contains a root-relative URL`);
}

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
  assert.match(readme, /assets\/profile-header\.png/);
  assert.match(readme, /assets\/npm-history-chart\.png/);
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
  assert.match(readme, /1\.56\+ billion recorded NPM package downloads since February 27, 2015/);
  assert.ok(readme.indexOf("profile-npm-history:start") < readme.indexOf("# Roshi _ _"));
  assert.match(svg, /WEEKLY/);
  assert.match(svg, /MONTHLY/);
  assert.match(svg, /YEARLY/);
  assert.match(svg, /js-message/);
});

test("music catalog is complete, unique, secure, and coherently collected", async () => {
  const catalog = JSON.parse(await read("data/music.json"));
  const ids = catalog.releases.map((release) => release.id);
  const slugs = catalog.releases.map((release) => release.slug);
  const landrUrls = catalog.releases.map((release) => release.landrUrl);
  const collectionSlugs = catalog.collections.map((collection) => collection.slug);
  const releaseById = new Map(catalog.releases.map((release) => [release.id, release]));
  const collectionBySlug = new Map(catalog.collections.map((collection) => [collection.slug, collection]));

  assert.equal(catalog.releases.length, 36);
  assert.deepEqual([...ids].sort(), [...CATALOG_MUSIC_IDS].sort());
  assert.equal(new Set(ids).size, 36);
  assert.equal(new Set(slugs).size, 36);
  assert.equal(new Set(landrUrls).size, 36);
  assert.equal(new Set(collectionSlugs).size, catalog.collections.length);
  assert.ok(catalog.collections.length > 0);

  const typeCounts = catalog.releases.reduce((counts, release) => {
    const type = release.type.toLowerCase();
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
  assert.equal(typeCounts.single, 31);
  assert.equal(typeCounts.ep, 3);
  assert.equal(typeCounts.album, 2);

  const profileIds = catalog.releases.filter((release) => release.profileFeature).map((release) => release.id).sort();
  assert.deepEqual(profileIds, [...PROFILE_MUSIC_IDS].sort());

  for (const release of catalog.releases) {
    assert.match(release.id, /^\d{12}$/);
    assert.match(release.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(release.landrUrl, `https://artists.landr.com/${release.id}`);
    assert.match(release.releaseDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(release.title.trim());
    assert.ok(release.artist.trim());
    assert.ok(release.summary.trim());
    assertHttps(release.landrUrl, `${release.id} LANDR URL`);
    assertHttps(release.artwork, `${release.id} artwork`);
    assert.ok(release.services.length > 0, `${release.id} must have at least one listening service`);
    assert.equal(new Set(release.services.map(({ service }) => service)).size, release.services.length);
    assert.ok(release.collectionSlugs.length > 0, `${release.id} must belong to a collection`);
    assert.equal(new Set(release.collectionSlugs).size, release.collectionSlugs.length);

    for (const { service, url } of release.services) {
      assert.match(service, /^[a-z0-9]+$/);
      assertHttps(url, `${release.id}/${service}`);
    }
    for (const collectionSlug of release.collectionSlugs) {
      const collection = collectionBySlug.get(collectionSlug);
      assert.ok(collection, `Unknown collection ${collectionSlug} on ${release.id}`);
      assert.ok(collection.releaseIds.includes(release.id), `${release.id} is missing from ${collectionSlug}`);
    }
  }

  for (const collection of catalog.collections) {
    assert.match(collection.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(collection.title.trim());
    assert.ok(collection.description.trim());
    assert.ok(collection.releaseIds.length > 0, `${collection.slug} must include releases`);
    assert.equal(new Set(collection.releaseIds).size, collection.releaseIds.length);
    for (const id of collection.releaseIds) {
      const release = releaseById.get(id);
      assert.ok(release, `Unknown release ${id} in ${collection.slug}`);
      assert.ok(release.collectionSlugs.includes(collection.slug), `${collection.slug} is missing from ${id}`);
    }
  }
});

test("generated music pages form a complete page-first catalog", async () => {
  const catalog = JSON.parse(await read("data/music.json"));
  const pageCount = Math.ceil(catalog.releases.length / MUSIC_PAGE_SIZE);
  const paginationPaths = Array.from({ length: pageCount }, (_, index) => (
    index === 0 ? "music/releases/index.html" : `music/releases/page/${index + 1}/index.html`
  ));
  const detailPaths = catalog.releases.map((release) => `music/releases/${release.slug}/index.html`);
  const collectionPaths = catalog.collections.map((collection) => `music/collections/${collection.slug}/index.html`);
  const authorshipPaths = ["music/process/index.html", "music/origins/index.html"];
  const expectedPaths = [
    "music/index.html",
    ...authorshipPaths,
    ...paginationPaths,
    "music/collections/index.html",
    ...detailPaths,
    ...collectionPaths,
  ];
  const generatedManifest = JSON.parse(await read("music/.generated-pages.json"));
  const pageEntries = await Promise.all(expectedPaths.map(async (relativePath) => [relativePath, await read(relativePath)]));
  const pages = new Map(pageEntries);

  assert.equal(pageCount, 5);
  assert.deepEqual([...generatedManifest.generated].sort(), [...expectedPaths].sort());
  assert.match(pages.get("music/index.html"), />36</);
  assert.match(pages.get("music/index.html"), /Short pages\. Deep catalog\./);

  for (const relativePath of authorshipPaths) {
    const route = relativePath.replace(/index\.html$/, "");
    const html = pages.get(relativePath);
    assert.ok(html.includes(`<link rel="canonical" href="${SITE_BASE}/${route}">`));
    assertNoRootRelativeUrls(html, relativePath);
  }

  const paginationPages = paginationPaths.map((relativePath) => pages.get(relativePath));
  for (const release of catalog.releases) {
    const route = `music/releases/${release.slug}/`;
    assert.equal(paginationPages.filter((html) => html.includes(route)).length, 1, `${release.id} must appear on one catalog page`);
  }

  const detailTitles = new Set();
  const detailCanonicals = new Set();
  for (const release of catalog.releases) {
    const relativePath = `music/releases/${release.slug}/index.html`;
    const html = pages.get(relativePath);
    const title = extractAttribute(html, /<title>([^<]+)<\/title>/, `${release.id} title`);
    const canonical = extractAttribute(html, /<link rel="canonical" href="([^"]+)">/, `${release.id} canonical`);

    assert.equal(title, `${escapeHtml(release.title)} — ${escapeHtml(release.artist)}`);
    assert.equal(canonical, `${SITE_BASE}/music/releases/${release.slug}/`);
    assert.ok(!detailTitles.has(title), `Duplicate release page title: ${title}`);
    assert.ok(!detailCanonicals.has(canonical), `Duplicate release canonical: ${canonical}`);
    detailTitles.add(title);
    detailCanonicals.add(canonical);
    assert.ok(html.includes(`<meta property="og:image" content="${escapeHtml(release.artwork)}">`));
    assert.ok(html.includes(`href="${escapeHtml(release.landrUrl)}"`));
    for (const { service, url } of release.services) {
      assert.ok(html.includes(`href="${escapeHtml(url)}"`), `${release.id} is missing its ${service} link`);
    }
    assertNoRootRelativeUrls(html, relativePath);
  }

  for (const collection of catalog.collections) {
    const relativePath = `music/collections/${collection.slug}/index.html`;
    const html = pages.get(relativePath);
    assert.ok(html.includes(`<link rel="canonical" href="${SITE_BASE}/music/collections/${collection.slug}/">`));
    for (const id of collection.releaseIds) {
      const release = catalog.releases.find((candidate) => candidate.id === id);
      assert.ok(html.includes(`music/releases/${release.slug}/`), `${collection.slug} is missing ${id}`);
    }
    assertNoRootRelativeUrls(html, relativePath);
  }

  for (const [relativePath, html] of pages) assertNoRootRelativeUrls(html, relativePath);
});

test("story chapters are five focused, generated, shareable pages", async () => {
  const story = JSON.parse(await read("data/story.json"));
  const slugs = story.pages.map((page) => page.slug);
  const expectedPaths = ["story/index.html", ...slugs.map((slug) => `story/${slug}/index.html`)];
  const generatedManifest = JSON.parse(await read("story/.generated-pages.json"));
  const pages = new Map(await Promise.all(expectedPaths.map(async (relativePath) => [relativePath, await read(relativePath)])));
  const canonicals = new Set();
  const titles = new Set();

  assert.equal(story.pages.length, 5);
  assert.equal(new Set(slugs).size, 5);
  assert.deepEqual([...generatedManifest.generated].sort(), [...expectedPaths].sort());
  assert.match(pages.get("story/index.html"), /Less scrolling\. More paths\./);

  for (const page of story.pages) {
    assert.match(page.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(page.facts.length > 0);
    assert.ok(page.sections.length > 0);
    for (const section of page.sections) {
      assert.ok(section.body.length > 0);
      for (const link of section.links) assertHttps(link.url, `${page.slug}/${link.label}`);
    }

    const relativePath = `story/${page.slug}/index.html`;
    const html = pages.get(relativePath);
    const title = extractAttribute(html, /<title>([^<]+)<\/title>/, `${page.slug} title`);
    const canonical = extractAttribute(html, /<link rel="canonical" href="([^"]+)">/, `${page.slug} canonical`);
    assert.equal(title, `${escapeHtml(page.title)} // RIAEvangelist`);
    assert.equal(canonical, `${SITE_BASE}/story/${page.slug}/`);
    assert.ok(!titles.has(title), `Duplicate story title: ${title}`);
    assert.ok(!canonicals.has(canonical), `Duplicate story canonical: ${canonical}`);
    titles.add(title);
    canonicals.add(canonical);
    assertNoRootRelativeUrls(html, relativePath);
  }
});

test("profile README features the open-tab releases and routes readers to focused pages", async () => {
  const [catalog, readme] = await Promise.all([
    read("data/music.json").then(JSON.parse),
    read("README.md"),
  ]);
  const startMarker = "<!-- profile-music-catalog:start -->";
  const endMarker = "<!-- profile-music-catalog:end -->";
  const start = readme.indexOf(startMarker);
  const end = readme.indexOf(endMarker);

  assert.ok(start >= 0, "Missing profile music catalog start marker");
  assert.ok(end > start, "Missing profile music catalog end marker");
  const musicBlock = readme.slice(start, end + endMarker.length);
  const linkedLandrIds = [...musicBlock.matchAll(/artists\.landr\.com\/(\d{12})/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(linkedLandrIds)].sort(), [...PROFILE_MUSIC_IDS].sort());
  assert.match(musicBlock, /https:\/\/riaevangelist\.github\.io\/RIAEvangelist\/music\//);
  assert.match(musicBlock, /cdn\.simpleicons\.org\/spotify\//i);
  assert.match(musicBlock, /cdn\.simpleicons\.org\/applemusic\//i);
  assert.match(musicBlock, /cdn\.simpleicons\.org\/youtubemusic\//i);
  assert.match(musicBlock, /Most vocals are performed by Brandon and other real people\./);
  assert.match(musicBlock, /AI voices were used more at the beginning and are now occasional/);
  assert.match(musicBlock, /Brandon performs some instruments/);
  assert.match(musicBlock, /AI remains a heavily used creative and production partner/);
  for (const route of ["process", "origins"]) {
    assert.ok(musicBlock.includes(`${SITE_BASE}/music/${route}/`), `README is missing the music ${route} link`);
  }

  for (const release of catalog.releases.filter(({ profileFeature }) => profileFeature)) {
    assert.ok(musicBlock.includes(release.landrUrl), `${release.id} LANDR link is missing from the README`);
    const primaryServices = release.services.filter(({ service }) => ["spotify", "applemusic", "youtubemusic"].includes(service));
    assert.ok(primaryServices.length > 0, `${release.id} has no primary service links`);
    for (const { service, url } of primaryServices) {
      assert.ok(musicBlock.includes(url), `${release.id} ${service} link is missing from the README`);
    }
  }

  for (const route of ["racing", "service", "japan-zen", "technology", "channels"]) {
    assert.ok(readme.includes(`${SITE_BASE}/story/${route}/`), `README is missing the ${route} story link`);
  }
  assert.doesNotMatch(readme, /^## JavaScript vs Python$/m);
});

test("sitemap enumerates every generated music and story route", async () => {
  const [catalog, story, sitemap] = await Promise.all([
    read("data/music.json").then(JSON.parse),
    read("data/story.json").then(JSON.parse),
    read("sitemap.xml"),
  ]);
  const pageCount = Math.ceil(catalog.releases.length / MUSIC_PAGE_SIZE);
  const expectedUrls = [
    `${SITE_BASE}/`,
    `${SITE_BASE}/music/`,
    `${SITE_BASE}/music/process/`,
    `${SITE_BASE}/music/origins/`,
    `${SITE_BASE}/music/releases/`,
    ...Array.from({ length: pageCount - 1 }, (_, index) => `${SITE_BASE}/music/releases/page/${index + 2}/`),
    `${SITE_BASE}/music/collections/`,
    ...catalog.releases.map((release) => `${SITE_BASE}/music/releases/${release.slug}/`),
    ...catalog.collections.map((collection) => `${SITE_BASE}/music/collections/${collection.slug}/`),
    `${SITE_BASE}/story/`,
    ...story.pages.map((page) => `${SITE_BASE}/story/${page.slug}/`),
  ];
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

  assert.equal(new Set(sitemapUrls).size, sitemapUrls.length, "Sitemap contains duplicate routes");
  for (const url of expectedUrls) assert.ok(sitemapUrls.includes(url), `Sitemap is missing ${url}`);
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

test("deployment remains GitHub Pages-only", async () => {
  const workflow = await read(".github/workflows/profile-site.yml");

  assert.match(workflow, /actions\/upload-pages-artifact@/);
  assert.match(workflow, /actions\/deploy-pages@/);
  await assert.rejects(read(".openai/hosting.json"), (error) => error?.code === "ENOENT");
  await assert.rejects(read("worker/index.js"), (error) => error?.code === "ENOENT");
});
