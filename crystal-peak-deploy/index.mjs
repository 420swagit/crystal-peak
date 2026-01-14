import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const app = express();
app.use(cors());

// ---------------- CONFIG ----------------
const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = 60 * 1000;

const NWS_USER_AGENT =
  process.env.NWS_USER_AGENT || 'CrystalPeak/1.0 (contact@example.com)';

// Pass report source (HTML page)
const CRYSTAL_TO_GREENWATER_URL =
  'https://wsdot.com/travel/real-time/mountainpasses/Crystal-to-Greenwater';

// ---------------- CACHE ----------------
let cachedState = null;
let cachedAt = 0;

// Separate cache for pass report scrape (avoid hammering WSDOT)
let cachedPassReport = null;
let cachedPassAt = 0;
const PASS_TTL_MS = 5 * 60 * 1000;

// ---------------- UTILS ----------------
async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pull value that appears after a label like "Temperature"
function extractAfterLabel(text, label) {
  const re = new RegExp(`${label}\\s+([^]+?)\\s+(?=Temperature|Elevation|Travel eastbound|Travel westbound|Conditions|Weather|Last updated|Disclaimer|Real-time traffic alerts|$)`, 'i');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

// ---------------- FORECAST (NWS) ----------------
async function fetchNOAAForecast() {
  try {
    const lat = 46.932517;
    const lon = -121.48067;

    const pointRes = await fetchWithTimeout(
      `https://api.weather.gov/points/${lat},${lon}`,
      {
        headers: {
          'User-Agent': NWS_USER_AGENT,
          Accept: 'application/geo+json',
        },
      }
    );

    if (!pointRes.ok) throw new Error('NWS point failed');
    const point = await pointRes.json();

    const [dailyRes, hourlyRes] = await Promise.all([
      fetchWithTimeout(point.properties.forecast, {
        headers: { 'User-Agent': NWS_USER_AGENT },
      }),
      fetchWithTimeout(point.properties.forecastHourly, {
        headers: { 'User-Agent': NWS_USER_AGENT },
      }),
    ]);

    const daily = await dailyRes.json();
    const hourly = await hourlyRes.json();

    const dailyOut = (daily.properties.periods || [])
      .slice(0, 14)
      .reduce((acc, p, i, arr) => {
        if (i % 2 === 0) {
          const night = arr[i + 1];
          acc.push({
            day: p.name?.slice(0, 3) || 'Day',
            hi: p.temperature ?? null,
            lo: night?.temperature ?? null,
            snow: /snow|flurr/i.test(p.shortForecast) ? 1 : 0,
            text: p.shortForecast || '',
          });
        }
        return acc;
      }, []);

    const hourlyOut = (hourly.properties.periods || [])
      .slice(0, 48)
      .map((p) => ({
        time: new Date(p.startTime).getHours(),
        temp: p.temperature ?? null,
        snow: /snow|flurr/i.test(p.shortForecast) ? 0.2 : 0,
        wind: p.windSpeed || null,
      }));

    return { daily: dailyOut, hourly: hourlyOut };
  } catch (err) {
    console.error('[forecast]', err);
    return { daily: [], hourly: [] };
  }
}

// ---------------- PASS REPORT SCRAPE ----------------
async function fetchCrystalToGreenwaterPassReport() {
  const now = Date.now();
  if (cachedPassReport && now - cachedPassAt < PASS_TTL_MS) return cachedPassReport;

  try {
    const res = await fetchWithTimeout(CRYSTAL_TO_GREENWATER_URL, {
      headers: { 'User-Agent': NWS_USER_AGENT },
    });
    if (!res.ok) throw new Error(`pass report fetch failed: ${res.status}`);

    const html = await res.text();
    const text = stripTags(html);

    // Extract core fields
    const temperature = extractAfterLabel(text, 'Temperature');
    const elevation = extractAfterLabel(text, 'Elevation');
    const travelEastbound = extractAfterLabel(text, 'Travel eastbound');
    const travelWestbound = extractAfterLabel(text, 'Travel westbound');
    const conditions = extractAfterLabel(text, 'Conditions');
    const weather = extractAfterLabel(text, 'Weather');
    const lastUpdated = extractAfterLabel(text, 'Last updated');

    const out = {
      id: 'crystal-to-greenwater',
      title: 'Crystal → Greenwater Pass Report',
      temperature: temperature || null,
      elevation: elevation || null,
      travelEastbound: travelEastbound || null,
      travelWestbound: travelWestbound || null,
      conditions: conditions || null,
      weather: weather || null,
      lastUpdated: lastUpdated || null,
      source: CRYSTAL_TO_GREENWATER_URL,
      fetchedAt: new Date().toISOString(),
    };

    cachedPassReport = out;
    cachedPassAt = now;
    return out;
  } catch (err) {
    console.error('[pass-report]', err);
    return {
      id: 'crystal-to-greenwater',
      title: 'Crystal → Greenwater Pass Report',
      error: 'Unable to load pass report right now.',
      source: CRYSTAL_TO_GREENWATER_URL,
      fetchedAt: new Date().toISOString(),
    };
  }
}

// ---------------- CAMS (HARD-CODED, REAL) ----------------
function getCams() {
  return [
    // ===== Crystal Mountain (official) =====
    {
      id: 'crystal-summit-360',
      name: 'Crystal Summit 360°',
      category: 'mountain',
      type: 'external',
      image: 'https://crystalmountainresort.roundshot.com/summit/thumb.jpg',
      link: 'https://crystalmountainresort.roundshot.com/summit/',
      desc: 'Official Crystal Mountain summit panorama (Roundshot)',
    },
    {
      id: 'crystal-webcams',
      name: 'Crystal Mountain Webcams',
      category: 'mountain',
      type: 'external',
      image:
        'https://www.crystalmountainresort.com/-/media/crystal/images/mountain-report/webcams/webcam-hero.jpg',
      link:
        'https://www.crystalmountainresort.com/the-mountain/mountain-report-and-webcams/webcams',
      desc: 'Official Crystal Mountain webcam page',
    },

    // ===== Road access (SR-410) =====
    {
      id: 'sr410-route',
      name: 'SR-410 Road Conditions',
      category: 'road',
      type: 'external',
      image: 'https://wsdot.com/Travel/Real-time/images/rtmap-preview.jpg',
      link: 'https://wsdot.com/travel/real-time/?route=410',
      desc: 'WSDOT SR-410 cameras, alerts, and conditions',
    },
    {
      id: 'sr410-crystal-greenwater',
      name: 'Crystal → Greenwater Pass Report',
      category: 'road',
      type: 'pass_report',
      // This makes the card not empty:
      image: 'https://wsdot.com/Travel/Real-time/images/mountainpasses-preview.jpg',
      // This tells the frontend which report to open:
      passReportId: 'crystal-to-greenwater',
      link: CRYSTAL_TO_GREENWATER_URL,
      desc: 'Shows restrictions + conditions + weather (pulled into this site)',
    },
  ];
}

// ---------------- STATE ----------------
async function buildState() {
  const [forecast, passReport] = await Promise.all([
    fetchNOAAForecast(),
    fetchCrystalToGreenwaterPassReport(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    FORECAST: forecast,
    CAMS: getCams(),
    // Put the report under ROADS so it’s available to the UI:
    ROADS: {
      passes: [],
      passReports: {
        'crystal-to-greenwater': passReport,
      },
    },
    WEATHER: [],
    AVAL: null,
    SNOW: null,
    LIFTS: [],
    RUNS: [],
  };
}

// ---------------- API ----------------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/state', async (_req, res) => {
  const now = Date.now();
  if (cachedState && now - cachedAt < CACHE_TTL_MS) {
    return res.json(cachedState);
  }

  const state = await buildState();
  cachedState = state;
  cachedAt = now;
  res.json(state);
});

// Optional: direct endpoint for the pass report (handy for debugging)
app.get('/api/pass-report/crystal-to-greenwater', async (_req, res) => {
  const report = await fetchCrystalToGreenwaterPassReport();
  res.json(report);
});

// ---------------- FRONTEND ----------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return;
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Crystal Peak server listening on port ${PORT}`);
});
