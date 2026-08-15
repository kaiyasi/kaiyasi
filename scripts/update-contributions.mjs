import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const username = process.env.GITHUB_USERNAME || "kaiyasi";
const output = process.env.CONTRIBUTIONS_OUTPUT || "assets/contributions.svg";

const refreshedAt = new Date();
const formatDate = (date) => date.toISOString().slice(0, 10);
const endpoint = `https://github.com/users/${username}/contributions`;

const response = await fetch(endpoint, {
  headers: {
    accept: "text/html",
    "user-agent": "kaiyasi-profile-contribution-board",
  },
});

if (!response.ok) {
  throw new Error(`GitHub returned ${response.status} for ${endpoint}`);
}

const html = await response.text();
const cells = new Map();
const cellPattern = /<td\b(?=[^>]*\bid="contribution-day-component-(\d+)-(\d+)")(?=[^>]*\bdata-date="([^"]+)")(?=[^>]*\bdata-level="(\d+)")[^>]*>/g;

for (const match of html.matchAll(cellPattern)) {
  const [, row, column, date, level] = match;
  cells.set(`${row}:${column}`, {
    row: Number(row),
    column: Number(column),
    date,
    level: Number(level),
    count: 0,
  });
}

const tooltipPattern = /<tool-tip\b[^>]*\bfor="contribution-day-component-(\d+)-(\d+)"[^>]*>([\s\S]*?)<\/tool-tip>/g;
for (const match of html.matchAll(tooltipPattern)) {
  const [, row, column, rawLabel] = match;
  const cell = cells.get(`${row}:${column}`);
  if (!cell) continue;

  const label = rawLabel.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  const count = label.match(/([\d,]+)\s+contributions?/i);
  cell.count = count ? Number(count[1].replaceAll(",", "")) : 0;
}

const days = [...cells.values()].sort((a, b) => a.date.localeCompare(b.date));
if (!days.length) {
  throw new Error("No contribution cells found in the GitHub response.");
}

const total = days.reduce((sum, day) => sum + day.count, 0);
const activeDays = days.filter((day) => day.count > 0);
const peak = activeDays.reduce(
  (best, day) => (day.count > best.count ? day : best),
  { count: 0, date: "—" },
);

let longestStreak = 0;
let currentStreak = 0;
for (const day of days) {
  currentStreak = day.count > 0 ? currentStreak + 1 : 0;
  longestStreak = Math.max(longestStreak, currentStreak);
}

const maxColumn = Math.max(...days.map((day) => day.column));
const cellSize = 12;
const cellGap = 4;
const cellStride = cellSize + cellGap;
const heatmapX = 104;
const heatmapY = 222;
const colors = ["#f4f3ef", "#f1d7d2", "#e89e95", "#df6c61", "#db493d"];
const number = new Intl.NumberFormat("en-US");
const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const columnDates = Array.from({ length: maxColumn + 1 }, (_, column) => {
  const firstDay = days.find((day) => day.column === column && day.row === 0)
    || days.find((day) => day.column === column);
  return firstDay?.date;
});

const monthLabels = [];
let previousMonth = "";
for (const [column, date] of columnDates.entries()) {
  if (!date) continue;
  const month = date.slice(0, 7);
  if (month === previousMonth) continue;
  previousMonth = month;
  monthLabels.push(
    `<text x="${heatmapX + column * cellStride}" y="204" fill="#85898b" font-family="'DM Sans', 'Noto Sans TC', system-ui, sans-serif" font-size="11">${monthNames[Number(date.slice(5, 7)) - 1]}</text>`,
  );
}

const cellsSvg = [];
for (let row = 0; row < 7; row += 1) {
  for (let column = 0; column <= maxColumn; column += 1) {
    const cell = cells.get(`${row}:${column}`);
    if (!cell) continue;
    const x = heatmapX + column * cellStride;
    const y = heatmapY + row * cellStride;
    const label = `${number.format(cell.count)} contribution${cell.count === 1 ? "" : "s"} on ${cell.date}`;
    cellsSvg.push(
      `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="1" fill="${colors[cell.level] || colors[0]}" stroke="#c7c6be" stroke-opacity="0.55"><title>${escapeXml(label)}</title></rect>`,
    );
  }
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="410" viewBox="0 0 1200 410" role="img" aria-labelledby="title description">
  <title id="title">${escapeXml(number.format(total))} GitHub contributions in the last year</title>
  <desc id="description">A warm editorial contribution heatmap for ${escapeXml(username)}, refreshed ${escapeXml(formatDate(refreshedAt))}.</desc>
  <defs>
    <linearGradient id="surface" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.55" stop-color="#f4f3ef"/>
      <stop offset="1" stop-color="#e7e6e0"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#db493d" stop-opacity="0"/>
      <stop offset="0.48" stop-color="#db493d" stop-opacity="0.8"/>
      <stop offset="1" stop-color="#2d829e" stop-opacity="0"/>
    </linearGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#17181a" stroke-opacity="0.045"/>
    </pattern>
  </defs>

  <rect width="1200" height="410" rx="8" fill="url(#surface)"/>
  <rect x="1" y="1" width="1198" height="408" rx="7" fill="url(#grid)" stroke="#c7c6be" stroke-opacity="0.95"/>
  <path d="M44 157 C270 122 368 184 567 151 S916 126 1157 164" fill="none" stroke="url(#glow)" stroke-width="1" opacity="0.65"/>
  <path d="M44 159 C270 124 368 186 567 153 S916 128 1157 166" fill="none" stroke="#db493d" stroke-opacity="0.1" stroke-width="9"/>

  <text x="52" y="55" fill="#db493d" font-family="'JetBrains Mono', 'Fira Code', monospace" font-size="12" letter-spacing="2.5">CONTRIBUTION LOG / ${escapeXml(username.toUpperCase())}</text>
  <text x="52" y="96" fill="#17181a" font-family="'Cormorant', 'Noto Serif TC', Georgia, serif" font-size="32" font-weight="600">A year of quiet progress.</text>
  <text x="52" y="121" fill="#53575a" font-family="'DM Sans', 'Noto Sans TC', system-ui, sans-serif" font-size="13">Small commits, experiments, and shipped ideas — one square at a time.</text>

  <g transform="translate(990 36)">
    <rect width="158" height="112" rx="4" fill="#ffffff" fill-opacity="0.78" stroke="#c7c6be"/>
    <text x="18" y="27" fill="#85898b" font-family="'JetBrains Mono', 'Fira Code', monospace" font-size="10" letter-spacing="1.5">LAST 12 MONTHS</text>
    <text x="18" y="69" fill="#17181a" font-family="'Cormorant', 'Noto Serif TC', Georgia, serif" font-size="34" font-weight="600">${escapeXml(number.format(total))}</text>
    <text x="19" y="90" fill="#db493d" font-family="'DM Sans', 'Noto Sans TC', system-ui, sans-serif" font-size="12">contributions</text>
  </g>

  ${monthLabels.join("\n  ")}
  <text x="55" y="242" fill="#85898b" font-family="'DM Sans', 'Noto Sans TC', system-ui, sans-serif" font-size="10">Mon</text>
  <text x="55" y="274" fill="#85898b" font-family="'DM Sans', 'Noto Sans TC', system-ui, sans-serif" font-size="10">Wed</text>
  <text x="55" y="306" fill="#85898b" font-family="'DM Sans', 'Noto Sans TC', system-ui, sans-serif" font-size="10">Fri</text>
  <g aria-label="Contribution heatmap">
    ${cellsSvg.join("\n    ")}
  </g>

  <g transform="translate(990 182)">
    <text x="0" y="0" fill="#85898b" font-family="'JetBrains Mono', 'Fira Code', monospace" font-size="10" letter-spacing="1.5">SIGNALS</text>
    <line x1="0" y1="14" x2="158" y2="14" stroke="#c7c6be"/>
    <text x="0" y="47" fill="#17181a" font-family="'Cormorant', 'Noto Serif TC', Georgia, serif" font-size="26" font-weight="600">${escapeXml(number.format(activeDays.length))}</text>
    <text x="0" y="64" fill="#53575a" font-family="'DM Sans', 'Noto Sans TC', system-ui, sans-serif" font-size="11">active days</text>
    <text x="88" y="47" fill="#17181a" font-family="'Cormorant', 'Noto Serif TC', Georgia, serif" font-size="26" font-weight="600">${escapeXml(number.format(longestStreak))}</text>
    <text x="88" y="64" fill="#53575a" font-family="'DM Sans', 'Noto Sans TC', system-ui, sans-serif" font-size="11">best streak</text>
    <text x="0" y="100" fill="#2d829e" font-family="'JetBrains Mono', 'Fira Code', monospace" font-size="11">peak day</text>
    <text x="0" y="120" fill="#17181a" font-family="'DM Sans', 'Noto Sans TC', system-ui, sans-serif" font-size="12">${escapeXml(number.format(peak.count))} commits · ${escapeXml(peak.date)}</text>
  </g>

  <g transform="translate(104 365)">
    <text x="0" y="0" fill="#85898b" font-family="'DM Sans', 'Noto Sans TC', system-ui, sans-serif" font-size="10">LESS</text>
    ${colors.map((color, index) => `<rect x="${38 + index * 18}" y="-10" width="12" height="12" rx="1" fill="${color}" stroke="#c7c6be" stroke-opacity="0.55"/>`).join("\n    ")}
    <text x="136" y="0" fill="#85898b" font-family="'DM Sans', 'Noto Sans TC', system-ui, sans-serif" font-size="10">MORE</text>
  </g>
  <text x="1148" y="375" text-anchor="end" fill="#85898b" font-family="'JetBrains Mono', 'Fira Code', monospace" font-size="10">refreshed ${escapeXml(formatDate(refreshedAt))}</text>
</svg>
`;

await mkdir(dirname(output), { recursive: true });
await writeFile(output, svg, "utf8");
console.log(`Wrote ${output} from ${endpoint}`);
