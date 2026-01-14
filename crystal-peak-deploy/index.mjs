import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const app = express();
app.use(cors());

// --- Config ---
const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = 60 * 1000;

const NWS_USER_AGENT =
  process.env.NWS_USER_AGENT || 'CrystalPeak/1.0 (contact@example.com)';

// --- Simple in-memory cache ---
let cachedState = null;
let cachedAt = 0;

// --- Utils ---
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// --- Forecast (NWS) ---
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

    if (!pointRes.ok) throw new Error('NWS points failed');
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
  } catch {
    return { daily: [], hourly: [] };
  }
}

// --- HARD-CODED CAMS (clean + relevant) ---
function getCams() {
  return [
    // ===== Mountain =====
    {
      id: 'crystal-summit-360',
      name: 'Crystal Summit 360°',
      type: 'external',
      category: 'mountain',
      link: 'https://crystalmountainresort.roundshot.com/',
      desc: 'Official Crystal Mountain summit panorama',
    },

    // ===== Road access (SR-410 ONLY) =====
    {
      id: 'sr410-enumclaw',
      name: 'SR-410 – Enumclaw',
      type: 'external',
      category: 'road',
      link: 'https://wsdot.com/Travel/Real-time/Map/',
      desc: 'Lower access route toward Crystal',
    },
    {
      id: 'sr410-greenwater',
      name: 'SR-410 – Greenwater',
      type: 'external',
      category: 'road',
      link: 'https://wsdot.com/Travel/Real-time/Map/',
      desc: 'Mid-route conditions near Greenwater',
    },
    {
      id: 'sr410-crystal-blvd',
      name: 'SR-410 – Crystal Mountain Blvd',
      type: 'external',
      category: 'road',
      link: 'https://wsdot.com/Travel/Real-time/Map/',
      desc: 'Junction leading directly to Crystal',
    },
    {
      id: 'sr410-chinook-pass',
      name: 'SR-410 – Chinook Pass',
      type: 'external',
      category: 'road',
      link: 'https://wsdot.com/Travel/Real-time/Map/',
      desc: 'Seasonal pass status (often closed in winter)',
    },
  ];
}

// --- State builder ---
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

// --- API routes ---
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

// --- Static frontend ---
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
  console.log(`Crystal Peak server listening on ${PORT}`);
});
