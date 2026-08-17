const numberFormatter = new Intl.NumberFormat("en-US");
const compactFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  npm: null,
  repos: null,
  period: "year",
  packageQuery: "",
  repoQuery: "",
  repoKind: "all",
  repoLanguage: "all",
  repoSort: "updated",
  repoLimit: 24,
  animated: false,
};

const elements = {
  freshness: document.querySelector("#freshness"),
  signalTotal: document.querySelector("#signal-total"),
  moduleCount: document.querySelector("#module-count"),
  repoCount: document.querySelector("#repo-count"),
  totalWeek: document.querySelector("#total-week"),
  totalMonth: document.querySelector("#total-month"),
  totalYear: document.querySelector("#total-year"),
  leaderboard: document.querySelector("#leaderboard"),
  packageSearch: document.querySelector("#package-search"),
  packageResultCount: document.querySelector("#package-result-count"),
  packageGrid: document.querySelector("#package-grid"),
  repoTotal: document.querySelector("#repo-total"),
  repoOriginal: document.querySelector("#repo-original"),
  repoForks: document.querySelector("#repo-forks"),
  repoStars: document.querySelector("#repo-stars"),
  repoSearch: document.querySelector("#repo-search"),
  repoLanguage: document.querySelector("#repo-language"),
  repoSort: document.querySelector("#repo-sort"),
  repoResultCount: document.querySelector("#repo-result-count"),
  repoGrid: document.querySelector("#repo-grid"),
  loadMore: document.querySelector("#load-more"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}

function formatDate(value) {
  return value ? dateFormatter.format(new Date(`${value}T00:00:00Z`)) : "date unavailable";
}

function formatTimestamp(value) {
  if (!value) return "time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function animateNumber(element, target) {
  element.dataset.count = String(target);
  if (reduceMotion || state.animated) {
    element.textContent = numberFormatter.format(target);
    return;
  }

  const startedAt = performance.now();
  const duration = 950;
  const tick = (now) => {
    const progress = Math.min((now - startedAt) / duration, 1);
    const eased = 1 - ((1 - progress) ** 4);
    element.textContent = numberFormatter.format(Math.round(target * eased));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderOverview() {
  const { npm, repos } = state;
  elements.moduleCount.textContent = numberFormatter.format(npm.packageCount);
  elements.repoCount.textContent = numberFormatter.format(repos.counts.total);
  elements.signalTotal.textContent = compactFormatter.format(npm.totals.year);
  animateNumber(elements.totalWeek, npm.totals.week);
  animateNumber(elements.totalMonth, npm.totals.month);
  animateNumber(elements.totalYear, npm.totals.year);
  state.animated = true;

  elements.repoTotal.textContent = numberFormatter.format(repos.counts.total);
  elements.repoOriginal.textContent = numberFormatter.format(repos.counts.original);
  elements.repoForks.textContent = numberFormatter.format(repos.counts.forks);
  elements.repoStars.textContent = numberFormatter.format(repos.counts.stars);
}

function renderLeaderboard() {
  const period = state.period;
  const periodInfo = state.npm.periods[period];
  const top = [...state.npm.packages]
    .sort((a, b) => b.downloads[period] - a.downloads[period] || a.name.localeCompare(b.name))
    .slice(0, 6);
  const max = Math.max(top[0]?.downloads[period] || 1, 1);

  elements.leaderboard.setAttribute("aria-label", `Top modules by ${periodInfo.label.toLowerCase()} downloads`);
  elements.leaderboard.innerHTML = top.map((pkg, index) => {
    const downloads = pkg.downloads[period];
    const width = Math.max((downloads / max) * 100, 1.5);
    return `<a href="${safeUrl(pkg.links.npm)}" style="--bar: ${width.toFixed(2)}%">
      <b>${String(index + 1).padStart(2, "0")}</b>
      <span><strong>${escapeHtml(pkg.name)}</strong><small>${numberFormatter.format(downloads)} ${escapeHtml(periodInfo.label.toLowerCase())}</small></span>
      <i aria-hidden="true"></i>
    </a>`;
  }).join("");
}

function renderPackages() {
  const query = state.packageQuery.trim().toLowerCase();
  const packages = [...state.npm.packages]
    .filter((pkg) => !query || [pkg.name, pkg.description, ...(pkg.keywords || [])].join(" ").toLowerCase().includes(query))
    .sort((a, b) => b.downloads[state.period] - a.downloads[state.period] || a.name.localeCompare(b.name));

  elements.packageResultCount.textContent = `${numberFormatter.format(packages.length)} of ${numberFormatter.format(state.npm.packageCount)} modules · ranked by ${state.npm.periods[state.period].label.toLowerCase()} downloads`;

  if (!packages.length) {
    elements.packageGrid.innerHTML = '<p class="empty-state">No module matches that signal. Try a broader search.</p>';
    return;
  }

  elements.packageGrid.innerHTML = packages.map((pkg) => {
    const links = [
      `<a href="${safeUrl(pkg.links.npm)}">NPM ↗</a>`,
      pkg.links.repository ? `<a href="${safeUrl(pkg.links.repository)}">Source ↗</a>` : "",
      pkg.links.homepage ? `<a href="${safeUrl(pkg.links.homepage)}">Site ↗</a>` : "",
    ].filter(Boolean).join("");
    const caution = pkg.historicalCaution ? `<p class="caution">${escapeHtml(pkg.historicalCaution)}</p>` : "";

    return `<article class="package-card">
      <div class="card-kicker"><span>v${escapeHtml(pkg.version)}</span><span>${escapeHtml(state.npm.maintainer)}</span></div>
      <h4>${escapeHtml(pkg.name)}</h4>
      <p class="package-description">${escapeHtml(pkg.description)}</p>
      ${caution}
      <dl class="package-metrics">
        <div title="${numberFormatter.format(pkg.downloads.week)} weekly downloads"><dt>Week</dt><dd>${compactFormatter.format(pkg.downloads.week)}</dd></div>
        <div title="${numberFormatter.format(pkg.downloads.month)} monthly downloads"><dt>Month</dt><dd>${compactFormatter.format(pkg.downloads.month)}</dd></div>
        <div title="${numberFormatter.format(pkg.downloads.year)} yearly downloads"><dt>Year</dt><dd>${compactFormatter.format(pkg.downloads.year)}</dd></div>
      </dl>
      <div class="card-links">${links}</div>
    </article>`;
  }).join("");
}

function populateLanguages() {
  const counts = new Map();
  for (const repo of state.repos.repositories) counts.set(repo.language, (counts.get(repo.language) || 0) + 1);
  const options = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  elements.repoLanguage.innerHTML = '<option value="all">All languages</option>' + options
    .map(([language, count]) => `<option value="${escapeHtml(language)}">${escapeHtml(language)} (${count})</option>`)
    .join("");
}

function filteredRepositories() {
  const query = state.repoQuery.trim().toLowerCase();
  const repositories = state.repos.repositories.filter((repo) => {
    if (state.repoKind === "original" && repo.fork) return false;
    if (state.repoKind === "fork" && !repo.fork) return false;
    if (state.repoKind === "archived" && !repo.archived) return false;
    if (state.repoLanguage !== "all" && repo.language !== state.repoLanguage) return false;
    if (!query) return true;
    return [repo.name, repo.explanation, repo.language, ...(repo.topics || [])].join(" ").toLowerCase().includes(query);
  });

  return repositories.sort((a, b) => {
    if (state.repoSort === "stars") return b.stars - a.stars || a.name.localeCompare(b.name);
    if (state.repoSort === "name") return a.name.localeCompare(b.name);
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

function renderRepositories() {
  const repositories = filteredRepositories();
  const visible = repositories.slice(0, state.repoLimit);
  elements.repoResultCount.textContent = `${numberFormatter.format(repositories.length)} repositories match · showing ${numberFormatter.format(visible.length)}`;

  if (!visible.length) {
    elements.repoGrid.innerHTML = '<p class="empty-state">No repository matches those coordinates. Clear a filter and try again.</p>';
  } else {
    elements.repoGrid.innerHTML = visible.map((repo) => {
      const status = repo.archived ? "archived" : repo.fork ? "fork" : "original";
      const topics = (repo.topics || []).slice(0, 4).map((topic) => `<li>${escapeHtml(topic)}</li>`).join("");
      const homepage = repo.homepage ? `<a href="${safeUrl(repo.homepage)}">Live site ↗</a>` : "";
      return `<article class="repo-card">
        <div class="repo-kicker"><span>${escapeHtml(repo.language)}</span><span class="status-tag ${status}">${status}</span></div>
        <h3><a href="${safeUrl(repo.url)}">${escapeHtml(repo.name)} ↗</a></h3>
        <p class="repo-description">${escapeHtml(repo.explanation)}</p>
        <ul class="repo-meta" aria-label="Repository statistics">
          <li>★ ${numberFormatter.format(repo.stars)}</li>
          <li>⑂ ${numberFormatter.format(repo.forks)}</li>
          <li>Updated ${formatDate(repo.updatedAt.slice(0, 10))}</li>
        </ul>
        ${topics ? `<ul class="topic-list" aria-label="Topics">${topics}</ul>` : ""}
        <div class="card-links"><a href="${safeUrl(repo.url)}">Repository ↗</a>${homepage}</div>
      </article>`;
    }).join("");
  }

  elements.loadMore.hidden = visible.length >= repositories.length;
  elements.loadMore.textContent = `Reveal ${numberFormatter.format(Math.min(24, repositories.length - visible.length))} more repositories`;
}

function setPeriod(period) {
  state.period = period;
  document.querySelectorAll("[data-period]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.period === period));
  });
  renderLeaderboard();
  renderPackages();
}

async function refreshNpmLive() {
  try {
    const names = state.npm.packages.map((pkg) => encodeURIComponent(pkg.name)).join(",");
    const definitions = [
      ["week", "last-week"],
      ["month", "last-month"],
      ["year", "last-year"],
    ];
    const responses = await Promise.all(definitions.map(([, endpoint]) => fetchJson(`https://api.npmjs.org/downloads/point/${endpoint}/${names}`)));
    const packages = state.npm.packages.map((pkg) => ({
      ...pkg,
      downloads: Object.fromEntries(definitions.map(([key], index) => [key, Number(responses[index][pkg.name]?.downloads || 0)])),
    }));
    const periods = { ...state.npm.periods };
    definitions.forEach(([key], index) => {
      const sample = responses[index][state.npm.packages[0].name];
      if (sample) periods[key] = { ...periods[key], start: sample.start, end: sample.end };
    });
    const totals = Object.fromEntries(definitions.map(([key]) => [key, packages.reduce((sum, pkg) => sum + pkg.downloads[key], 0)]));
    state.npm = { ...state.npm, packages, periods, totals, liveCheckedAt: new Date().toISOString() };
    renderOverview();
    renderLeaderboard();
    renderPackages();
    const window = periods.week;
    elements.freshness.innerHTML = `<span></span> Live NPM response · ${escapeHtml(formatDate(window.start))}–${escapeHtml(formatDate(window.end))} weekly window · checked ${escapeHtml(formatTimestamp(state.npm.liveCheckedAt))}`;
  } catch {
    elements.freshness.innerHTML = `<span></span> Verified daily snapshot · refreshed ${escapeHtml(formatTimestamp(state.npm.generatedAt))}`;
  }
}

function bindControls() {
  document.querySelectorAll("[data-period]").forEach((button) => {
    button.addEventListener("click", () => setPeriod(button.dataset.period));
  });
  elements.packageSearch.addEventListener("input", (event) => {
    state.packageQuery = event.target.value;
    renderPackages();
  });
  elements.repoSearch.addEventListener("input", (event) => {
    state.repoQuery = event.target.value;
    state.repoLimit = 24;
    renderRepositories();
  });
  elements.repoLanguage.addEventListener("change", (event) => {
    state.repoLanguage = event.target.value;
    state.repoLimit = 24;
    renderRepositories();
  });
  elements.repoSort.addEventListener("change", (event) => {
    state.repoSort = event.target.value;
    state.repoLimit = 24;
    renderRepositories();
  });
  document.querySelectorAll("[data-repo-kind]").forEach((button) => {
    button.addEventListener("click", () => {
      state.repoKind = button.dataset.repoKind;
      state.repoLimit = 24;
      document.querySelectorAll("[data-repo-kind]").forEach((candidate) => {
        candidate.setAttribute("aria-pressed", String(candidate === button));
      });
      renderRepositories();
    });
  });
  elements.loadMore.addEventListener("click", () => {
    state.repoLimit += 24;
    renderRepositories();
  });
}

async function initialize() {
  bindControls();
  try {
    [state.npm, state.repos] = await Promise.all([
      fetchJson("data/npm-stats.json"),
      fetchJson("data/repos.json"),
    ]);
    renderOverview();
    populateLanguages();
    renderLeaderboard();
    renderPackages();
    renderRepositories();
    elements.freshness.innerHTML = `<span></span> Verified daily snapshot · refreshed ${escapeHtml(formatTimestamp(state.npm.generatedAt))}`;
    refreshNpmLive();
  } catch (error) {
    elements.freshness.textContent = "The live catalog could not load. The headline snapshot remains available.";
    elements.packageResultCount.textContent = "Module catalog temporarily unavailable.";
    elements.repoResultCount.textContent = "Repository atlas temporarily unavailable.";
    console.error(error);
  }
}

initialize();
