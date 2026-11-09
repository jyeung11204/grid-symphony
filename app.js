"use strict";

const DURATION = 60;

const FUELS = [
  { k: "Nuclear", c: "nuc", inst: "low drone", clean: true },
  { k: "Hydro", c: "hyd", inst: "flowing pad", clean: true },
  { k: "Wind", c: "wnd", inst: "breath and bells", clean: true },
  { k: "Other Renewables", c: "ren", inst: "plucks", clean: true, label: "Solar & other" },
  { k: "Natural Gas", c: "gas", inst: "buzzing saws", clean: false },
  { k: "Dual Fuel", c: "dual", inst: "brass stabs", clean: false },
  { k: "Other Fossil Fuels", c: "oth", inst: "rumble", clean: false, label: "Other fossil" },
];
const fuelLabel = (f) => f.label || f.k;

// Approximate zone centers, nudged apart where the downstate zones crowd together
const ZONES = [
  { k: "WEST", l: "A", n: "West", lon: -78.75, lat: 42.55, a: "below" },
  { k: "GENESE", l: "B", n: "Genesee", lon: -77.65, lat: 42.95, a: "below" },
  { k: "CENTRL", l: "C", n: "Central", lon: -76.2, lat: 42.85, a: "below" },
  { k: "NORTH", l: "D", n: "North", lon: -74.55, lat: 44.45, a: "right" },
  { k: "MHK VL", l: "E", n: "Mohawk Valley", lon: -75.25, lat: 43.55, a: "below" },
  { k: "CAPITL", l: "F", n: "Capital", lon: -73.95, lat: 42.8, a: "above" },
  { k: "HUD VL", l: "G", n: "Hudson Valley", lon: -74.35, lat: 41.75, a: "left" },
  { k: "MILLWD", l: "H", n: "Millwood", lon: -73.8, lat: 41.36, a: "right" },
  { k: "DUNWOD", l: "I", n: "Dunwoodie", lon: -73.68, lat: 41.08, a: "right" },
  { k: "N.Y.C.", l: "J", n: "New York City", lon: -74.05, lat: 40.7, a: "left" },
  { k: "LONGIL", l: "K", n: "Long Island", lon: -72.85, lat: 40.84, a: "below" },
];

const NY_OUTLINE = [[-79.76,42.0],[-75.36,42.0],[-75.07,41.8],[-74.69,41.36],[-74.21,41.13],[-73.9,40.99],[-74.04,40.75],[-74.26,40.5],[-74.0,40.57],[-73.75,40.59],[-73.2,40.63],[-72.5,40.8],[-71.86,41.07],[-72.3,41.0],[-72.6,40.92],[-73.0,40.96],[-73.5,40.9],[-73.73,40.82],[-73.66,41.0],[-73.48,41.21],[-73.55,41.29],[-73.5,42.05],[-73.26,42.75],[-73.35,43.6],[-73.4,44.2],[-73.34,45.01],[-74.74,44.99],[-75.3,44.85],[-75.8,44.45],[-76.2,44.2],[-76.35,43.95],[-76.2,43.55],[-76.7,43.35],[-77.6,43.25],[-78.4,43.37],[-79.06,43.27],[-79.05,43.08],[-78.92,42.9],[-79.1,42.7],[-79.76,42.27]];

const MODES = [
  { name: "Tense", scale: "Phrygian", steps: [0,1,3,5,7,8,10], prog: [0,1,8,6], chords: [[0,3,7,13],[0,4,7,11],[0,4,6,11],[0,3,6,9]] },
  { name: "Searching", scale: "Dorian", steps: [0,2,3,5,7,9,10], prog: [0,10,5,3], chords: [[0,3,7,10],[0,4,7,14],[0,4,7,9],[0,4,7,11]] },
  { name: "Open", scale: "Major", steps: [0,2,4,7,9], prog: [0,7,9,5], chords: [[0,4,7,14],[0,4,7,14],[0,3,7,10],[0,4,7,11]] },
];
const KEY = 2; // D

const $ = (id) => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const fmtMW = (v) => Math.round(v).toLocaleString("en-US");
const pct = (permille) => `${Math.round(permille / 10)}%`;
const tenseOf = (clean) => 1 - clamp((clean - 0.35) / 0.3);
const heat = (tense) => `color-mix(in srgb, var(--hot) ${Math.round(tense * 100)}%, var(--calm))`;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const parseDate = (iso) => new Date(iso + "T12:00:00");
const fmtDate = (iso, opts) => parseDate(iso).toLocaleDateString("en-US", opts);
const longDate = (iso) => fmtDate(iso, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const shortDate = (iso) => fmtDate(iso, { month: "short", day: "numeric" });
const addDays = (iso, n) => { const d = parseDate(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function to12(hhmm) {
  if (!hhmm) return "--:--";
  let [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}
const hourLabel = (hr) => (hr === 0 ? "12 AM" : hr === 12 ? "Noon" : hr < 12 ? `${hr} AM` : `${hr - 12} PM`);

// ---------- data store ----------
const store = { daily: null, hourly: {}, days: new Map() };

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw Object.assign(new Error(`${url}: ${r.status}`), { status: r.status });
  return r.json();
}
async function loadDaily() {
  if (!store.daily) {
    store.daily = await getJSON("data/daily.json");
    store.byDate = new Map(store.daily.days.map((d) => [d.date, d]));
    $("updated").textContent = `Archive: ${store.daily.days.length} days, updated ${store.daily.updated}`;
  }
  return store.daily;
}
async function loadHourly(year) {
  if (!store.hourly[year]) store.hourly[year] = await getJSON(`data/hourly/${year}.json`);
  return store.hourly[year];
}
async function loadDay(date) {
  if (!store.days.has(date)) store.days.set(date, await getJSON(`data/days/${date}.json`));
  return store.days.get(date);
}

// ---------- series (what the player plays) ----------
function prep(raw, meta) {
  const n = raw.t.length;
  const demand = [], total = [], clean = [];
  for (let i = 0; i < n; i++) {
    let tot = 0, cl = 0, dem = 0;
    for (const f of FUELS) { const v = (raw.fuels[f.k] || [])[i] || 0; tot += v; if (f.clean) cl += v; }
    for (const z of ZONES) dem += (raw.zones[z.k] || [])[i] || 0;
    total.push(tot); clean.push(tot ? cl / tot : 0); demand.push(dem);
  }
  const zoneMax = {};
  for (const z of ZONES) zoneMax[z.k] = store.daily?.zonePeaks?.[z.k] || Math.max(1, ...(raw.zones[z.k] || [1]));
  return { ...raw, ...meta, n, demand, total, clean, zoneMax, dMin: Math.min(...demand), dMax: Math.max(...demand) };
}

// Thirty days at hourly resolution, end to end
function monthSeries(days) {
  const out = { t: [], clock: [], dates: [], fuels: {}, zones: {}, dayMinutes: days.length * 1440 };
  FUELS.forEach((f) => (out.fuels[f.k] = []));
  ZONES.forEach((z) => (out.zones[z.k] = []));
  days.forEach((day, di) => {
    for (let h = 0; h < 24; h++) {
      const idx = [];
      for (let i = 0; i < day.t.length; i++) if (day.t[i] < day.dayMinutes && +day.clock[i].slice(0, 2) === h) idx.push(i);
      if (!idx.length) continue;
      const avg = (arr) => idx.reduce((s, i) => s + (arr?.[i] || 0), 0) / idx.length;
      out.t.push(di * 1440 + h * 60);
      out.clock.push(`${String(h).padStart(2, "0")}:00`);
      out.dates.push(day.date);
      FUELS.forEach((f) => out.fuels[f.k].push(avg(day.fuels[f.k])));
      ZONES.forEach((z) => out.zones[z.k].push(avg(day.zones[z.k])));
    }
  });
  return out;
}

let series = null;

function lerpArr(arr, i, f) { const a = arr[i] || 0, b = arr[Math.min(i + 1, arr.length - 1)] || 0; return a + (b - a) * f; }

function stateAt(p) {
  const x = clamp(p) * (series.n - 1);
  const i = Math.floor(x), f = x - i;
  const mw = {}, share = {};
  let total = 0;
  for (const fu of FUELS) { mw[fu.k] = lerpArr(series.fuels[fu.k] || [], i, f); total += mw[fu.k]; }
  for (const fu of FUELS) share[fu.k] = total ? mw[fu.k] / total : 0;
  const zones = {};
  for (const z of ZONES) zones[z.k] = lerpArr(series.zones[z.k] || [], i, f);
  const demand = lerpArr(series.demand, i, f);
  const clean = lerpArr(series.clean, i, f);
  const bright = clamp((clean - 0.35) / 0.3);
  const absD = clamp((demand - 9000) / (26000 - 9000));
  const relD = series.dMax > series.dMin ? (demand - series.dMin) / (series.dMax - series.dMin) : 0.5;
  const bpm = 60 + 50 * absD + 26 * relD;
  const modeIdx = bright > 0.62 ? 2 : bright > 0.38 ? 1 : 0;
  const idx = Math.round(x);
  return { p, idx, minute: lerpArr(series.t, i, f), clock: series.clock[idx], date: series.dates?.[idx] || series.date, mw, share, total, zones, demand, clean, bright, relD, bpm, modeIdx };
}

// ---------- audio ----------
class Engine {
  init() {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(3.4, 2.6);
    const vg = ctx.createGain(); vg.gain.value = 0.5; this.verb.connect(vg); vg.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;

    // Nuclear: drone
    this.nucG = this.gain(0, 0.15);
    this.nucO = [this.osc("sine", 73.4, this.nucG), this.osc("sine", 110, this.nucG, 3)];
    // Hydro: pad through a breathing lowpass
    const padF = this.padF = ctx.createBiquadFilter(); padF.type = "lowpass"; padF.frequency.value = 1200; padF.Q.value = 0.7;
    this.hydG = this.gain(0, 0.45); padF.connect(this.hydG);
    this.lfo(0.11, 350, padF.frequency);
    this.padO = [0, 1, 2].map((j) => this.osc("triangle", 220, padF, j * 4 - 4));
    // Wind: filtered noise
    const wn = ctx.createBufferSource(); wn.buffer = this.noise; wn.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = "bandpass"; wf.frequency.value = 1100; wf.Q.value = 1.4;
    this.lfo(0.07, 700, wf.frequency);
    this.wndG = this.gain(0, 0.6); wn.connect(wf); wf.connect(this.wndG); wn.start();
    // Gas: saw drone with a tension voice
    const gf = this.gasF = ctx.createBiquadFilter(); gf.type = "lowpass"; gf.frequency.value = 700; gf.Q.value = 3;
    this.gasG = this.gain(0, 0.1); gf.connect(this.gasG);
    this.gasO = [this.osc("sawtooth", 73.4, gf, -6), this.osc("sawtooth", 110, gf, 7)];
    this.tenG = ctx.createGain(); this.tenG.gain.value = 0; this.tenG.connect(gf);
    this.tenO = this.osc("sawtooth", 104, this.tenG, 0);
    // Other fossil: rumble
    const rn = ctx.createBufferSource(); rn.buffer = this.noise; rn.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = "lowpass"; rf.frequency.value = 110;
    this.othG = this.gain(0, 0); rn.connect(rf); rf.connect(this.othG); rn.start();
  }
  impulse(sec, decay) {
    const ctx = this.ctx, len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  gain(v, wet) {
    const g = this.ctx.createGain(); g.gain.value = v; g.connect(this.master);
    if (wet) { const w = this.ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.verb); }
    return g;
  }
  osc(type, freq, dest, detune = 0) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
    o.connect(dest); o.start(); return o;
  }
  lfo(rate, depth, param) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(param); o.start();
  }
  set(param, v, t, tc = 0.25) { param.setTargetAtTime(v, t, tc); }

  // Continuous layers follow the data
  layers(s, t) {
    const sh = s.share, tense = 1 - s.bright;
    this.set(this.nucG.gain, 0.3 * Math.pow(sh.Nuclear, 0.7), t);
    this.set(this.hydG.gain, 0.11 * Math.pow(sh.Hydro, 0.6), t);
    this.set(this.padF.frequency, 500 + 2200 * s.bright, t, 0.6);
    this.set(this.wndG.gain, 0.5 * Math.sqrt(sh.Wind), t);
    this.set(this.gasG.gain, 0.06 * Math.sqrt(sh["Natural Gas"] + 0.5 * sh["Dual Fuel"]) * (0.5 + tense), t);
    this.set(this.gasF.frequency, 350 + 2600 * tense * tense, t, 0.5);
    this.set(this.tenG.gain, 0.9 * clamp((tense - 0.3) / 0.5), t, 0.5);
    this.set(this.othG.gain, 1.2 * sh["Other Fossil Fuels"], t);
  }
  chord(mode, bar, t) {
    const root = mode.prog[bar % 4], ch = mode.chords[bar % 4];
    const glide = (o, m) => o.frequency.setTargetAtTime(mtof(m), t, 0.08);
    glide(this.nucO[0], 38 + KEY + root); glide(this.nucO[1], 38 + KEY + root + 7);
    this.padO.forEach((o, j) => glide(o, 52 + KEY + root + ch[j + 1]));
    glide(this.gasO[0], 38 + KEY + root); glide(this.gasO[1], 38 + KEY + root + 7);
    glide(this.tenO, 50 + KEY + root + (mode === MODES[0] ? 1 : 6));
    return { root, ch };
  }
  env(node, t, peak, attack, dur, wet) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g); g.connect(this.master);
    if (wet) { const w = this.ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.verb); }
  }
  pluck(t, m, vol, bright) {
    const o = this.ctx.createOscillator(); o.type = bright > 0.5 ? "triangle" : "square"; o.frequency.value = mtof(m);
    const f = this.ctx.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(900 + 4200 * bright, t); f.frequency.exponentialRampToValueAtTime(320, t + 0.35);
    o.connect(f); this.env(f, t, vol, 0.004, 0.45, 0.35); o.start(t); o.stop(t + 0.5);
  }
  bell(t, m, vol) {
    [[1, 1], [2.76, 0.3], [5.4, 0.12]].forEach(([r, a]) => {
      const o = this.ctx.createOscillator(); o.frequency.value = mtof(m) * r;
      this.env(o, t, vol * a, 0.003, 2.4 / r, 0.8); o.start(t); o.stop(t + 2.5);
    });
  }
  thump(t, vol) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    this.env(o, t, vol, 0.004, 0.32, 0); o.start(t); o.stop(t + 0.35);
  }
  tick(t, vol) {
    const n = this.ctx.createBufferSource(); n.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7000;
    n.connect(f); this.env(f, t, vol, 0.001, 0.05, 0.1); n.start(t, Math.random()); n.stop(t + 0.06);
  }
  stab(t, ms, vol, cut) {
    const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cut; f.Q.value = 2;
    ms.forEach((m) => { const o = this.ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(m); o.connect(f); o.start(t); o.stop(t + 0.25); });
    this.env(f, t, vol, 0.01, 0.22, 0.25);
  }
}

const engine = new Engine();
const player = { playing: false, pos: 1, t0: 0, startPos: 0, nextTime: 0, step: 0, timer: null, lastBeat: -1, beats: [], harmony: null, mode: null };

function posNow() {
  if (!player.playing) return player.pos;
  return player.startPos + (engine.ctx.currentTime - player.t0) / DURATION;
}

function scheduler() {
  const ctx = engine.ctx;
  while (player.nextTime < ctx.currentTime + 0.15) {
    const t = player.nextTime;
    const p = player.startPos + (t - player.t0) / DURATION;
    if (p >= 1) { finish(); return; }
    const s = stateAt(p);
    const k = player.step;
    if (k % 16 === 0) {
      player.mode = MODES[s.modeIdx];
      player.harmony = engine.chord(player.mode, k / 16, t);
    }
    if (k % 4 === 0) engine.layers(s, t);
    playStep(s, t, k);
    player.nextTime += 60 / s.bpm / 4;
    player.step++;
  }
}

function playStep(s, t, k) {
  const sh = s.share, tense = 1 - s.bright, { root, ch } = player.harmony;
  // Demand: heartbeat on each beat
  if (k % 4 === 0) { engine.thump(t, 0.25 + 0.35 * s.relD); player.beats.push(t); }
  // Melody: plucks over the chord, busier with more renewables and higher demand
  const every = s.relD > 0.66 ? 1 : s.relD > 0.3 ? 2 : 4;
  if (k % every === 0 && Math.random() < 0.55 + 6 * sh["Other Renewables"]) {
    const pattern = [0, 1, 2, 3, 2, 1, 3, 2];
    const j = pattern[(k / every) % 8 | 0];
    const oct = s.bright > 0.62 && (k >> 4) % 2 ? 12 : 0;
    engine.pluck(t, 62 + KEY + root + ch[j] - (root > 6 ? 12 : 0) + oct, 0.05 + 1.2 * sh["Other Renewables"], s.bright);
  }
  // Wind: bells on the eighths
  if (k % 2 === 0 && Math.random() < 5 * sh.Wind) {
    const sc = player.mode.steps;
    engine.bell(t, 81 + KEY + sc[(Math.random() * sc.length) | 0], 0.06 + 0.5 * sh.Wind);
  }
  // Dual fuel: brass stabs, more of them when the grid is strained
  if (k % 4 === 2 && Math.random() < 3 * sh["Dual Fuel"] * (0.3 + tense)) {
    engine.stab(t, [50 + KEY + root, 50 + KEY + root + ch[1], 50 + KEY + root + ch[2]], 0.05 + 0.1 * tense, 600 + 2400 * tense);
  }
  // Strain: hi-hat ticks fill in as the clean share drops
  if (tense > 0.35 && Math.random() < (tense - 0.3) * 1.4) engine.tick(t, 0.02 + 0.06 * tense);
}

async function play() {
  if (!series) return;
  if (!engine.ctx) engine.init();
  if (engine.ctx.state === "suspended") await engine.ctx.resume();
  if (player.pos >= 0.999) player.pos = 0;
  const now = engine.ctx.currentTime;
  player.playing = true;
  player.startPos = player.pos;
  player.t0 = now + 0.05;
  player.nextTime = player.t0;
  player.step = 0;
  engine.layers(stateAt(player.pos), now);
  engine.master.gain.cancelScheduledValues(now);
  engine.master.gain.setTargetAtTime(0.8, now, 0.3);
  player.timer = setInterval(scheduler, 25);
  scheduler();
  updateButton();
}

function pause() {
  if (!player.playing) return;
  player.pos = clamp(posNow());
  player.playing = false;
  clearInterval(player.timer);
  const now = engine.ctx.currentTime;
  engine.master.gain.cancelScheduledValues(now);
  engine.master.gain.setTargetAtTime(0, now, 0.15);
  player.beats = [];
  updateButton();
}

function finish() {
  player.playing = false;
  clearInterval(player.timer);
  engine.master.gain.setTargetAtTime(0, engine.ctx.currentTime, 0.8);
  player.pos = 1;
  player.beats = [];
  updateButton();
  render(stateAt(1));
}

function seek(p) {
  const wasPlaying = player.playing;
  if (wasPlaying) pause();
  player.pos = clamp(p);
  if (wasPlaying && player.pos < 0.999) play(); else render(stateAt(player.pos));
}

function updateButton() {
  const fresh = player.pos >= 0.999;
  $("play-label").textContent = player.playing ? "Pause" : !fresh && player.pos > 0.001 ? "Resume" : series?.kind === "month" ? "Play the month" : "Play this day";
  $("play-icon").setAttribute("d", player.playing ? "M7 5h4v14H7zM13 5h4v14h-4z" : "M8 5v14l11-7z");
  $("now-title").textContent = player.playing ? "Now playing" : fresh ? (series?.kind === "month" ? "Last hour" : "Latest reading") : "Paused at";
}

// ---------- map ----------
const LON0 = -79.95, LAT1 = 45.15, K = 92, CX = Math.cos(42.7 * Math.PI / 180);
const proj = (lon, lat) => [(lon - LON0) * CX * K + 12, (LAT1 - lat) * K + 12];
const zoneEls = {};

function buildMap() {
  const svg = $("map");
  const pts = NY_OUTLINE.map(([lo, la]) => proj(lo, la).map((v) => v.toFixed(1)).join(",")).join(" ");
  const water = [["Lake Ontario", -77.6, 43.75], ["Lake Erie", -79.6, 42.45]]
    .map(([n, lo, la]) => { const [x, y] = proj(lo, la); return `<text class="water" x="${x}" y="${y}" text-anchor="middle">${n}</text>`; }).join("");
  let html = `<polygon class="land" points="${pts}"/>${water}`;
  for (const z of ZONES) {
    const [x, y] = proj(z.lon, z.lat);
    html += `<g data-z="${z.k}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
      <circle class="calm" r="10" fill="var(--calm)" fill-opacity=".9"/>
      <circle class="hot" r="10" fill="var(--hot)" fill-opacity="0"/>
      <circle class="ring" r="10" fill="none" stroke="var(--ink)" stroke-opacity=".35" stroke-width="1"/>
      <text class="zone-label"></text><text class="zone-mw"></text></g>`;
  }
  svg.innerHTML = html;
  for (const z of ZONES) {
    const g = svg.querySelector(`[data-z="${CSS.escape(z.k)}"]`);
    zoneEls[z.k] = { g, circles: g.querySelectorAll("circle"), hot: g.querySelector(".hot"), label: g.querySelector(".zone-label"), mw: g.querySelector(".zone-mw") };
    zoneEls[z.k].label.innerHTML = `<tspan class="zone-letter">${z.l}</tspan> ${z.n}`;
  }
}

function placeLabel(z, r) {
  const e = zoneEls[z.k], gap = 5;
  let x = 0, y = 0, anchor = "middle";
  if (z.a === "below") y = r + 13;
  if (z.a === "above") y = -r - 18;
  if (z.a === "right") { x = r + gap; anchor = "start"; y = -2; }
  if (z.a === "left") { x = -r - gap; anchor = "end"; y = -2; }
  for (const el of [e.label, e.mw]) { el.setAttribute("x", x); el.setAttribute("text-anchor", anchor); }
  e.label.setAttribute("y", y);
  e.mw.setAttribute("y", y + 12);
}

function renderMap(s, pulse) {
  for (const z of ZONES) {
    const load = s.zones[z.k];
    const r = Math.max(5, Math.sqrt(load) * 0.36);
    const strain = clamp((load / series.zoneMax[z.k] - 0.5) / 0.5);
    const e = zoneEls[z.k];
    const rr = r * (1 + 0.1 * pulse * (0.4 + strain));
    e.circles.forEach((c) => c.setAttribute("r", rr.toFixed(2)));
    e.hot.setAttribute("fill-opacity", (strain * 0.95).toFixed(3));
    e.mw.textContent = `${fmtMW(load)} MW`;
    placeLabel(z, r);
  }
}

// ---------- now panel ----------
function buildMix() {
  $("mix").innerHTML = FUELS.map((f) => `<li data-f="${f.k}">
    <div class="name">${fuelLabel(f).replace("&", "&amp;")}<span>${f.inst}</span></div>
    <div class="mw">–</div><div class="bar"><b style="background:var(--${f.c})"></b></div></li>`).join("");
}

function renderNow(s) {
  $("clock").innerHTML = `${series.kind === "month" ? to12(s.clock).replace(":00", "") : to12(s.clock)}<small>ET</small>`;
  if (series.kind === "month") $("now-date").textContent = fmtDate(s.date, { weekday: "short", month: "short", day: "numeric" });
  $("s-demand").textContent = `${fmtMW(s.demand)} MW`;
  $("s-clean").textContent = `${Math.round(s.clean * 100)}%`;
  $("s-bpm").textContent = `${Math.round(s.bpm)} bpm`;
  const m = MODES[s.modeIdx];
  $("mood-text").textContent = `${m.name} · ${m.scale} key`;
  $("mood").style.setProperty("--strain", (1 - s.bright).toFixed(2));
  for (const li of $("mix").children) {
    const k = li.dataset.f;
    li.querySelector(".mw").textContent = fmtMW(s.mw[k]);
    li.querySelector("b").style.width = `${(s.share[k] * 100).toFixed(1)}%`;
  }
}

// ---------- day chart ----------
const chart = { w: 0, h: 0, pad: { l: 52, r: 12, t: 12, b: 46 } };

function tickMarks() {
  const ticks = [];
  if (series.kind === "month") {
    for (let d = 0; d < series.dayMinutes / 1440; d += 7) {
      const iso = series.dates[series.t.findIndex((v) => v >= d * 1440)] || series.dates[0];
      ticks.push([d * 1440, shortDate(iso)]);
    }
    return ticks;
  }
  const step = chart.w < 520 ? 360 : 180;
  for (let m = 0; m <= series.dayMinutes; m += step) {
    // Read the wall-clock hour from the data where it exists, so DST days label correctly
    const near = series.t.findIndex((v) => Math.abs(v - m) <= 5);
    const hr = near >= 0 && m < series.dayMinutes ? Number(series.clock[near].slice(0, 2)) : Math.round(m / 60) % 24;
    ticks.push([m, hourLabel(hr)]);
  }
  return ticks;
}

function buildChart() {
  const svg = $("chart");
  const w = svg.clientWidth || 800, h = w < 520 ? 240 : 290;
  chart.w = w; chart.h = h;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.setAttribute("height", h);
  const { l, r, t, b } = chart.pad;
  const pw = w - l - r, ph = h - t - b;
  const ymax = Math.ceil(Math.max(...series.demand, ...series.total) * 1.04 / 5000) * 5000;
  const X = (m) => l + (m / series.dayMinutes) * pw;
  const Y = (v) => t + ph - (v / ymax) * ph;
  chart.X = X; chart.Y = Y;

  let html = "";
  for (let v = 0; v <= ymax; v += 5000) {
    html += `<line x1="${l}" x2="${w - r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/>`;
    html += `<text x="${l - 8}" y="${Y(v) + 4}" text-anchor="end">${v ? v / 1000 + "k MW" : "0"}</text>`;
  }
  for (const [m, lab] of tickMarks()) {
    html += `<text x="${X(m)}" y="${t + ph + 16}" text-anchor="${m === 0 ? "start" : m >= series.dayMinutes ? "end" : "middle"}">${lab}</text>`;
  }

  // Stacked fuel areas
  const base = new Array(series.n).fill(0);
  for (const f of FUELS) {
    const vals = series.fuels[f.k] || [];
    if (!vals.some((v) => v > 0)) continue;
    const top = base.map((b0, i) => b0 + (vals[i] || 0));
    let d = `M${X(series.t[0])},${Y(top[0])}`;
    for (let i = 1; i < series.n; i++) d += `L${X(series.t[i]).toFixed(1)},${Y(top[i]).toFixed(1)}`;
    for (let i = series.n - 1; i >= 0; i--) d += `L${X(series.t[i]).toFixed(1)},${Y(base[i]).toFixed(1)}`;
    html += `<path d="${d}Z" fill="var(--${f.c})" fill-opacity=".85"/>`;
    for (let i = 0; i < series.n; i++) base[i] = top[i];
  }
  let dl = "";
  for (let i = 0; i < series.n; i++) dl += `${i ? "L" : "M"}${X(series.t[i]).toFixed(1)},${Y(series.demand[i]).toFixed(1)}`;
  html += `<path d="${dl}" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-dasharray="4 3"/>`;
  // Clean-share color field
  const fy = t + ph + 24, fh = 10;
  html += `<rect x="${X(0)}" y="${fy}" width="${pw}" height="${fh}" rx="3" fill="var(--line)"/>`;
  const stepMin = series.kind === "month" ? 60 : 5;
  for (let i = 0; i < series.n; i++) {
    const x0 = X(series.t[i]), x1 = X(i + 1 < series.n ? series.t[i + 1] : series.t[i] + stepMin);
    html += `<rect x="${x0.toFixed(1)}" y="${fy}" width="${(x1 - x0 + 0.6).toFixed(1)}" height="${fh}" style="fill:${heat(tenseOf(series.clean[i]))}"/>`;
  }
  html += `<line id="ph" y1="${t}" y2="${fy + fh}" stroke="var(--ink)" stroke-width="1.5"/><circle id="ph-dot" r="4.5" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/>`;
  svg.innerHTML = html;
}

function renderPlayhead(s) {
  const ph = $("ph"), dot = $("ph-dot");
  if (!ph) return;
  const x = chart.X(s.minute);
  ph.setAttribute("x1", x); ph.setAttribute("x2", x);
  dot.setAttribute("cx", x); dot.setAttribute("cy", chart.Y(s.demand));
  $("chart").setAttribute("aria-valuenow", Math.round(s.p * 100));
  $("chart").setAttribute("aria-valuetext", `${series.kind === "month" ? shortDate(s.date) + " " : ""}${to12(s.clock)}`);
}

function buildLegend() {
  $("chart-legend").innerHTML = FUELS.filter((f) => (series.fuels[f.k] || []).some((v) => v > 0))
    .map((f) => `<span><i style="background:var(--${f.c})"></i>${fuelLabel(f)}</span>`).join("")
    + `<span><svg width="18" height="10" aria-hidden="true"><line x1="0" x2="18" y1="5" y2="5" stroke="var(--ink)" stroke-width="1.6" stroke-dasharray="4 3"/></svg>Demand (the gap is imports)</span>`
    + `<span><i style="background:linear-gradient(90deg,var(--calm),var(--hot))"></i>Strip: clean share, cool to strained</span>`;
}

function buildSummary() {
  let tot = 0, cl = 0, iMax = 0, iClean = 0, iDirty = 0;
  for (let i = 0; i < series.n; i++) {
    tot += series.total[i]; cl += series.total[i] * series.clean[i];
    if (series.demand[i] > series.demand[iMax]) iMax = i;
    if (series.clean[i] > series.clean[iClean]) iClean = i;
    if (series.clean[i] < series.clean[iDirty]) iDirty = i;
  }
  const at = (i) => (series.kind === "month" ? `${shortDate(series.dates[i])}, ${to12(series.clock[i])}` : to12(series.clock[i]));
  $("summary").innerHTML = [
    ["Clean share", `${Math.round((cl / tot) * 100)}%`],
    ["Peak demand", `${fmtMW(series.demand[iMax])} MW at ${at(iMax)}`],
    ["Cleanest", `${Math.round(series.clean[iClean] * 100)}% at ${at(iClean)}`],
    ["Most strained", `${Math.round(series.clean[iDirty] * 100)}% clean at ${at(iDirty)}`],
  ].map(([k, v]) => `<span>${k} <strong>${v}</strong></span>`).join("");
}

function render(s, pulse = 0) { renderMap(s, pulse); renderNow(s); renderPlayhead(s); }

function frame() {
  if (player.playing) {
    const now = engine.ctx.currentTime;
    while (player.beats.length && player.beats[0] <= now) player.lastBeat = player.beats.shift();
    const pulse = reduceMotion ? 0 : Math.exp(-(now - player.lastBeat) * 7);
    render(stateAt(clamp(posNow())), pulse);
  }
  requestAnimationFrame(frame);
}

// Load a series into the player view
function setSeries(s, { autoplay = false } = {}) {
  pause();
  series = s;
  player.pos = 1;
  $("p-eyebrow").textContent = s.eyebrow;
  $("p-title").textContent = s.title;
  $("p-note").textContent = s.note || "";
  $("chart-title").textContent = s.kind === "month" ? "Thirty days of fuel mix" : "The day's fuel mix";
  if (s.kind !== "month") $("now-date").textContent = fmtDate(s.date, { weekday: "short", month: "short", day: "numeric" });

  // Previous and next saved days
  const prev = $("p-prev"), next = $("p-next");
  if (s.kind === "month" || !store.byDate) { prev.hidden = next.hidden = true; }
  else {
    const p = addDays(s.date, -1), n = addDays(s.date, 1);
    prev.hidden = !store.byDate.has(p);
    next.hidden = !(store.byDate.has(n) || n === todayISO());
    prev.href = `#day-${p}`; prev.querySelector("span").textContent = shortDate(p);
    next.href = n === todayISO() ? "#today" : `#day-${n}`; next.querySelector("span").textContent = n === todayISO() ? "Today" : shortDate(n);
  }
  buildChart(); buildLegend(); buildSummary(); updateButton();
  render(stateAt(player.pos));
  if (autoplay) play().catch(() => {});
}

function playerMessage(title, note) {
  pause();
  series = null;
  $("p-title").textContent = title;
  $("p-note").textContent = note;
}

// ---------- views ----------
const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
let pendingAutoplay = false;
let todayTimer = null;

function showView(name, tab) {
  for (const v of ["player", "trends", "year", "all"]) $(`view-${v}`).hidden = v !== name;
  for (const a of $("tabs").children) {
    if (a.dataset.v === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  if (name !== "player") pause();
  clearInterval(todayTimer);
}

async function showToday() {
  showView("player", "today");
  await loadDaily().catch(() => {});
  const lastSaved = store.daily?.days.at(-1)?.date;
  const fallback = async (why) => {
    if (!lastSaved) return playerMessage("No data yet", why);
    const day = await loadDay(lastSaved);
    setSeries(prep(day, { kind: "day", eyebrow: "Latest full day", title: longDate(lastSaved), note: why }), { autoplay: consumeAutoplay() });
  };
  try {
    const live = await getJSON("api/today");
    if (live.t.length < 12) return fallback("NYISO has only posted a few readings for today, so this is the most recent full day.");
    const last = to12(live.clock.at(-1));
    const autoplay = consumeAutoplay();
    if (!(player.playing && series?.live)) {
      setSeries(prep(live, { kind: "day", live: true, eyebrow: "Today so far · live", title: longDate(live.date), note: `Through ${last} ET. Refreshes every five minutes.` }), { autoplay });
    }
    // Keep today current while the page sits open
    todayTimer = setInterval(() => {
      const onToday = ["", "today"].includes(location.hash.replace("#", ""));
      if (onToday && !player.playing && player.pos >= 0.999) showToday();
    }, 5 * 60e3);
  } catch {
    await fallback("Live data isn't reachable right now, so this is the most recent full day.");
  }
}

async function showDay(date) {
  showView("player", "");
  await loadDaily().catch(() => {});
  try {
    const day = await loadDay(date);
    setSeries(prep(day, { kind: "day", eyebrow: "Saved day", title: longDate(date) }), { autoplay: consumeAutoplay() });
  } catch {
    playerMessage(longDate(date), "No data is saved for this day. The archive starts on " + (store.daily ? longDate(store.daily.days[0].date) : "its first saved day") + ".");
  }
}

async function showMonth() {
  showView("player", "trends");
  const daily = await loadDaily();
  const last30 = daily.days.slice(-30).map((d) => d.date);
  $("p-eyebrow").textContent = "Last 30 days";
  $("p-title").textContent = "Loading 30 days…";
  const days = await Promise.all(last30.map(loadDay));
  const s = monthSeries(days);
  setSeries(prep(s, {
    kind: "month", eyebrow: "The month in one minute",
    title: `${shortDate(last30[0])} – ${shortDate(last30.at(-1))}`,
    note: "Thirty days at hourly resolution, played end to end. Each day lasts two seconds.",
    date: last30.at(-1),
  }), { autoplay: consumeAutoplay() });
}

function consumeAutoplay() { const a = pendingAutoplay; pendingAutoplay = false; return a; }

async function showTrends() {
  showView("trends", "trends");
  const daily = await loadDaily();
  const days = daily.days.slice(-30);
  const years = [...new Set(days.map((d) => d.date.slice(0, 4)))];
  const hourly = Object.fromEntries(await Promise.all(years.map(async (y) => [y, await loadHourly(y)])));
  const hoursFor = (iso) => { const h = hourly[iso.slice(0, 4)]; const i = h.dates.indexOf(iso); return i >= 0 ? h.clean[i] : []; };

  const avg = days.reduce((s, d) => s + d.clean, 0) / days.length;
  const best = days.reduce((a, b) => (b.clean > a.clean ? b : a));
  const worst = days.reduce((a, b) => (b.clean < a.clean ? b : a));
  $("t-note").innerHTML = `${shortDate(days[0].date)} to ${shortDate(days.at(-1).date)}. Average <strong>${pct(avg)}</strong> clean. Cleanest <a href="#day-${best.date}">${shortDate(best.date)}</a> at ${pct(best.clean)}; most strained <a href="#day-${worst.date}">${shortDate(worst.date)}</a> at ${pct(worst.clean)}.`;

  drawBars(days, avg);

  $("tiles").innerHTML = days.slice().reverse().map((d) => {
    const band = Array.from({ length: 24 }, (_, h) => {
      const c = hoursFor(d.date)[h];
      return `<span${c == null ? "" : ` style="background:${heat(tenseOf(c / 1000))}"`}></span>`;
    }).join("");
    return `<a class="tile" href="#day-${d.date}" data-play="1" aria-label="Play ${longDate(d.date)}">
      <div class="when"><span class="d">${shortDate(d.date)}</span><span class="w">${fmtDate(d.date, { weekday: "short" })}</span></div>
      <div class="band" aria-hidden="true">${band}</div>
      <div class="nums"><span><b>${pct(d.clean)}</b> clean</span><span class="go"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></div>
      <div class="nums"><span>Peak ${(d.peak / 1000).toFixed(1)} GW</span><span>${to12(d.peakAt)}</span></div>
    </a>`;
  }).join("");
}

function drawBars(days, avg) {
  const svg = $("t-bars");
  const w = svg.clientWidth || 800, h = 170, l = 40, r = 8, t = 10, b = 26;
  const pw = w - l - r, ph = h - t - b, ymax = 0.7;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.setAttribute("height", h);
  const Y = (v) => t + ph - (v / ymax) * ph;
  const bw = pw / days.length;
  let html = "";
  for (const v of [0, 0.2, 0.4, 0.6]) html += `<line x1="${l}" x2="${w - r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${l - 6}" y="${Y(v) + 4}" text-anchor="end">${v * 100}%</text>`;
  days.forEach((d, i) => {
    const v = d.clean / 1000, x = l + i * bw + 1.5;
    html += `<rect class="day" data-date="${d.date}" x="${x.toFixed(1)}" y="${Y(v).toFixed(1)}" width="${Math.max(1, bw - 3).toFixed(1)}" height="${(Y(0) - Y(v)).toFixed(1)}" rx="2" style="fill:${heat(tenseOf(v))}"><title>${longDate(d.date)}: ${pct(d.clean)} clean</title></rect>`;
    if ((days.length - 1 - i) % 7 === 0) html += `<text x="${(x + bw / 2).toFixed(1)}" y="${h - 8}" text-anchor="middle">${shortDate(d.date)}</text>`;
  });
  html += `<line x1="${l}" x2="${w - r}" y1="${Y(avg / 1000)}" y2="${Y(avg / 1000)}" stroke="var(--ink)" stroke-dasharray="4 3"/>`;
  html += `<text x="${w - r}" y="${Y(avg / 1000) - 5}" text-anchor="end" style="fill:var(--ink)">30-day average ${pct(avg)}</text>`;
  svg.innerHTML = html;
}

async function showYear(year) {
  showView("year", "year");
  const daily = await loadDaily();
  year = Number(year) || daily.years.at(-1);
  $("y-years").innerHTML = daily.years.map((y) => `<a href="#year-${y}" ${y === year ? 'aria-current="page"' : ""}>${y}</a>`).join("");
  $("y-title").textContent = String(year);
  const hourly = await loadHourly(year);
  const rows = daily.days.filter((d) => d.date.startsWith(String(year)));
  if (rows.length) {
    const avg = rows.reduce((s, d) => s + d.clean, 0) / rows.length;
    const best = rows.reduce((a, b) => (b.clean > a.clean ? b : a));
    const worst = rows.reduce((a, b) => (b.clean < a.clean ? b : a));
    const peak = rows.reduce((a, b) => (b.peak > a.peak ? b : a));
    $("y-summary").innerHTML = [
      ["Days saved", rows.length],
      ["Average clean", pct(avg)],
      ["Cleanest day", `<a href="#day-${best.date}">${shortDate(best.date)}</a> ${pct(best.clean)}`],
      ["Most strained", `<a href="#day-${worst.date}">${shortDate(worst.date)}</a> ${pct(worst.clean)}`],
      ["Peak demand", `<a href="#day-${peak.date}">${shortDate(peak.date)}</a> ${fmtMW(peak.peak)} MW`],
    ].map(([k, v]) => `<span>${k} <strong>${v}</strong></span>`).join("");
  }
  heatState.year = year; heatState.hourly = hourly;
  drawHeat();
}

const heatState = { year: null, hourly: null, cell: 3, top: 4, left: 46 };

function hexToRgb(hex) {
  const h = hex.trim().replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function drawHeat() {
  const { year, hourly } = heatState;
  if (!hourly) return;
  const canvas = $("heat"), wrap = $("heat-wrap");
  const css = getComputedStyle(document.documentElement);
  const calm = hexToRgb(css.getPropertyValue("--calm")), hot = hexToRgb(css.getPropertyValue("--hot"));
  const empty = css.getPropertyValue("--line").trim(), muted = css.getPropertyValue("--muted").trim();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const nDays = (Date.UTC(year + 1, 0, 1) - jan1) / 864e5;
  const left = heatState.left, top = heatState.top, bottom = 22;
  const cw = Math.max(2, Math.floor((wrap.clientWidth - left - 4) / nDays));
  const ch = 9;
  heatState.cell = cw; heatState.ch = ch;
  const W = left + cw * nDays + 4, H = top + ch * 24 + bottom;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = empty;
  ctx.fillRect(left, top, cw * nDays, ch * 24);
  const index = new Map(hourly.dates.map((d, i) => [d, i]));
  for (let d = 0; d < nDays; d++) {
    const iso = new Date(jan1.getTime() + d * 864e5).toISOString().slice(0, 10);
    const i = index.get(iso);
    if (i == null) continue;
    hourly.clean[i].forEach((c, h) => {
      if (c == null) return;
      const k = tenseOf(c / 1000);
      ctx.fillStyle = `rgb(${calm.map((v, j) => Math.round(v + (hot[j] - v) * k)).join(",")})`;
      ctx.fillRect(left + d * cw, top + h * ch, cw, ch);
    });
  }
  ctx.fillStyle = muted;
  ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (const h of [0, 6, 12, 18]) ctx.fillText(hourLabel(h), left - 6, top + h * ch + ch / 2);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  for (let m = 0; m < 12; m++) {
    const d = (Date.UTC(year, m, 1) - jan1) / 864e5;
    ctx.fillText(new Date(Date.UTC(year, m, 15)).toLocaleString("en-US", { month: "short", timeZone: "UTC" }), left + d * cw + 2, top + ch * 24 + 16);
  }
  heatState.jan1 = jan1; heatState.nDays = nDays; heatState.index = index;
}

function heatHit(e) {
  const { left, top, cell, ch, jan1, nDays, hourly, index } = heatState;
  const rect = $("heat").getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const d = Math.floor((x - left) / cell), h = Math.floor((y - top) / ch);
  if (d < 0 || d >= nDays || h < 0 || h > 23) return null;
  const iso = new Date(jan1.getTime() + d * 864e5).toISOString().slice(0, 10);
  const i = index.get(iso);
  return { iso, h, x, y, clean: i == null ? null : hourly.clean[i][h], demand: i == null ? null : hourly.demand[i][h], saved: i != null };
}

async function showAll() {
  showView("all", "all");
  const daily = await loadDaily();
  const days = daily.days;
  $("a-note").textContent = `${days.length} days saved, from ${longDate(days[0].date)} to ${longDate(days.at(-1).date)}.`;
  drawAll(days);

  const byYear = {};
  for (const d of days) (byYear[d.date.slice(0, 4)] ||= []).push(d);
  const rows = Object.entries(byYear).sort().reverse().map(([y, ds]) => {
    const mwh = {}; let tot = 0;
    for (const d of ds) for (const [f, v] of Object.entries(d.mwh)) { mwh[f] = (mwh[f] || 0) + v; tot += v; }
    const clean = FUELS.filter((f) => f.clean).reduce((s, f) => s + (mwh[f.k] || 0), 0) / tot;
    const best = ds.reduce((a, b) => (b.clean > a.clean ? b : a));
    const peak = ds.reduce((a, b) => (b.peak > a.peak ? b : a));
    const bar = FUELS.map((f) => `<span title="${fuelLabel(f)} ${Math.round(((mwh[f.k] || 0) / tot) * 100)}%" style="width:${(((mwh[f.k] || 0) / tot) * 100).toFixed(2)}%;background:var(--${f.c})"></span>`).join("");
    return `<tr><td><a href="#year-${y}">${y}</a></td><td class="num">${ds.length}</td><td class="num">${Math.round(clean * 100)}%</td>
      <td class="num"><a href="#day-${peak.date}">${fmtMW(peak.peak)} MW</a> · ${shortDate(peak.date)}</td>
      <td class="num"><a href="#day-${best.date}">${shortDate(best.date)}</a> · ${pct(best.clean)}</td>
      <td><div class="mixbar">${bar}</div></td></tr>`;
  }).join("");
  $("a-table").innerHTML = `<thead><tr><th>Year</th><th>Days</th><th>Clean energy</th><th>Peak demand</th><th>Cleanest day</th><th>Generation mix</th></tr></thead><tbody>${rows}</tbody>`;
}

const allState = {};
function drawAll(days) {
  const svg = $("a-chart");
  const w = svg.clientWidth || 800, h = w < 520 ? 220 : 280, l = 40, r = 10, t = 10, b = 26;
  const pw = w - l - r, ph = h - t - b, lo = 0.25, hi = 0.7;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.setAttribute("height", h);
  const t0 = parseDate(days[0].date).getTime(), t1 = parseDate(days.at(-1).date).getTime() || t0 + 1;
  const X = (iso) => l + ((parseDate(iso).getTime() - t0) / Math.max(1, t1 - t0)) * pw;
  const Y = (v) => t + ph - ((v - lo) / (hi - lo)) * ph;
  Object.assign(allState, { days, X, l, pw, t0, t1 });
  let html = "";
  for (const v of [0.3, 0.4, 0.5, 0.6, 0.7]) html += `<line x1="${l}" x2="${w - r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${l - 6}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`;
  // Month ticks, thinned to fit
  const months = [];
  for (let d = new Date(parseDate(days[0].date)); d <= parseDate(days.at(-1).date); d.setMonth(d.getMonth() + 1, 1)) months.push(new Date(d.getFullYear(), d.getMonth(), 1, 12));
  const every = Math.ceil(months.length / Math.max(2, Math.floor(pw / 70)));
  months.forEach((m, i) => {
    if (i % every) return;
    const x = l + ((m.getTime() - t0) / Math.max(1, t1 - t0)) * pw;
    if (x < l) return;
    const lab = m.getMonth() === 0 || i === 0 ? m.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : m.toLocaleDateString("en-US", { month: "short" });
    html += `<line x1="${x}" x2="${x}" y1="${t}" y2="${t + ph}" stroke="var(--line)" stroke-dasharray="2 4"/><text x="${x + 3}" y="${h - 8}">${lab}</text>`;
  });
  for (const d of days) {
    const v = d.clean / 1000;
    html += `<circle cx="${X(d.date).toFixed(1)}" cy="${Y(clamp(v, lo, hi)).toFixed(1)}" r="2.2" style="fill:${heat(tenseOf(v))}"/>`;
  }
  // 30-day rolling average
  let path = "";
  days.forEach((d, i) => {
    const win = days.slice(Math.max(0, i - 29), i + 1);
    const v = win.reduce((s, x) => s + x.clean, 0) / win.length / 1000;
    path += `${i ? "L" : "M"}${X(d.date).toFixed(1)},${Y(v).toFixed(1)}`;
  });
  html += `<path d="${path}" fill="none" stroke="var(--ink)" stroke-width="2"/>`;
  svg.innerHTML = html;
}

// ---------- routing ----------
function route() {
  const h = decodeURIComponent(location.hash.slice(1)) || "today";
  const go = h === "today" ? showToday()
    : h === "trends" ? showTrends()
    : h === "month" ? showMonth()
    : h === "all" ? showAll()
    : h.startsWith("year") ? showYear(h.split("-")[1])
    : /^day-\d{4}-\d{2}-\d{2}$/.test(h) ? showDay(h.slice(4))
    : showToday();
  Promise.resolve(go).catch((e) => console.error(e));
  window.scrollTo({ top: 0 });
}

// ---------- wiring ----------
$("play").addEventListener("click", () => (player.playing ? pause() : play()));
$("chart").addEventListener("click", (e) => {
  if (!series) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (chart.w / rect.width);
  const m = ((x - chart.pad.l) / (chart.w - chart.pad.l - chart.pad.r)) * series.dayMinutes;
  let i = 0; while (i + 1 < series.n && series.t[i + 1] <= m) i++;
  seek(i / (series.n - 1));
});
$("chart").addEventListener("keydown", (e) => {
  const d = e.key === "ArrowRight" ? 0.02 : e.key === "ArrowLeft" ? -0.02 : 0;
  if (d && series) { e.preventDefault(); seek(clamp(posNow()) + d); }
});
// Tiles and "Play the month" start playing on arrival
document.addEventListener("click", (e) => {
  const a = e.target.closest("a.tile, #play-month");
  if (a) pendingAutoplay = true;
});
$("t-bars").addEventListener("click", (e) => {
  const r = e.target.closest("rect.day");
  if (r) { pendingAutoplay = true; location.hash = `day-${r.dataset.date}`; }
});
$("heat").addEventListener("mousemove", (e) => {
  const hit = heatHit(e), tip = $("tip");
  if (!hit || !hit.saved) { tip.hidden = true; return; }
  tip.hidden = false;
  tip.textContent = `${fmtDate(hit.iso, { weekday: "short", month: "short", day: "numeric" })} · ${hourLabel(hit.h)} · ${hit.clean == null ? "no data" : pct(hit.clean) + " clean"} · ${hit.demand ? fmtMW(hit.demand) + " MW" : ""}`;
  const wrap = $("heat-wrap");
  const x = Math.min(hit.x + 12 - wrap.scrollLeft, wrap.clientWidth - tip.offsetWidth - 4);
  tip.style.left = `${Math.max(4, x) + wrap.scrollLeft}px`;
  tip.style.top = `${hit.y + 14}px`;
});
$("heat").addEventListener("mouseleave", () => ($("tip").hidden = true));
$("heat").addEventListener("click", (e) => {
  const hit = heatHit(e);
  if (hit?.saved) { pendingAutoplay = true; location.hash = `day-${hit.iso}`; }
});
$("a-chart").addEventListener("click", (e) => {
  const { days, l, pw, t0, t1 } = allState;
  if (!days) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const x = (e.clientX - rect.left) * ((e.currentTarget.viewBox.baseVal.width || rect.width) / rect.width);
  const target = t0 + ((x - l) / pw) * (t1 - t0);
  const best = days.reduce((a, b) => (Math.abs(parseDate(b.date) - target) < Math.abs(parseDate(a.date) - target) ? b : a));
  pendingAutoplay = true;
  location.hash = `day-${best.date}`;
});

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!$("view-player").hidden && series) { buildChart(); renderPlayhead(stateAt(clamp(posNow()))); }
    if (!$("view-trends").hidden) showTrends();
    if (!$("view-year").hidden) drawHeat();
    if (!$("view-all").hidden && allState.days) drawAll(allState.days);
  }, 150);
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawHeat);

buildMap(); buildMix();
window.addEventListener("hashchange", route);
route();
requestAnimationFrame(frame);
