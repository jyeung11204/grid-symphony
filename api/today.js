// Live "today so far" from NYISO, in the same shape as data/days/*.json.
// NYISO's CSVs don't allow cross-origin reads, so the page asks this function instead.

const BASE = "http://mis.nyiso.com/public/csv";
const TZ_OFFSET = { EST: -5, EDT: -4 };

function etDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now).reduce((o, p) => ((o[p.type] = p.value), o), {});
  return { y: +parts.year, m: +parts.month, d: +parts.day };
}

// Offset of New York from UTC, in hours, at a given instant
function etOffset(utcMs) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(new Date(utcMs)).find((p) => p.type === "timeZoneName").value; // "GMT-5"
  return Number(name.replace("GMT", "")) || 0;
}

// 05:00 UTC is midnight or 1 AM in New York, always before the 2 AM DST switch
function midnightUtc(y, m, d) {
  return Date.UTC(y, m - 1, d) - etOffset(Date.UTC(y, m - 1, d, 5)) * 3600e3;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines.shift().split(",").map((h) => h.replace(/"/g, ""));
  return lines.map((line) => {
    const cells = line.split(",").map((c) => c.replace(/"/g, ""));
    return Object.fromEntries(head.map((h, i) => [h, cells[i]]));
  });
}

function elapsed(ts, tz, mid) {
  // "11/02/2026 15:15:00"
  const [md, hms] = ts.split(" ");
  const [mo, dd, yy] = md.split("/").map(Number);
  const [hh, mi] = hms.split(":").map(Number);
  const utc = Date.UTC(yy, mo - 1, dd, hh, mi) - (TZ_OFFSET[tz] ?? -5) * 3600e3;
  return Math.round((utc - mid) / 60000);
}

async function fetchCsv(kind, stamp) {
  const r = await fetch(`${BASE}/${kind}/${stamp}${kind}.csv`, { headers: { "User-Agent": "grid-symphony/1.0" } });
  if (!r.ok) throw new Error(`${kind} ${r.status}`);
  return parseCsv(await r.text());
}

export default async function handler(req, res) {
  try {
    const { y, m, d } = etDate();
    const stamp = `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
    const [fuelRows, loadRows] = await Promise.all([fetchCsv("rtfuelmix", stamp), fetchCsv("pal", stamp)]);

    const mid = midnightUtc(y, m, d);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const dayMinutes = Math.round((midnightUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()) - mid) / 60000);

    const steps = new Map();
    for (const r of fuelRows) {
      const t = elapsed(r["Time Stamp"], r["Time Zone"], mid);
      if (t < 0 || t > dayMinutes) continue;
      if (!steps.has(t)) steps.set(t, { clock: r["Time Stamp"].slice(11, 16), fuels: {} });
      steps.get(t).fuels[r["Fuel Category"]] = Number(r["Gen MW"]) || 0;
    }
    const loads = new Map();
    for (const r of loadRows) {
      if (!r.Load) continue;
      const t = elapsed(r["Time Stamp"], r["Time Zone"], mid);
      if (!loads.has(t)) loads.set(t, {});
      loads.get(t)[r.Name] = Number(r.Load);
    }

    const fuels = [...new Set([...steps.values()].flatMap((s) => Object.keys(s.fuels)))].sort();
    const zones = [...new Set([...loads.values()].flatMap((l) => Object.keys(l)))].sort();
    const loadTimes = [...loads.keys()].sort((a, b) => a - b);
    const out = {
      date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      dayMinutes, live: true, t: [], clock: [],
      fuels: Object.fromEntries(fuels.map((f) => [f, []])),
      zones: Object.fromEntries(zones.map((z) => [z, []])),
    };
    let li = 0;
    for (const t of [...steps.keys()].sort((a, b) => a - b)) {
      while (li + 1 < loadTimes.length && loadTimes[li + 1] <= t) li++;
      const zl = loads.get(loadTimes[li]) || {};
      out.t.push(t);
      out.clock.push(steps.get(t).clock);
      for (const f of fuels) out.fuels[f].push(Math.round(steps.get(t).fuels[f] || 0));
      for (const z of zones) out.zones[z].push(Math.round(zl[z] || 0));
    }

    // NYISO posts every 5 minutes; let Vercel's edge cache absorb repeat visits
    res.setHeader("Cache-Control", "public, s-maxage=240, stale-while-revalidate=600");
    res.status(200).json(out);
  } catch (e) {
    res.status(502).json({ error: `NYISO data is unavailable right now (${e.message}).` });
  }
}
