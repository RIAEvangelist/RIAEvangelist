const footerGroups = [
  {
    title: "Open source",
    links: [
      ["Home", ""],
      ["NPM history", "#history"],
      ["NPM modules", "#packages"],
      ["Repository atlas", "#repositories"],
      ["Life & work", "#beyond"],
      ["Data methodology", "#method"],
    ],
  },
  {
    title: "Music",
    links: [
      ["Music home", "music/"],
      ["All 36 releases", "music/releases/"],
      ["Collections", "music/collections/"],
      ["How it is made", "music/process/"],
      ["Where it began", "music/origins/"],
    ],
  },
  {
    title: "Music collections",
    links: [
      ["Reflection & purpose", "music/collections/reflection-and-purpose/"],
      ["Code & circuits", "music/collections/code-and-circuits/"],
      ["Resilience & resolve", "music/collections/resilience-and-resolve/"],
      ["Family & play", "music/collections/family-and-play/"],
      ["Spirit & stillness", "music/collections/spirit-and-stillness/"],
      ["Collaboration & community", "music/collections/collaboration-and-community/"],
    ],
  },
  {
    title: "Life chapters",
    links: [
      ["Story home", "story/"],
      ["Racing", "story/racing/"],
      ["Technology", "story/technology/"],
      ["Service", "story/service/"],
      ["Japan & Zen", "story/japan-zen/"],
      ["Channels", "story/channels/"],
    ],
  },
  {
    title: "Elsewhere",
    links: [
      ["NewZeroland / Brandon on YouTube ↗", "https://www.youtube.com/@BrandonNozakiMiller"],
      ["AI Wizard on YouTube ↗", "https://www.youtube.com/@AI-Wizard-Music"],
      ["DigiNow on YouTube ↗", "https://www.youtube.com/@digiNowIt"],
      ["AI Nerd on YouTube ↗", "https://www.youtube.com/@unclenozaki9325"],
      ["RIA GitHub ↗", "https://github.com/RIAEvangelist"],
      ["TWiN GitHub ↗", "https://github.com/TheWizardNexus"],
      ["RIA NPM ↗", "https://www.npmjs.com/~riaevangelist"],
      ["TWiN NPM ↗", "https://www.npmjs.com/~thewizardnexus"],
    ],
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderLink(prefix, [label, path]) {
  const external = path.startsWith("https://");
  const href = external ? path : `${prefix}${path}`;
  const attributes = external ? ' target="_blank" rel="noopener noreferrer"' : "";
  return `<li><a href="${href}"${attributes}>${escapeHtml(label)}</a></li>`;
}

export function renderSiteFooter(prefix = "") {
  const groups = footerGroups.map(({ title, links }) => `<section class="site-footer-group">
        <h2>${escapeHtml(title)}</h2>
        <ul>${links.map((link) => renderLink(prefix, link)).join("")}</ul>
      </section>`).join("\n      ");

  return `<footer class="site-footer">
    <div class="site-footer-intro">
      <a class="site-footer-brand" href="${prefix}" aria-label="RIAEvangelist home">R//A <span>RIAEvangelist</span></a>
      <p>Music, software, motion, open-source telemetry, and the human stories connecting them.</p>
    </div>
    <nav class="site-footer-nav" aria-label="Complete site map">
      ${groups}
    </nav>
    <p class="site-footer-note">Built for GitHub Pages with Web standards and an unreasonable affection for JavaScript.</p>
  </footer>`;
}

export const siteFooterGroups = footerGroups;
