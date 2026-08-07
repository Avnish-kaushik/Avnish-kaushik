// generate.js
// Fetches the last 12 months of GitHub contribution data for GH_USERNAME
// and renders an animated "rocket flying over the contribution grid" SVG.
//
// Required env vars (set as repo secrets / workflow env):
//   GH_TOKEN     - a token with read:user scope (classic PAT works well)
//   GH_USERNAME  - the GitHub username to fetch contributions for
//
// Output: dist/contrib-rocket.svg

import { writeFile, mkdir } from "node:fs/promises";

const TOKEN = process.env.GH_TOKEN;
const USERNAME = process.env.GH_USERNAME;

if (!TOKEN || !USERNAME) {
  console.error("Missing GH_TOKEN or GH_USERNAME env vars.");
  process.exit(1);
}

const QUERY = `
query ($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            weekday
            contributionCount
          }
        }
      }
    }
  }
}`;

async function fetchContributions() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: QUERY, variables: { login: USERNAME } }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data.user.contributionsCollection.contributionCalendar;
}

// Map a raw contribution count to a 0-5 intensity level using quartiles
// computed from this user's own data (keeps the scale meaningful whether
// someone commits twice a day or fifty times a day).
function buildLevels(weeks) {
  const counts = weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount));
  const nonZero = counts.filter((c) => c > 0).sort((a, b) => a - b);
  const q = (p) => nonZero[Math.floor(p * (nonZero.length - 1))] ?? 0;
  const thresholds = [0, q(0.25) || 1, q(0.5) || 2, q(0.75) || 3, q(0.9) || 4];

  return weeks.map((w) =>
    w.contributionDays.map((d) => {
      const c = d.contributionCount;
      let level = 0;
      for (let i = thresholds.length - 1; i >= 0; i--) {
        if (c >= thresholds[i] && c > 0) {
          level = i + 1;
          break;
        }
      }
      return { ...d, level: Math.min(level, 5) };
    })
  );
}

const COLOR_DIM = "#0d1320";
function colorFor(level) {
  const levels = {
    0: "#121826",
    1: "#0e4b4b",
    2: "#0f7a72",
    3: "#14b8a6",
    4: "#5eead4",
    5: "#a7f3ea",
  };
  return levels[level] ?? levels[0];
}

function buildSVG(weeksWithLevels, totalContributions, username) {
  const CELL = 11;
  const GAP = 3;
  const STEP = CELL + GAP;
  const PAD_L = 34;
  const PAD_T = 42;
  const PAD_R = 20;
  const PAD_B = 20;

  const weeks = weeksWithLevels.length;
  const W = PAD_L + weeks * STEP + PAD_R;
  const H = PAD_T + 7 * STEP + PAD_B;
  const CYCLE = 14; // seconds for one full flight across the year

  const cells = [];
  weeksWithLevels.forEach((week, w) => {
    week.forEach((day) => {
      cells.push({
        x: PAD_L + w * STEP,
        y: PAD_T + day.weekday * STEP,
        level: day.level,
      });
    });
  });

  const total = cells.length;
  const points = cells.map((c) => [c.x + CELL / 2, c.y + CELL / 2]);
  const pathD = "M " + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L ");

  const cellRects = cells
    .map((c, i) => {
      const t = (i / total) * CYCLE;
      const t0 = Math.max(0, t - 0.001) / CYCLE;
      const t1 = Math.min(CYCLE, t + 0.35) / CYCLE;
      const lit = colorFor(c.level);
      return `<rect x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" width="${CELL}" height="${CELL}" rx="2.5" fill="${COLOR_DIM}"><animate attributeName="fill" values="${COLOR_DIM};${COLOR_DIM};${lit};${lit}" keyTimes="0;${t0.toFixed(4)};${t1.toFixed(4)};1" dur="${CYCLE}s" repeatCount="indefinite"/></rect>`;
    })
    .join("");

  const trailOffsets = [-0.55, -0.4, -0.26, -0.13];
  const trail = trailOffsets
    .map((off, k) => {
      const r = (3.2 - k * 0.5).toFixed(1);
      const op = (0.55 - k * 0.1).toFixed(2);
      return `<circle r="${r}" fill="#5eead4" opacity="${op}"><animateMotion dur="${CYCLE}s" repeatCount="indefinite" begin="${off}s" rotate="auto"><mpath href="#flightpath"/></animateMotion></circle>`;
    })
    .join("");

  const rocket = `<g>
    <path d="M6,0 L-3,-3 L-5,0 L-3,3 Z" fill="#e6fffb" stroke="#0f766e" stroke-width="0.6"/>
    <circle cx="1" cy="0" r="1.1" fill="#0f766e"/>
    <path d="M-5,-1.6 L-8,-3.6 L-6.2,-0.6 Z" fill="#14b8a6"/>
    <path d="M-5,1.6 L-8,3.6 L-6.2,0.6 Z" fill="#14b8a6"/>
    <path d="M-5,0 L-9,0" stroke="#fbbf24" stroke-width="1.6" stroke-linecap="round" opacity="0.9">
      <animate attributeName="stroke-width" values="1.6;2.6;1.6" dur="0.22s" repeatCount="indefinite"/>
    </path>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#a7f3ea" stop-opacity="0.9"/>
    <stop offset="100%" stop-color="#a7f3ea" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="bgfill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0b0f1a"/>
    <stop offset="100%" stop-color="#05070d"/>
  </linearGradient>
  <linearGradient id="titlebar" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#161b28"/>
    <stop offset="100%" stop-color="#10141f"/>
  </linearGradient>
  <style>.title{font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:12px;fill:#7d8590;}</style>
</defs>
<rect x="0" y="0" width="${W}" height="${H}" rx="12" fill="url(#bgfill)" stroke="#20263a" stroke-width="1"/>
<path d="M0,14 a14,14 0 0 1 14,-14 h${W - 28} a14,14 0 0 1 14,14 v22 h-${W} z" fill="url(#titlebar)"/>
<circle cx="20" cy="17" r="5" fill="#ff5f56"/><circle cx="37" cy="17" r="5" fill="#ffbd2e"/><circle cx="54" cy="17" r="5" fill="#27c93f"/>
<text x="${W / 2}" y="21" text-anchor="middle" class="title">${username}@github ~$ ./contributions.sh --year (${totalContributions} total)</text>
${cellRects}
<path id="flightpath" d="${pathD}" fill="none" stroke="none"/>
${trail}
<circle r="9" fill="url(#glow)"><animateMotion dur="${CYCLE}s" repeatCount="indefinite" rotate="auto"><mpath href="#flightpath"/></animateMotion></circle>
<g>${rocket}<animateMotion dur="${CYCLE}s" repeatCount="indefinite" rotate="auto"><mpath href="#flightpath"/></animateMotion></g>
</svg>`;
}

async function main() {
  const calendar = await fetchContributions();
  const weeksWithLevels = buildLevels(calendar.weeks);
  const svg = buildSVG(weeksWithLevels, calendar.totalContributions, USERNAME);

  await mkdir("dist", { recursive: true });
  await writeFile("dist/contrib-rocket.svg", svg, "utf8");
  console.log(`Wrote dist/contrib-rocket.svg (${calendar.totalContributions} contributions)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
