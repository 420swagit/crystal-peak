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

// ---------------- CACHE ----------------
let cachedState = null;
let cachedAt = 0;

// ---------------- UTILS ----------------
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------- FORECAST ----------------
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
      type: 'external',
      image:
        'https://wsdot.com/Travel/Real-time/images/mountainpasses-preview.jpg',
      link:
        'https://wsdot.com/travel/real-time/mountainpasses/Crystal-to-Greenwater',
      desc: 'SR-410 winter pass status and restrictions',
    },
  ];
}

// ---------------- STATE ----------------
async function buildState() {
  const forecast = await fetchNOAAForecast();

  return {
    generatedAt: new Date().toISOString(),
    FORECAST: forecast,
    CAMS: getCams(),
    WEATHER: [],
    ROADS: { passes: [] },
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
