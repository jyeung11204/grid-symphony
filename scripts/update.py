"""Grid Symphony data pipeline.

Saves every completed day of New York grid data from NYISO and rebuilds the
small rollup files the site reads.

    python scripts/update.py                     # add missing days up to yesterday
    python scripts/update.py --since 2025-11-01  # backfill from a date

Layers written under data/:
    days/YYYY-MM-DD.json  5-minute fuel mix and zonal load (playable, kept forever)
    hourly/YYYY.json      hourly clean share and demand (year heatmap)
    daily.json            one summary row per day (trends and all-time)

NYISO sources: rtfuelmix (real-time fuel mix) and pal (zonal load), as daily
CSVs or monthly zip archives. Timestamps are Eastern time.
"""

import argparse
import csv
import io
import json
import time
import urllib.error
import urllib.request
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DAYS = DATA / "days"
HOURLY = DATA / "hourly"

BASE = "http://mis.nyiso.com/public/csv"
ET = ZoneInfo("America/New_York")
OFFSETS = {"EST": -5, "EDT": -4}
CLEAN = {"Hydro", "Nuclear", "Other Renewables", "Wind"}
KINDS = ("rtfuelmix", "pal")
REFRESH_DAYS = 2  # NYISO occasionally revises recent files


def get(url: str) -> bytes | None:
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "grid-symphony/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            err = e
        except urllib.error.URLError as e:
            err = e
        time.sleep(2 * (attempt + 1))
    raise SystemExit(f"Could not fetch {url}: {err}")


def parse(raw: bytes) -> list[dict]:
    return list(csv.DictReader(io.StringIO(raw.decode())))


def month_archive(kind: str, first: date) -> dict[date, list[dict]]:
    raw = get(f"{BASE}/{kind}/{first:%Y%m%d}{kind}_csv.zip")
    if not raw:
        return {}
    out = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        for name in z.namelist():
            try:
                d = datetime.strptime(name[:8], "%Y%m%d").date()
            except ValueError:
                continue
            out[d] = parse(z.read(name))
    return out


def daily_file(kind: str, d: date) -> list[dict] | None:
    raw = get(f"{BASE}/{kind}/{d:%Y%m%d}{kind}.csv")
    return parse(raw) if raw else None


def elapsed(ts: str, tz: str, midnight_utc: datetime) -> int:
    """Real minutes since local midnight, so a DST day keeps its 23 or 25 hours."""
    local = datetime.strptime(ts, "%m/%d/%Y %H:%M:%S")
    utc = local.replace(tzinfo=timezone(timedelta(hours=OFFSETS.get(tz, -5))))
    return round((utc - midnight_utc).total_seconds() / 60)


def build_day(d: date, fuel_rows: list[dict], load_rows: list[dict]) -> dict | None:
    midnight_utc = datetime(d.year, d.month, d.day, tzinfo=ET).astimezone(timezone.utc)
    next_utc = datetime(*(d + timedelta(days=1)).timetuple()[:3], tzinfo=ET).astimezone(timezone.utc)
    day_minutes = round((next_utc - midnight_utc).total_seconds() / 60)

    steps: dict[int, dict] = {}
    for r in fuel_rows:
        m = elapsed(r["Time Stamp"], r["Time Zone"], midnight_utc)
        if not 0 <= m <= day_minutes:
            continue
        s = steps.setdefault(m, {"clock": r["Time Stamp"][11:16], "fuels": {}})
        s["fuels"][r["Fuel Category"]] = float(r["Gen MW"] or 0)

    loads: dict[int, dict] = {}
    for r in load_rows:
        if not r.get("Load"):
            continue
        m = elapsed(r["Time Stamp"], r["Time Zone"], midnight_utc)
        loads.setdefault(m, {})[r["Name"]] = float(r["Load"])

    if len(steps) < 12 or not loads:
        return None

    fuels = sorted({f for s in steps.values() for f in s["fuels"]})
    zones = sorted({z for l in loads.values() for z in l})
    load_minutes = sorted(loads)
    out = {
        "date": d.isoformat(),
        "dayMinutes": day_minutes,
        "t": [],
        "clock": [],
        "fuels": {f: [] for f in fuels},
        "zones": {z: [] for z in zones},
    }
    li = 0
    for m in sorted(steps):
        # Latest load reading at or before this fuel-mix timestamp
        while li + 1 < len(load_minutes) and load_minutes[li + 1] <= m:
            li += 1
        zl = loads[load_minutes[li]]
        out["t"].append(m)
        out["clock"].append(steps[m]["clock"])
        for f in fuels:
            out["fuels"][f].append(round(steps[m]["fuels"].get(f, 0)))
        for z in zones:
            out["zones"][z].append(round(zl.get(z, 0)))
    return out


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":")) + "\n")


def fetch_days(wanted: list[date]) -> None:
    by_month: dict[date, list[date]] = {}
    for d in wanted:
        by_month.setdefault(d.replace(day=1), []).append(d)

    for first, days in sorted(by_month.items()):
        # Use the monthly archive when most of a month is missing; daily files otherwise
        if len(days) > 5:
            archives = {k: month_archive(k, first) for k in KINDS}
        else:
            archives = {k: {} for k in KINDS}
        saved = 0
        for d in days:
            rows = {k: archives[k].get(d) or daily_file(k, d) for k in KINDS}
            if not all(rows.values()):
                print(f"  {d}: not published yet")
                continue
            day = build_day(d, rows["rtfuelmix"], rows["pal"])
            if day:
                write_json(DAYS / f"{d.isoformat()}.json", day)
                saved += 1
        print(f"{first:%Y-%m}: saved {saved} of {len(days)} days")


def summarize(day: dict) -> tuple[dict, dict]:
    n = len(day["t"])
    total = [sum(day["fuels"][f][i] for f in day["fuels"]) for i in range(n)]
    clean = [sum(day["fuels"][f][i] for f in day["fuels"] if f in CLEAN) for i in range(n)]
    demand = [sum(day["zones"][z][i] for z in day["zones"]) for i in range(n)]
    share = [c / t if t else 0 for c, t in zip(clean, total)]
    # Readings past the day's last minute belong to tomorrow's midnight
    inside = [i for i in range(n) if day["t"][i] < day["dayMinutes"]]

    hours_c: list[list[float]] = [[] for _ in range(24)]
    hours_d: list[list[float]] = [[] for _ in range(24)]
    for i in inside:
        h = int(day["clock"][i][:2])
        hours_c[h].append(share[i])
        hours_d[h].append(demand[i])
    avg = lambda xs: sum(xs) / len(xs) if xs else None
    hourly = {
        "clean": [None if not v else round(avg(v) * 1000) for v in hours_c],
        "demand": [None if not v else round(avg(v)) for v in hours_d],
    }

    ip = max(inside, key=lambda i: demand[i])
    step_h = 5 / 60
    summary = {
        "date": day["date"],
        "clean": round(sum(clean[i] for i in inside) / max(1, sum(total[i] for i in inside)) * 1000),
        "cleanMin": round(min(share[i] for i in inside) * 1000),
        "cleanMax": round(max(share[i] for i in inside) * 1000),
        "peak": demand[ip],
        "peakAt": day["clock"][ip],
        "avgDemand": round(avg([demand[i] for i in inside])),
        "mwh": {f: round(sum(day["fuels"][f][i] for i in inside) * step_h) for f in day["fuels"]},
        "readings": len(inside),
    }
    return hourly, summary


def rebuild_rollups() -> None:
    files = sorted(DAYS.glob("*.json"))
    years: dict[str, dict] = {}
    daily = []
    zone_peaks: dict[str, int] = {}
    for p in files:
        day = json.loads(p.read_text())
        for z, vals in day["zones"].items():
            zone_peaks[z] = max(zone_peaks.get(z, 0), max(vals))
        hourly, summary = summarize(day)
        y = years.setdefault(day["date"][:4], {"dates": [], "clean": [], "demand": []})
        y["dates"].append(day["date"])
        y["clean"].append(hourly["clean"])
        y["demand"].append(hourly["demand"])
        daily.append(summary)
    for year, obj in years.items():
        write_json(HOURLY / f"{year}.json", {"year": int(year), **obj})
    write_json(DATA / "daily.json", {
        "updated": datetime.now(ET).strftime("%Y-%m-%d %H:%M %Z"),
        "years": sorted(int(y) for y in years),
        "zonePeaks": zone_peaks,
        "days": daily,
    })
    print(f"rollups: {len(daily)} days across {len(years)} year(s)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", type=date.fromisoformat, help="first day to backfill")
    args = ap.parse_args()

    yesterday = datetime.now(ET).date() - timedelta(days=1)
    have = {date.fromisoformat(p.stem) for p in DAYS.glob("*.json")}
    start = args.since or (min(have) if have else yesterday - timedelta(days=29))

    wanted = []
    d = start
    while d <= yesterday:
        if d not in have or (yesterday - d).days < REFRESH_DAYS:
            wanted.append(d)
        d += timedelta(days=1)

    if wanted:
        print(f"fetching {len(wanted)} day(s), {wanted[0]} to {wanted[-1]}")
        fetch_days(wanted)
    rebuild_rollups()


if __name__ == "__main__":
    main()
