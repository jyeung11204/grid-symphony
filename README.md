# Grid Symphony

New York's power grid, played as one minute of music a day.

Each power source is an instrument: nuclear is a low drone, hydro a slow pad, wind
breath and bells, solar and other renewables the melody, gas a buzzing drone with
brass stabs. The clean share sets the key (bright major when clean, tense Phrygian
when the grid leans on gas) and statewide demand sets the tempo. The music is
synthesized in the browser with the Web Audio API, so no audio is stored.

## Views

- **Today**: live data through the latest 5-minute reading
- **Trends**: the last 30 days, each playable, plus the month compressed into one minute
- **Year**: every hour of the year as a heatmap of clean share; click a day to hear it
- **All time**: daily clean share across the whole archive, and a summary by year

## Data

Source: [NYISO](https://www.nyiso.com/) real-time fuel mix (`rtfuelmix`) and zonal
load (`pal`), 5-minute readings, Eastern time.

| Path | What | Used by |
|---|---|---|
| `data/days/YYYY-MM-DD.json` | Every 5-minute reading: MW by fuel and by zone | Playing any day |
| `data/hourly/YYYY.json` | Hourly clean share (per mille) and demand (MW) | Year heatmap, Trends tiles |
| `data/daily.json` | One summary row per day, plus each zone's peak load | Trends, All time |

A GitHub Actions job (`.github/workflows/daily.yml`) runs every morning, saves the
previous day, re-fetches the day before in case NYISO revised it, rebuilds the
rollups and commits. Vercel redeploys on each commit. Git history is the change log.

`api/today.js` is a Vercel function that reads today's NYISO files for the live
view, since NYISO's CSVs can't be fetched from a browser directly.

## Run it yourself

```bash
python3 scripts/update.py                     # add missing days up to yesterday
python3 scripts/update.py --since 2024-01-01  # backfill from a date (uses monthly archives)
python3 -m http.server 4321                   # serve locally (the live Today view needs `vercel dev`)
```

No dependencies beyond the Python standard library.
