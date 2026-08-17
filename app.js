const numberFormatter = new Intl.NumberFormat("en-US");
const compactFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const longDateFormatter = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const averageStartMonth = "2021-01";

const state = {
  npm: null,
  repos: null,
  history: null,
  historyRange: "lifetime",
  historyModule: "all",
  historyYears: new Map(),
  historyRequest: 0,
  historyChart: null,
  historyHoverIndex: null,
  period: "year",
  packageQuery: "",
  repoQuery: "",
  repoKind: "all",
  repoOwner: "all",
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
  historyRange: document.querySelector("#history-range"),
  historyModule: document.querySelector("#history-module"),
  historyFirstDate: document.querySelector("#history-first-date"),
  historyFirstDetail: document.querySelector("#history-first-detail"),
  historyChartKicker: document.querySelector("#history-chart-kicker"),
  historyChartTitle: document.querySelector("#history-chart-title"),
  historyChartPeriod: document.querySelector("#history-chart-period"),
  historyTotal: document.querySelector("#history-total"),
  historyAverageLabel: document.querySelector("#history-average-label"),
  historyAverage: document.querySelector("#history-average"),
  historyPeak: document.querySelector("#history-peak"),
  historyCoverage: document.querySelector("#history-coverage"),
  historyChartFrame: document.querySelector("#history-chart-frame"),
  historyChartCanvas: document.querySelector("#history-chart"),
  historyChartEmpty: document.querySelector("#history-chart-empty"),
  historyChartTooltip: document.querySelector("#history-chart-tooltip"),
  historyTableCaption: document.querySelector("#history-table-caption"),
  historyTableBody: document.querySelector("#history-table-body"),
  historyTableFoot: document.querySelector("#history-table-foot"),
  historyStatus: document.querySelector("#history-status"),
  repoTotal: document.querySelector("#repo-total"),
  repoOriginal: document.querySelector("#repo-original"),
  repoForks: document.querySelector("#repo-forks"),
  repoStars: document.querySelector("#repo-stars"),
  repoSearch: document.querySelector("#repo-search"),
  repoOwner: document.querySelector("#repo-owner"),
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

function formatLongDate(value) {
  return value ? longDateFormatter.format(new Date(`${value}T00:00:00Z`)) : "date unavailable";
}

function formatMonth(value) {
  return value ? monthFormatter.format(new Date(`${value}-01T00:00:00Z`)) : "month unavailable";
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
      <div class="card-kicker"><span>v${escapeHtml(pkg.version)}</span><span>${escapeHtml((pkg.trackedMaintainers || state.npm.maintainers || []).join(" + "))}</span></div>
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

function setHistoryChart(points, label, cadence) {
  state.historyChart = { points, label, cadence };
  state.historyHoverIndex = null;
  elements.historyChartTooltip.hidden = true;
  drawHistoryChart();
}

function drawHistoryChart() {
  const model = state.historyChart;
  const canvas = elements.historyChartCanvas;
  if (!model || canvas.hidden || !model.points.length) return;

  const width = Math.max(elements.historyChartFrame.clientWidth, 320);
  const height = Math.max(elements.historyChartFrame.clientHeight, 280);
  const density = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * density);
  canvas.height = Math.round(height * density);
  const context = canvas.getContext("2d");
  context.scale(density, density);

  const padding = { top: 26, right: 24, bottom: 42, left: width < 520 ? 52 : 68 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maximum = Math.max(...model.points.map((point) => point.value), 0);
  const ceiling = maximum > 0 ? maximum * 1.08 : 1;
  const xFor = (index) => padding.left + ((model.points.length === 1 ? 0.5 : index / (model.points.length - 1)) * plotWidth);
  const yFor = (value) => padding.top + plotHeight - ((value / ceiling) * plotHeight);

  context.clearRect(0, 0, width, height);
  context.lineWidth = 1;
  context.font = "600 11px ui-monospace, SFMono-Regular, Consolas, monospace";
  context.fillStyle = "#76718b";
  context.textAlign = "right";
  context.textBaseline = "middle";
  for (let tick = 0; tick <= 4; tick += 1) {
    const ratio = tick / 4;
    const y = padding.top + (plotHeight * ratio);
    context.strokeStyle = "rgba(255,255,255,0.075)";
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(compactFormatter.format(Math.round(ceiling * (1 - ratio))), padding.left - 9, y);
  }

  const labelCount = width < 520 ? 4 : 6;
  context.textAlign = "center";
  context.textBaseline = "top";
  const labelIndexes = new Set(Array.from({ length: labelCount }, (_, index) => Math.round((index / (labelCount - 1)) * (model.points.length - 1))));
  for (const index of labelIndexes) {
    context.fillText(model.points[index].axisLabel, xFor(index), height - padding.bottom + 13);
  }

  const coordinates = model.points.map((point, index) => ({ x: xFor(index), y: yFor(point.value) }));
  const area = context.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  area.addColorStop(0, "rgba(140,108,255,0.38)");
  area.addColorStop(0.58, "rgba(255,79,167,0.12)");
  area.addColorStop(1, "rgba(57,230,230,0.01)");
  context.beginPath();
  coordinates.forEach(({ x, y }, index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
  context.lineTo(coordinates.at(-1).x, height - padding.bottom);
  context.lineTo(coordinates[0].x, height - padding.bottom);
  context.closePath();
  context.fillStyle = area;
  context.fill();

  const line = context.createLinearGradient(padding.left, 0, width - padding.right, 0);
  line.addColorStop(0, "#ff4fa7");
  line.addColorStop(0.52, "#8c6cff");
  line.addColorStop(1, "#39e6e6");
  context.beginPath();
  coordinates.forEach(({ x, y }, index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
  context.strokeStyle = line;
  context.lineWidth = 2.3;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.shadowColor = "rgba(140,108,255,0.45)";
  context.shadowBlur = 12;
  context.stroke();
  context.shadowBlur = 0;

  const peakIndex = model.points.reduce((best, point, index) => point.value > model.points[best].value ? index : best, 0);
  const highlighted = state.historyHoverIndex ?? peakIndex;
  const point = coordinates[highlighted];
  context.strokeStyle = state.historyHoverIndex === null ? "rgba(198,255,74,0.36)" : "rgba(57,230,230,0.38)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(point.x, padding.top);
  context.lineTo(point.x, height - padding.bottom);
  context.stroke();
  context.fillStyle = state.historyHoverIndex === null ? "#c6ff4a" : "#39e6e6";
  context.beginPath();
  context.arc(point.x, point.y, 4.2, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "rgba(7,7,17,0.9)";
  context.lineWidth = 2;
  context.stroke();

  state.historyPlot = { width, padding, plotWidth, coordinates };
  canvas.setAttribute("aria-label", `${model.label}. ${numberFormatter.format(model.points.reduce((sum, point) => sum + point.value, 0))} downloads shown as a ${model.cadence} trend. A tabular summary follows.`);
}

function updateHistoryTooltip(event) {
  if (!state.historyChart?.points.length || !state.historyPlot) return;
  const bounds = elements.historyChartCanvas.getBoundingClientRect();
  const localX = Math.max(state.historyPlot.padding.left, Math.min(event.clientX - bounds.left, state.historyPlot.width - state.historyPlot.padding.right));
  const ratio = (localX - state.historyPlot.padding.left) / state.historyPlot.plotWidth;
  const index = Math.max(0, Math.min(state.historyChart.points.length - 1, Math.round(ratio * (state.historyChart.points.length - 1))));
  if (state.historyHoverIndex !== index) {
    state.historyHoverIndex = index;
    drawHistoryChart();
  }
  const point = state.historyChart.points[index];
  const coordinate = state.historyPlot.coordinates[index];
  elements.historyChartTooltip.innerHTML = `<b>${escapeHtml(point.tooltipLabel)}</b>${numberFormatter.format(point.value)} downloads`;
  elements.historyChartTooltip.hidden = false;
  const tooltipWidth = 176;
  elements.historyChartTooltip.style.left = `${Math.max(8, Math.min(coordinate.x + 12, state.historyPlot.width - tooltipWidth - 8))}px`;
  elements.historyChartTooltip.style.top = `${Math.max(8, coordinate.y - 28)}px`;
}

function hideHistoryTooltip() {
  elements.historyChartTooltip.hidden = true;
  state.historyHoverIndex = null;
  drawHistoryChart();
}

function renderHistoryTable(rows, total, caption) {
  elements.historyTableCaption.textContent = caption;
  if (!rows.length) {
    elements.historyTableBody.innerHTML = '<tr><td colspan="3">No official download history is available for this period.</td></tr>';
    elements.historyTableFoot.hidden = true;
    return;
  }
  elements.historyTableBody.innerHTML = rows.map(({ label, value }) => {
    const share = total > 0 ? (value / total) * 100 : 0;
    return `<tr><th scope="row">${escapeHtml(label)}</th><td>${numberFormatter.format(value)}</td><td>${share.toFixed(1)}%</td></tr>`;
  }).join("");
  elements.historyTableFoot.hidden = false;
  elements.historyTableFoot.innerHTML = `<tr><th scope="row">Total</th><td>${numberFormatter.format(total)}</td><td>${total > 0 ? "100.0%" : "0.0%"}</td></tr>`;
}

function historyPackage() {
  return state.historyModule === "all"
    ? null
    : state.history.packages.find((pkg) => pkg.name === state.historyModule);
}

function historySeriesLabel() {
  return state.historyModule === "all" ? "All modules" : state.historyModule;
}

function peakPoint(points) {
  return points.reduce((peak, point) => !peak || point.value > peak.value ? point : peak, null);
}

function renderLifetimeHistory() {
  const pkg = historyPackage();
  const pairs = pkg ? pkg.monthly : state.history.monthly;
  const points = pairs.map(([period, value]) => ({
    period,
    value,
    axisLabel: formatMonth(period),
    tooltipLabel: formatMonth(period),
  }));
  const total = pkg ? pkg.total : state.history.lifetimeTotal;
  const averagePoints = points.filter((point) => point.period >= averageStartMonth);
  const averageTotal = averagePoints.reduce((sum, point) => sum + point.value, 0);
  const availableYears = new Set(state.history.years.filter((year) => year.availableFrom).map((year) => String(year.year)));
  const annual = pkg
    ? pkg.annual.filter(([year]) => availableYears.has(year)).map(([year, value]) => ({ label: year, value }))
    : state.history.years.filter((year) => year.availableFrom).map((year) => ({ label: year.partial ? `${year.year} YTD` : String(year.year), value: year.total }));
  const peak = peakPoint(points);
  const label = historySeriesLabel();

  elements.historyChartKicker.textContent = "Recorded lifetime";
  elements.historyChartTitle.textContent = label;
  elements.historyChartPeriod.textContent = `${formatLongDate(state.history.period.availableFrom)}–${formatLongDate(state.history.period.through)} · monthly trend`;
  elements.historyTotal.textContent = numberFormatter.format(total);
  elements.historyAverageLabel.textContent = "Average since 2021";
  elements.historyAverage.textContent = `${numberFormatter.format(Math.round(averageTotal / Math.max(averagePoints.length, 1)))} / month`;
  elements.historyPeak.textContent = peak ? `${formatMonth(peak.period)} · ${compactFormatter.format(peak.value)}` : "No recorded downloads";
  elements.historyCoverage.textContent = `${numberFormatter.format(points.length)} months · ${state.history.packageCount} modules`;
  elements.historyChartCanvas.hidden = false;
  elements.historyChartEmpty.hidden = true;
  setHistoryChart(points, `${label}, recorded NPM lifetime`, "monthly");
  renderHistoryTable(annual, total, `${label} by calendar year`);
  elements.historyStatus.textContent = `Officially reconciled record · ${numberFormatter.format(state.history.dataQuality.correction)} downloads restored versus the npm-stat reference · archive refreshed ${formatTimestamp(state.history.generatedAt)}`;
}

function monthlyRows(points) {
  const months = new Map();
  for (const point of points) months.set(point.period.slice(0, 7), (months.get(point.period.slice(0, 7)) || 0) + point.value);
  return [...months.entries()].map(([month, value]) => ({ label: formatMonth(month), value }));
}

function renderHistoryUnavailableState({ kicker, title, period, coverage, emptyMessage, tableCaption, status }) {
  state.historyChart = null;
  elements.historyChartKicker.textContent = kicker;
  elements.historyChartTitle.textContent = title;
  elements.historyChartPeriod.textContent = period;
  elements.historyTotal.textContent = "—";
  elements.historyAverageLabel.textContent = "Average";
  elements.historyAverage.textContent = "Unavailable";
  elements.historyPeak.textContent = "Unavailable";
  elements.historyCoverage.textContent = coverage;
  elements.historyChartCanvas.hidden = true;
  elements.historyChartEmpty.textContent = emptyMessage;
  elements.historyChartEmpty.hidden = false;
  elements.historyChartTooltip.hidden = true;
  renderHistoryTable([], 0, tableCaption);
  elements.historyStatus.textContent = status;
}

function renderYearHistory(year) {
  const label = historySeriesLabel();
  const pkg = state.historyModule === "all" ? null : year.packages.find((candidate) => candidate.name === state.historyModule);
  const yearLabel = year.period.partial ? `${year.year} YTD` : `Calendar year ${year.year}`;
  if (state.historyModule !== "all" && !pkg) {
    renderHistoryUnavailableState({
      kicker: yearLabel,
      title: label,
      period: "This module is not present in the selected annual archive.",
      coverage: "Module series unavailable",
      emptyMessage: "No annual series is available for this module and year.",
      tableCaption: `${label} in ${year.year}`,
      status: `The ${year.year} archive does not contain ${label}; all-module totals were intentionally not substituted.`,
    });
    return;
  }
  const downloads = pkg ? pkg.downloads : year.overall;
  const points = year.dates.map((period, index) => ({
    period,
    value: downloads[index],
    axisLabel: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${period}T00:00:00Z`)),
    tooltipLabel: formatDate(period),
  }));
  const total = downloads.reduce((sum, value) => sum + value, 0);
  const peak = peakPoint(points);

  elements.historyChartKicker.textContent = yearLabel;
  elements.historyChartTitle.textContent = label;
  elements.historyTotal.textContent = numberFormatter.format(total);

  if (!points.length) {
    renderHistoryUnavailableState({
      kicker: yearLabel,
      title: label,
      period: `NPM’s public download history begins ${formatLongDate(state.history.period.availableFrom)}.`,
      coverage: "Before source coverage",
      emptyMessage: "No official NPM history is available for this calendar year.",
      tableCaption: `${label} in ${year.year}`,
      status: `${year.year} is preserved as an unavailable calendar-year marker; it is not misreported as zero downloads.`,
    });
    return;
  }

  elements.historyChartPeriod.textContent = `${formatLongDate(year.period.availableFrom)}–${formatLongDate(year.period.availableUntil)} · daily trend`;
  elements.historyAverageLabel.textContent = "Daily average";
  elements.historyAverage.textContent = `${numberFormatter.format(Math.round(total / points.length))} / day`;
  elements.historyPeak.textContent = peak?.value ? `${formatDate(peak.period)} · ${compactFormatter.format(peak.value)}` : "No recorded downloads";
  elements.historyCoverage.textContent = state.historyModule === "all"
    ? `${numberFormatter.format(points.length)} days · ${year.activePackageCount} active modules`
    : `${numberFormatter.format(points.length)} officially reconciled days`;
  elements.historyChartCanvas.hidden = false;
  elements.historyChartEmpty.hidden = true;
  setHistoryChart(points, `${label}, ${yearLabel}`, "daily");
  renderHistoryTable(monthlyRows(points), total, `${label} by month in ${year.year}`);
  const correction = year.dataQuality.correction;
  elements.historyStatus.textContent = correction
    ? `Official NPM reconciliation restored ${numberFormatter.format(correction)} downloads missing from the npm-stat reference · refreshed ${formatTimestamp(year.generatedAt)}`
    : `NPM official range series exactly matches the npm-stat annual reference · refreshed ${formatTimestamp(year.generatedAt)}`;
}

async function renderSelectedHistory() {
  if (!state.history) return;
  const request = ++state.historyRequest;
  if (state.historyRange === "lifetime") {
    renderLifetimeHistory();
    return;
  }

  const yearNumber = Number(state.historyRange);
  elements.historyStatus.textContent = `Loading ${yearNumber} daily detail…`;
  try {
    if (!state.historyYears.has(yearNumber)) {
      state.historyYears.set(yearNumber, await fetchJson(`data/npm-history/${yearNumber}.json`));
    }
    if (request !== state.historyRequest) return;
    renderYearHistory(state.historyYears.get(yearNumber));
  } catch (error) {
    if (request !== state.historyRequest) return;
    renderHistoryUnavailableState({
      kicker: `Calendar year ${yearNumber}`,
      title: historySeriesLabel(),
      period: "The selected annual file could not be loaded.",
      coverage: "Annual detail unavailable",
      emptyMessage: `${yearNumber} daily detail is temporarily unavailable.`,
      tableCaption: `${historySeriesLabel()} in ${yearNumber}`,
      status: `${yearNumber} daily detail is temporarily unavailable; select Recorded lifetime to return to the summary.`,
    });
    console.error(error);
  }
}

function populateHistoryControls() {
  elements.historyRange.innerHTML = '<option value="lifetime">Recorded lifetime</option>' + [...state.history.years]
    .reverse()
    .map((year) => {
      const suffix = !year.availableFrom ? " · unavailable" : year.partial ? " · YTD" : "";
      return `<option value="${year.year}">${year.year}${suffix}</option>`;
    }).join("");
  elements.historyModule.innerHTML = '<option value="all">All modules</option>' + state.history.packages
    .map((pkg) => `<option value="${escapeHtml(pkg.name)}">${escapeHtml(pkg.name)} · ${compactFormatter.format(pkg.total)}</option>`)
    .join("");
}

async function initializeHistory() {
  try {
    state.history = await fetchJson("data/npm-history/index.json");
    populateHistoryControls();
    const first = state.history.firstRecordedDownload;
    elements.historyFirstDate.textContent = formatLongDate(first.date);
    const contributors = first.packages.map((pkg) => `${pkg.name} ${numberFormatter.format(pkg.downloads)}`).join(" · ");
    elements.historyFirstDetail.textContent = `${numberFormatter.format(first.downloads)} downloads across ${first.packages.length} modules: ${contributors}.`;
    await renderSelectedHistory();
  } catch (error) {
    elements.historyStatus.textContent = "The historical archive is temporarily unavailable; live rolling telemetry remains active.";
    elements.historyChartPeriod.textContent = "Historical detail could not load.";
    console.error(error);
  }
}

function populateLanguages() {
  const counts = new Map();
  for (const repo of state.repos.repositories) counts.set(repo.language, (counts.get(repo.language) || 0) + 1);
  const options = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  elements.repoLanguage.innerHTML = '<option value="all">All languages</option>' + options
    .map(([language, count]) => `<option value="${escapeHtml(language)}">${escapeHtml(language)} (${count})</option>`)
    .join("");
}

function populateOwners() {
  elements.repoOwner.innerHTML = '<option value="all">Both accounts</option>' + state.repos.owners
    .map((owner) => `<option value="${escapeHtml(owner.login)}">${escapeHtml(owner.login)} (${numberFormatter.format(owner.repositoryCount)})</option>`)
    .join("");
}

function filteredRepositories() {
  const query = state.repoQuery.trim().toLowerCase();
  const repositories = state.repos.repositories.filter((repo) => {
    if (state.repoKind === "original" && repo.fork) return false;
    if (state.repoKind === "fork" && !repo.fork) return false;
    if (state.repoKind === "archived" && !repo.archived) return false;
    if (state.repoOwner !== "all" && repo.owner !== state.repoOwner) return false;
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
        <div class="repo-kicker"><span>@${escapeHtml(repo.owner)} · ${escapeHtml(repo.language)}</span><span class="status-tag ${status}">${status}</span></div>
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
  elements.historyRange.addEventListener("change", (event) => {
    state.historyRange = event.target.value;
    renderSelectedHistory();
  });
  elements.historyModule.addEventListener("change", (event) => {
    state.historyModule = event.target.value;
    renderSelectedHistory();
  });
  elements.historyChartCanvas.addEventListener("pointermove", updateHistoryTooltip);
  elements.historyChartCanvas.addEventListener("pointerleave", hideHistoryTooltip);
  if ("ResizeObserver" in window) {
    const historyResizeObserver = new ResizeObserver(() => drawHistoryChart());
    historyResizeObserver.observe(elements.historyChartFrame);
  } else {
    window.addEventListener("resize", drawHistoryChart);
  }
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
  elements.repoOwner.addEventListener("change", (event) => {
    state.repoOwner = event.target.value;
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
  initializeHistory();
  try {
    [state.npm, state.repos] = await Promise.all([
      fetchJson("data/npm-stats.json"),
      fetchJson("data/repos.json"),
    ]);
    renderOverview();
    populateOwners();
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
