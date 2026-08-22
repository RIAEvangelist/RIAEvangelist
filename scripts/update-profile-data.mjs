import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const ASSET_DIR = path.join(ROOT, "assets");
const GITHUB_OWNERS = ["RIAEvangelist", "TheWizardNexus"];
const NPM_MAINTAINERS = ["riaevangelist", "thewizardnexus"];
const USER_AGENT = "RIAEvangelist-profile-telemetry/1.0";
const PERIODS = [
  { key: "week", endpoint: "last-week", label: "Weekly" },
  { key: "month", endpoint: "last-month", label: "Monthly" },
  { key: "year", endpoint: "last-year", label: "Yearly" },
];

const force = process.argv.includes("--force");
const staleHoursArg = process.argv.find((argument) => argument.startsWith("--max-age-hours="));
const maxAgeHours = staleHoursArg ? Number(staleHoursArg.split("=")[1]) : 0;
const snapshotPath = path.join(DATA_DIR, "npm-stats.json");

if (!force && maxAgeHours > 0) {
  try {
    const existing = JSON.parse(await readFile(snapshotPath, "utf8"));
    const age = Date.now() - Date.parse(existing.generatedAt);
    if (Number.isFinite(age) && age < maxAgeHours * 60 * 60 * 1000) {
      console.log(`Telemetry is fresh (${Math.round(age / 60000)} minutes old); no update needed.`);
      process.exit(0);
    }
  } catch {
    // Missing or invalid snapshots are regenerated below.
  }
}

async function fetchJson(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
          ...options.headers,
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** (attempt - 1))));
    }
  }
  throw lastError;
}

function normalizeRepositoryUrl(value) {
  const raw = typeof value === "string" ? value : value?.url;
  if (!raw) return null;
  const normalized = raw
    .replace(/^git\+/, "")
    .replace(/^git:\/\/github\.com\//, "https://github.com/")
    .replace(/^github:/, "https://github.com/")
    .replace(/\.git(#.*)?$/, "")
    .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/");
  return normalized.startsWith("git@github.com:")
    ? normalized.replace("git@github.com:", "https://github.com/")
    : normalized;
}

function packageLinks(pkg) {
  return {
    npm: pkg.links?.npm || `https://www.npmjs.com/package/${encodeURIComponent(pkg.name)}`,
    repository: normalizeRepositoryUrl(pkg.links?.repository),
    homepage: pkg.links?.homepage || null,
  };
}

function repositoryExplanation(repo) {
  if (repo.description?.trim()) return repo.description.trim();
  if (repo.fork) return "A personal fork retained for reference, experiments, or upstream contribution work.";
  const language = repo.language ? `${repo.language} ` : "";
  const title = repo.name.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `${title} is a public ${language}project in the RIAEvangelist archive; its repository does not yet publish a one-line summary.`;
}

function compactNumber(value) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function fullNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function createReadmeModuleCatalog(snapshot) {
  const packages = [...snapshot.packages].sort((left, right) => left.name.localeCompare(right.name));
  const cells = packages.map((pkg) => {
    const maintainers = pkg.trackedMaintainers.map((maintainer) => `@${maintainer}`).join(" + ");
    const description = String(pkg.historicalCaution || pkg.description).replace(/\s+/g, " ").trim();
    return `    <td width="50%" valign="top">
      <a href="${escapeXml(pkg.links.npm)}"><strong>${escapeXml(pkg.name)}</strong></a><br>
      <sub>NPM <code>v${escapeXml(pkg.version)}</code> · ${escapeXml(maintainers)}</sub><br>
      <sub>${escapeXml(description)}</sub>
    </td>`;
  });
  if (cells.length % 2 !== 0) cells.push('    <td width="50%" valign="top"></td>');

  const rows = [];
  for (let index = 0; index < cells.length; index += 2) {
    rows.push(`  <tr>
${cells[index]}
${cells[index + 1]}
  </tr>`);
  }

  return `<!-- profile-module-catalog:start -->
## All NPM modules

Every public package currently maintained through the [\`riaevangelist\`](https://www.npmjs.com/~riaevangelist) and [\`thewizardnexus\`](https://www.npmjs.com/~thewizardnexus) identities. Package names link to NPM; the inventory and versions refresh automatically.

<table>
${rows.join("\n")}
</table>
<!-- profile-module-catalog:end -->`;
}

function createTelemetrySvg(snapshot) {
  const width = 980;
  const height = 650;
  const top = [...snapshot.packages].sort((a, b) => b.downloads.year - a.downloads.year).slice(0, 5);
  const refreshed = new Date(snapshot.generatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  const rows = top.map((pkg, index) => {
    const y = 390 + (index * 43);
    return `
      <text x="56" y="${y}" class="rank">0${index + 1}</text>
      <text x="104" y="${y}" class="package">${escapeXml(pkg.name)}</text>
      <text x="525" y="${y}" class="value">${escapeXml(fullNumber(pkg.downloads.week))}</text>
      <text x="710" y="${y}" class="value">${escapeXml(fullNumber(pkg.downloads.month))}</text>
      <text x="918" y="${y}" class="value">${escapeXml(fullNumber(pkg.downloads.year))}</text>`;
  }).join("").trim();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">RIAEvangelist NPM download telemetry</title>
  <desc id="description">${fullNumber(snapshot.totals.week)} weekly, ${fullNumber(snapshot.totals.month)} monthly, and ${fullNumber(snapshot.totals.year)} yearly downloads across ${snapshot.packageCount} maintained modules, followed by the top five modules.</desc>
  <defs>
    <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#151226"/>
      <stop offset="1" stop-color="#090813"/>
    </linearGradient>
    <linearGradient id="signal" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#ff4fa7"/>
      <stop offset="0.5" stop-color="#8c6cff"/>
      <stop offset="1" stop-color="#39e6e6"/>
    </linearGradient>
  </defs>
  <style>
    text { font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; fill: #f8f5ff; }
    .eyebrow { font-size: 13px; font-weight: 800; letter-spacing: 2.2px; fill: #39e6e6; }
    .heading { font-size: 34px; font-weight: 800; letter-spacing: -1.4px; }
    .metric-label { font-size: 12px; font-weight: 800; letter-spacing: 1.4px; fill: #aaa4bf; }
    .metric { font-size: 31px; font-weight: 800; letter-spacing: -1.2px; }
    .rank { font: 700 12px ui-monospace, SFMono-Regular, Consolas, monospace; fill: #76718b; }
    .package { font-size: 16px; font-weight: 750; }
    .value { font: 650 14px ui-monospace, SFMono-Regular, Consolas, monospace; text-anchor: end; fill: #d9d4e8; }
    .column { font: 750 11px ui-monospace, SFMono-Regular, Consolas, monospace; text-anchor: end; letter-spacing: 1px; fill: #8c849f; }
    .foot { font-size: 12px; fill: #8c849f; }
  </style>
  <rect x="1" y="1" width="978" height="648" rx="26" fill="url(#card)" stroke="#2e2947"/>
  <rect x="1" y="1" width="978" height="5" rx="3" fill="url(#signal)"/>
  <circle cx="914" cy="70" r="42" fill="#8c6cff" opacity=".12"/>
  <circle cx="914" cy="70" r="21" fill="#39e6e6" opacity=".14"/>
  <text x="48" y="55" class="eyebrow">NPM DOWNLOAD SIGNAL · LIVE PROFILE</text>
  <text x="48" y="100" class="heading">Open source, in motion.</text>
  <g transform="translate(48 145)">
    <rect width="280" height="138" rx="18" fill="#0c0b17" stroke="#352c4c"/>
    <text x="22" y="36" class="metric-label">WEEKLY</text>
    <text x="22" y="82" class="metric">${escapeXml(compactNumber(snapshot.totals.week))}</text>
    <text x="22" y="111" class="foot">${escapeXml(fullNumber(snapshot.totals.week))} downloads</text>
  </g>
  <g transform="translate(350 145)">
    <rect width="280" height="138" rx="18" fill="#0c0b17" stroke="#352c4c"/>
    <text x="22" y="36" class="metric-label">MONTHLY</text>
    <text x="22" y="82" class="metric">${escapeXml(compactNumber(snapshot.totals.month))}</text>
    <text x="22" y="111" class="foot">${escapeXml(fullNumber(snapshot.totals.month))} downloads</text>
  </g>
  <g transform="translate(652 145)">
    <rect width="280" height="138" rx="18" fill="#0c0b17" stroke="#352c4c"/>
    <text x="22" y="36" class="metric-label">YEARLY</text>
    <text x="22" y="82" class="metric">${escapeXml(compactNumber(snapshot.totals.year))}</text>
    <text x="22" y="111" class="foot">${escapeXml(fullNumber(snapshot.totals.year))} downloads</text>
  </g>
  <text x="48" y="335" class="eyebrow">TOP MODULES</text>
  <text x="525" y="335" class="column">WEEK</text>
  <text x="710" y="335" class="column">MONTH</text>
  <text x="918" y="335" class="column">YEAR</text>
  <path d="M48 352H932" stroke="#2e2947"/>
  ${rows}
  <path d="M48 615H932" stroke="#2e2947"/>
  <text x="48" y="637" class="foot">${snapshot.packageCount} packages across ${escapeXml(snapshot.maintainers.join(" + "))} · rolling NPM API windows · refreshed ${escapeXml(refreshed)} UTC</text>
</svg>`;
}

await mkdir(DATA_DIR, { recursive: true });
await mkdir(ASSET_DIR, { recursive: true });

const searchUrls = NPM_MAINTAINERS.map((maintainer) => `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(`maintainer:${maintainer}`)}&size=250`);
const searches = await Promise.all(searchUrls.map((url) => fetchJson(url)));
const packageMap = new Map();
searches.forEach((search, index) => {
  const maintainerAccount = NPM_MAINTAINERS[index];
  search.objects
    .map(({ package: pkg }) => pkg)
    .filter((pkg) => pkg.maintainers?.some((maintainer) => maintainer.username?.toLowerCase() === maintainerAccount))
    .forEach((pkg) => packageMap.set(pkg.name, pkg));
});
const registryPackages = [...packageMap.values()];

const packageNames = [...new Set(registryPackages.map((pkg) => pkg.name))].sort((a, b) => a.localeCompare(b));
if (!packageNames.length) throw new Error("The NPM registry returned no maintained packages.");
if (packageNames.length > 128) throw new Error("NPM bulk download queries support at most 128 unscoped packages.");

const encodedNames = packageNames.map(encodeURIComponent).join(",");
const periodResponses = {};
for (const period of PERIODS) {
  periodResponses[period.key] = await fetchJson(`https://api.npmjs.org/downloads/point/${period.endpoint}/${encodedNames}`);
}

const npmPackages = registryPackages.map((pkg) => {
  const downloads = Object.fromEntries(PERIODS.map(({ key }) => [key, Number(periodResponses[key][pkg.name]?.downloads || 0)]));
  return {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description || "No registry description is currently published.",
    keywords: Array.isArray(pkg.keywords) ? pkg.keywords.slice(0, 12) : [],
    publisher: pkg.publisher?.username || null,
    maintainers: (pkg.maintainers || []).map((maintainer) => maintainer.username),
    trackedMaintainers: (pkg.maintainers || [])
      .map((maintainer) => maintainer.username?.toLowerCase())
      .filter((maintainer) => NPM_MAINTAINERS.includes(maintainer)),
    links: packageLinks(pkg),
    downloads,
    historicalCaution: pkg.name === "heart-attack"
      ? "Historical registry entry. Its published metadata describes self-replicating behavior; this dashboard does not recommend installation."
      : null,
  };
}).sort((a, b) => b.downloads.year - a.downloads.year || a.name.localeCompare(b.name));

const npmSnapshot = {
  generatedAt: new Date().toISOString(),
  source: {
    registry: searchUrls,
    downloads: "https://api.npmjs.org/downloads/point/{period}/{packages}",
    semantics: "Counts are successful package-tarball downloads, not unique people or verified installations.",
  },
  maintainers: NPM_MAINTAINERS,
  packageCount: npmPackages.length,
  periods: Object.fromEntries(PERIODS.map(({ key, label }) => {
    const sample = periodResponses[key][packageNames[0]];
    return [key, { label, start: sample?.start || null, end: sample?.end || null }];
  })),
  totals: Object.fromEntries(PERIODS.map(({ key }) => [key, npmPackages.reduce((sum, pkg) => sum + pkg.downloads[key], 0)])),
  packages: npmPackages,
};

const githubToken = process.env.PROFILE_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
const githubHeaders = githubToken ? { Authorization: `Bearer ${githubToken}`, "X-GitHub-Api-Version": "2022-11-28" } : {};
const githubProfiles = [];
const githubRepos = [];
for (const owner of GITHUB_OWNERS) {
  githubProfiles.push(await fetchJson(`https://api.github.com/users/${owner}`, { headers: githubHeaders }));
  for (let page = 1; ; page += 1) {
    const batch = await fetchJson(`https://api.github.com/users/${owner}/repos?per_page=100&page=${page}&type=owner&sort=updated`, { headers: githubHeaders });
    githubRepos.push(...batch);
    if (batch.length < 100) break;
  }
}

const repositories = [...new Map(githubRepos.map((repo) => [repo.full_name, repo])).values()].map((repo) => ({
  name: repo.name,
  fullName: repo.full_name,
  owner: repo.owner.login,
  description: repo.description,
  explanation: repositoryExplanation(repo),
  url: repo.html_url,
  homepage: repo.homepage || null,
  language: repo.language || "Unclassified",
  stars: repo.stargazers_count,
  forks: repo.forks_count,
  openIssues: repo.open_issues_count,
  watchers: repo.watchers_count,
  archived: repo.archived,
  disabled: repo.disabled,
  fork: repo.fork,
  topics: Array.isArray(repo.topics) ? repo.topics : [],
  license: repo.license?.spdx_id || null,
  createdAt: repo.created_at,
  updatedAt: repo.updated_at,
}));

const repoSnapshot = {
  generatedAt: new Date().toISOString(),
  owners: githubProfiles.map((profile) => ({
    login: profile.login,
    name: profile.name,
    bio: profile.bio,
    avatar: profile.avatar_url,
    url: profile.html_url,
    followers: profile.followers,
    following: profile.following,
    repositoryCount: repositories.filter((repo) => repo.owner.toLowerCase() === profile.login.toLowerCase()).length,
  })),
  counts: {
    total: repositories.length,
    original: repositories.filter((repo) => !repo.fork).length,
    forks: repositories.filter((repo) => repo.fork).length,
    archived: repositories.filter((repo) => repo.archived).length,
    stars: repositories.reduce((sum, repo) => sum + repo.stars, 0),
  },
  repositories,
};

const readmePath = path.join(ROOT, "README.md");
const readme = await readFile(readmePath, "utf8");
const readmeStart = "<!-- profile-telemetry-counts:start -->";
const readmeEnd = "<!-- profile-telemetry-counts:end -->";
const readmePattern = new RegExp(`${readmeStart}[\\s\\S]*?${readmeEnd}`);
if (!readmePattern.test(readme)) throw new Error("README telemetry count markers are missing.");
const readmeSummary = `${readmeStart}
<p align="center">
  <strong>${npmSnapshot.packageCount} maintained NPM modules · ${repoSnapshot.counts.total} public repositories · two owned identities</strong><br>
  <a href="https://riaevangelist.github.io/RIAEvangelist/"><strong>Explore the live package pulse and complete code atlas →</strong></a>
</p>
${readmeEnd}`;
const moduleStart = "<!-- profile-module-catalog:start -->";
const moduleEnd = "<!-- profile-module-catalog:end -->";
const modulePattern = new RegExp(`${moduleStart}[\\s\\S]*?${moduleEnd}`);
if (!modulePattern.test(readme)) throw new Error("README module catalog markers are missing.");
const updatedReadme = readme
  .replace(readmePattern, readmeSummary)
  .replace(modulePattern, createReadmeModuleCatalog(npmSnapshot));

await Promise.all([
  writeFile(snapshotPath, `${JSON.stringify(npmSnapshot, null, 2)}\n`, "utf8"),
  writeFile(path.join(DATA_DIR, "repos.json"), `${JSON.stringify(repoSnapshot, null, 2)}\n`, "utf8"),
  writeFile(path.join(ASSET_DIR, "npm-downloads.svg"), `${createTelemetrySvg(npmSnapshot)}\n`, "utf8"),
  writeFile(readmePath, updatedReadme, "utf8"),
]);

console.log(`Updated ${npmSnapshot.packageCount} NPM packages and ${repoSnapshot.counts.total} GitHub repositories.`);
console.log(`Totals: ${fullNumber(npmSnapshot.totals.week)} week · ${fullNumber(npmSnapshot.totals.month)} month · ${fullNumber(npmSnapshot.totals.year)} year.`);
