// generate-cards.js
// Builds three SVG cards from real GitHub data: overall stats, language mix,
// and contribution streak. Matches the same dark/cyan terminal theme used by
// the ASCII portrait and rocket contribution graph.
//
// Required env vars:
//   GH_TOKEN     - token with read:user scope (same one used by generate.js)
//   GH_USERNAME  - the GitHub username
//
// Output: dist/stats-card.svg, dist/languages-card.svg, dist/streak-card.svg

import { writeFile, mkdir } from "node:fs/promises";

const TOKEN = process.env.GH_TOKEN;
const USERNAME = process.env.GH_USERNAME;

if (!TOKEN || !USERNAME) {
  console.error("Missing GH_TOKEN or GH_USERNAME env vars.");
  process.exit(1);
}

const REST_HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function restJSON(url) {
  const res = await fetch(url, { headers: REST_HEADERS });
  if (!res.ok) throw new Error(`REST error ${res.status} for ${url}: ${await res.text()}`);
  return res.json();
}

async function fetchAllRepos() {
  let page = 1;
  const all = [];
  while (true) {
    const repos = await restJSON(
      `https://api.github.com/users/${USERNAME}/repos?per_page=100&page=${page}`
    );
    all.push(...repos);
    if (repos.length < 100) break;
    page++;
  }
  return all;
}

async function fetchLanguageBytes(repos) {
  const totals = {};
  // only count original (non-fork) repos so the mix reflects your own code
  const owned = repos.filter((r) => !r.fork);
  for (const repo of owned) {
    try {
      const langs = await restJSON(
        `https://api.github.com/repos/${USERNAME}/${repo.name}/languages`
      );
      for (const [lang, bytes] of Object.entries(langs)) {
        totals[lang] = (totals[lang] || 0) + bytes;
      }
    } catch (e) {
      console.warn(`skip languages for ${repo.name}: ${e.message}`);
    }
  }
  return totals;
}

const CONTRIB_QUERY = `
query ($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

async function fetchContributionDays() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: CONTRIB_QUERY, variables: { login: USERNAME } }),
  });
  if (!res.ok) throw new Error(`GraphQL error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  const cal = json.data.user.contributionsCollection.contributionCalendar;
  const days = cal.weeks.flatMap((w) => w.contributionDays);
  return { days, total: cal.totalContributions };
}

function computeStreaks(days) {
  let longest = 0;
  let running = 0;
  for (const d of days) {
    if (d.contributionCount > 0) {
      running++;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) current++;
    else break;
  }
  const activeDays = days.filter((d) => d.contributionCount > 0).length;
  return { current, longest, activeDays };
}

// ---------------- SVG building ----------------

const STYLE = `
    .h1{font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:15px;fill:#e6fffb;font-weight:600;}
    .sub{font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:9.5px;fill:#5b6472;letter-spacing:0.5px;}
    .big{font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:30px;fill:#5eead4;font-weight:700;}
    .lbl{font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:10.5px;fill:#8b96a5;}
    .val{font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:11px;fill:#c9d1d9;}
    .tiny{font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:8.5px;fill:#3f4757;}`;

function defs() {
  return `<defs>
  <linearGradient id="bgfill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0b0f1a"/>
    <stop offset="100%" stop-color="#05070d"/>
  </linearGradient>
  <style>${STYLE}</style>
</defs>`;
}

function cardFrame(W, H) {
  return `<rect x="0" y="0" width="${W}" height="${H}" rx="14" fill="url(#bgfill)" stroke="#20263a" stroke-width="1"/>`;
}

function statsCard({ totalContrib, stars, repos, followers }) {
  const W = 360, H = 150;
  const rows = [
    ["STARS", stars],
    ["REPOSITORIES", repos],
    ["FOLLOWERS", followers],
  ];
  const maxv = Math.max(...rows.map(([, v]) => v), 1);
  let ry = 68;
  const barRows = rows
    .map(([label, val]) => {
      const bw = 110;
      const filled = Math.max(4, (bw * val) / maxv);
      const row = `<text x="205" y="${ry + 4}" class="lbl">${label}</text>
<rect x="205" y="${ry + 8}" width="${bw}" height="4" rx="2" fill="#161d2c"/>
<rect x="205" y="${ry + 8}" width="${filled.toFixed(1)}" height="4" rx="2" fill="#2dd4bf"/>
<text x="${205 + bw + 8}" y="${ry + 12}" class="val">${val}</text>`;
      ry += 26;
      return row;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${defs()}
${cardFrame(W, H)}
<text x="20" y="28" class="h1">GitHub Stats</text>
<text x="20" y="42" class="sub">PROFILE SIGNAL</text>
<line x1="20" y1="52" x2="${W - 20}" y2="52" stroke="#1c2333" stroke-width="1"/>
<text x="20" y="80" class="lbl">TOTAL CONTRIBUTIONS</text>
<text x="20" y="112" class="big">${totalContrib.toLocaleString()}</text>
${barRows}
</svg>`;
}

const LANG_COLORS = {
  JavaScript: "#eab308",
  TypeScript: "#3178c6",
  Java: "#f97316",
  Python: "#22c55e",
  HTML: "#ef4444",
  CSS: "#a855f7",
  "C++": "#ec4899",
  C: "#64748b",
  Shell: "#84cc16",
  Dockerfile: "#0ea5e9",
};
function colorForLang(name, idx) {
  return LANG_COLORS[name] || ["#5eead4", "#f472b6", "#facc15", "#818cf8"][idx % 4];
}

function languagesCard(langEntries) {
  const W = 360, H = 240;
  const cx = 78, cy = 120, r = 42;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const donut = langEntries
    .map(([name, pct], i) => {
      const color = colorForLang(name, i);
      const length = (circumference * pct) / 100;
      const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="14" stroke-dasharray="${length.toFixed(
        1
      )} ${(circumference - length).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(
        1
      )}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt"/>`;
      offset += length;
      return seg;
    })
    .join("\n");

  const top = langEntries[0];
  const listRows = langEntries
    .map(([name, pct], i) => {
      const color = colorForLang(name, i);
      const ly = 76 + i * 34;
      return `<circle cx="150" cy="${ly - 4}" r="4" fill="${color}"/>
<text x="162" y="${ly}" class="val">${name}</text>
<rect x="150" y="${ly + 6}" width="170" height="4" rx="2" fill="#161d2c"/>
<rect x="150" y="${ly + 6}" width="${((170 * pct) / 100).toFixed(1)}" height="4" rx="2" fill="${color}"/>`;
    })
    .join("\n");

  let xoff = 20;
  const bw_total = W - 40;
  const stackedBar = langEntries
    .map(([name, pct], i) => {
      const color = colorForLang(name, i);
      const seg = (bw_total * pct) / 100;
      const rect = `<rect x="${xoff.toFixed(1)}" y="${H - 28}" width="${seg.toFixed(
        1
      )}" height="8" fill="${color}"/>`;
      xoff += seg;
      return rect;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${defs()}
${cardFrame(W, H)}
<text x="20" y="28" class="h1">Language Mix</text>
<text x="20" y="42" class="sub">${langEntries.length} TECHNOLOGIES DETECTED</text>
<line x1="20" y1="52" x2="${W - 20}" y2="52" stroke="#1c2333" stroke-width="1"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#161d2c" stroke-width="14"/>
${donut}
<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="big" font-size="20">${top[1].toFixed(0)}%</text>
<text x="${cx}" y="${cy + 14}" text-anchor="middle" class="tiny">${top[0]}</text>
${listRows}
<rect x="20" y="${H - 28}" width="${bw_total}" height="8" rx="4" fill="#161d2c"/>
${stackedBar}
</svg>`;
}

function streakCard({ current, longest, activeDays }) {
  const W = 360, H = 150;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${defs()}
${cardFrame(W, H)}
<text x="20" y="28" class="h1">Contribution Streak</text>
<text x="20" y="42" class="sub">CONSISTENCY TRACKER</text>
<line x1="20" y1="52" x2="${W - 20}" y2="52" stroke="#1c2333" stroke-width="1"/>
<g transform="translate(34,100)">
  <path d="M0,20 C-14,10 -12,-8 0,-22 C2,-10 10,-8 8,4 C14,0 12,-10 16,-14 C22,-2 20,14 8,20 C12,12 8,6 4,8 C6,14 2,20 0,20 Z" fill="#2dd4bf"/>
</g>
<text x="60" y="96" class="big">${current}</text>
<text x="60" y="112" class="lbl">CURRENT DAYS</text>
<line x1="200" y1="65" x2="200" y2="125" stroke="#1c2333" stroke-width="1"/>
<text x="216" y="82" class="lbl">LONGEST</text>
<text x="216" y="100" class="val" font-size="15">${longest} days</text>
<text x="216" y="118" class="lbl">ACTIVE DAYS</text>
<text x="216" y="136" class="val" font-size="15">${activeDays} days</text>
</svg>`;
}

async function main() {
  const [user, repos, { days, total }] = await Promise.all([
    restJSON(`https://api.github.com/users/${USERNAME}`),
    fetchAllRepos(),
    fetchContributionDays(),
  ]);

  const stars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
  const langBytes = await fetchLanguageBytes(repos);
  const totalBytes = Object.values(langBytes).reduce((a, b) => a + b, 0) || 1;
  const langEntries = Object.entries(langBytes)
    .map(([name, bytes]) => [name, (bytes / totalBytes) * 100])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const streaks = computeStreaks(days);

  await mkdir("dist", { recursive: true });
  await writeFile(
    "dist/stats-card.svg",
    statsCard({ totalContrib: total, stars, repos: user.public_repos, followers: user.followers }),
    "utf8"
  );
  await writeFile("dist/languages-card.svg", languagesCard(langEntries), "utf8");
  await writeFile("dist/streak-card.svg", streakCard(streaks), "utf8");

  console.log("Wrote dist/stats-card.svg, dist/languages-card.svg, dist/streak-card.svg");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
