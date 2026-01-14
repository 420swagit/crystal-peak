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

// Crystal Mountain approx base coordinates
const CRYSTAL_LAT = Number(process.env.CRYSTAL_LAT || 46.932517);
const CRYSTAL_LON = Number(process.env.CRYSTAL_LON || -121.48067);

const WSDOT_ACCESS_CODE = process.env.WSDOT_ACCESS_CODE || '';
const NWS_USER_AGENT = process.env.NWS_USER_AGENT || 'CrystalPeak/1.0 (contact@example.com)';

// Optional (only if you have legitimate access)
const OTS_API_KEY = process.env.ONTHESNOW_API_KEY || '';
const OTS_RESORT_ID = process.env.ONTHESNOW_RESORT_ID || '';

// --- Simple in-memory cache for aggregated state ---
let cachedState = null;
let cachedAt = 0;

// --- Utilities ---
function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function safeJsonParseDate(dateStr) {
  // WSDOT often returns dates like "\/Date(928174800000-0700)\/"
  if (typeof dateStr !== 'string') return null;
  const m = dateStr.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
  if (!m) return null;
  const ms = Number(m[1]);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function dowShortFromISODate(isoDate) {
  try {
    const d = new Date(`${isoDate}T12:00:00Z`);
    return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  } catch {
    return '';
  }
}

function domFromISODate(isoDate) {
  try {
    const d = new Date(`${isoDate}T12:00:00Z`);
    return d.getUTCDate();
  } catch {
    return null;
  }
}

// --- Data sources ---
async function fetchFreezingLevelDaily() {
  // Open-Meteo freezing level: hourly freezing_level_height (meters)
  // Pull past 31 days + next 16 days, then aggregate daily max.
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${encodeURIComponent(CRYSTAL_LAT)}` +
      `&longitude=${encodeURIComponent(CRYSTAL_LON)}` +
      `&hourly=freezing_level_height` +
      `&past_days=31` +
      `&forecast_days=16` +
      `&timezone=UTC`;

    const res = await fetchWithTimeout(url, {}, 9000);
    if (!res.ok) throw new Error(`Open-Meteo freezing failed: ${res.status}`);
    const data = await res.json();

    const times = data?.hourly?.time;
    const vals = data?.hourly?.freezing_level_height;
    if (!Array.isArray(times) || !Array.isArray(vals) || times.length !== vals.length) {
      return { daily: [] };
    }

    // Group hourly into daily max/min keyed by YYYY-MM-DD
    const byDay = new Map();
    for (let i = 0; i < times.length; i++) {
      const t = times[i]; // "2026-01-14T03:00"
      const v = vals[i];
      if (typeof t !== 'string') continue;
      const day = t.slice(0, 10);
      const num = Number(v);
      if (!Number.isFinite(num)) continue;

      const cur = byDay.get(day) || { max_m: -Infinity, min_m: Infinity };
      cur.max_m = Math.max(cur.max_m, num);
      cur.min_m = Math.min(cur.min_m, num);
      byDay.set(day, cur);
    }

    const daily = Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, mm]) => ({
        date, // YYYY-MM-DD
        day: dowShortFromISODate(date), // "Wed"
        dom: domFromISODate(date), // 14
        max_m: Number.isFinite(mm.max_m) ? Math.round(mm.max_m) : null,
        min_m: Number.isFinite(mm.min_m) ? Math.round(mm.min_m) : null,
      }))
      .filter((d) => d.max_m != null);

    return { daily };
  } catch (err) {
    console.error('[freezing] error', err);
    return { daily: [] };
  }
}

async function fetchNOAAForecast() {
  // Uses NWS API: https://api.weather.gov
  // 1) resolve point -> grid
  // 2) fetch forecast + hourly forecast
  try {
    const pointUrl = `https://api.weather.gov/points/${CRYSTAL_LAT},${CRYSTAL_LON}`;
    const pointRes = await fetchWithTimeout(pointUrl, {
      headers: {
        'User-Agent': NWS_USER_AGENT,
        Accept: 'application/geo+json',
      },
    });
    if (!pointRes.ok) throw new Error(`NWS points failed: ${pointRes.status}`);
    const point = await pointRes.json();
    const forecastUrl = point?.properties?.forecast;
    const hourlyUrl = point?.properties?.forecastHourly;
    if (!forecastUrl || !hourlyUrl) throw new Error('NWS point missing forecast urls');

    const [dailyRes, hourlyRes, freezing] = await Promise.all([
      fetchWithTimeout(forecastUrl, { headers: { 'User-Agent': NWS_USER_AGENT, Accept: 'application/geo+json' } }),
      fetchWithTimeout(hourlyUrl, { headers: { 'User-Agent': NWS_USER_AGENT, Accept: 'application/geo+json' } }),
      fetchFreezingLevelDaily(),
    ]);

    if (!dailyRes.ok) throw new Error(`NWS daily failed: ${dailyRes.status}`);
    if (!hourlyRes.ok) throw new Error(`NWS hourly failed: ${hourlyRes.status}`);

    const daily = await dailyRes.json();
    const hourly = await hourlyRes.json();

    // Transform daily periods into compact UI format
    const dailyPeriods = Array.isArray(daily?.properties?.periods) ? daily.properties.periods : [];
    const dailyOut = dailyPeriods.slice(0, 14).map((p) => {
      const dayLabel = (p?.name || '').slice(0, 3);
      const isNight = !!p?.isNighttime;
      const temp = typeof p?.temperature === 'number' ? p.temperature : null;
      const text = String(p?.shortForecast || '');
      const snowIn = /snow|flurr/i.test(text) ? 1 : 0; // very rough
      return {
        day: dayLabel || (isNight ? 'Ngt' : 'Day'),
        icon: null,
        hi: isNight ? null : temp,
        lo: isNight ? temp : null,
        text,
        snow: snowIn,
        wind: p?.windSpeed || null,
        detailed: p?.detailedForecast || null,
      };
    });

    // Hourly simplified
    const hourlyPeriods = Array.isArray(hourly?.properties?.periods) ? hourly.properties.periods : [];
    const hourlyOut = hourlyPeriods.slice(0, 48).map((p) => {
      const dt = p?.startTime ? new Date(p.startTime) : null;
      const hour = dt ? dt.getHours() : null;
      const label = hour == null ? '' : `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'p' : 'a'}`;
      const text = String(p?.shortForecast || '');
      const snowIn = /snow|flurr/i.test(text) ? 0.2 : 0;
      return {
        time: label,
        temp: typeof p?.temperature === 'number' ? p.temperature : null,
        precip: null,
        snow: snowIn,
        wind: p?.windSpeed || null,
      };
    });

    const groupedDaily = [];
    for (let i = 0; i < dailyOut.length; i += 2) {
      const day = dailyOut[i];
      const night = dailyOut[i + 1];
      groupedDaily.push({
        day: day.day || 'Day',
        icon: null,
        hi: day.hi ?? null,
        lo: night?.lo ?? null,
        snow: (day.snow || 0) + (night?.snow || 0),
        text: day.text || '',
      });
    }

    return { hourly: hourlyOut, daily: groupedDaily, freezing };
  } catch (err) {
    console.error('[forecast] error', err);
    return { hourly: [], daily: [], freezing: { daily: [] } };
  }
}

async function fetchWSDOTCameras() {
  if (!WSDOT_ACCESS_CODE) return [];
  try {
    const url = `https://wsdot.wa.gov/Traffic/api/HighwayCameras/HighwayCamerasREST.svc/GetCamerasAsJson?AccessCode=${encodeURIComponent(
      WSDOT_ACCESS_CODE
    )}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`WSDOT cameras failed: ${res.status}`);
    const data = await res.json();

    // Filter cameras within ~40 miles of Crystal
    const nearby = Array.isArray(data)
      ? data
          .filter((c) => {
            const lat = c?.CameraLocation?.Latitude;
            const lon = c?.CameraLocation?.Longitude;
            if (typeof lat !== 'number' || typeof lon !== 'number') return false;
            return haversineMiles(CRYSTAL_LAT, CRYSTAL_LON, lat, lon) <= 40;
          })
          .slice(0, 16)
      : [];

    return nearby
      .map((c) => ({
        id: c.CameraID,
        title: c.Title,
        location: c?.CameraLocation?.Description || c?.CameraLocation?.RoadName,
        image: c.ImageURL,
        updated: null,
      }))
      .filter((c) => !!c.image);
  } catch (err) {
    console.error('[cams] error', err);
    return [];
  }
}

async function fetchWSDOTWeatherStations() {
  if (!WSDOT_ACCESS_CODE) return [];
  try {
    // 1) Station list (lat/lon + StationCode)
    const stationsUrl = `https://wsdot.wa.gov/Traffic/api/WeatherStations/WeatherStationsREST.svc/GetCurrentStationsAsJson?AccessCode=${encodeURIComponent(
      WSDOT_ACCESS_CODE
    )}`;
    const stationsRes = await fetchWithTimeout(stationsUrl);
    if (!stationsRes.ok) throw new Error(`WSDOT stations failed: ${stationsRes.status}`);
    const stations = await stationsRes.json();

    const nearbyStations = Array.isArray(stations)
      ? stations
          .filter((s) => {
            const lat = s?.Latitude;
            const lon = s?.Longitude;
            if (typeof lat !== 'number' || typeof lon !== 'number') return false;
            return haversineMiles(CRYSTAL_LAT, CRYSTAL_LON, lat, lon) <= 50;
          })
          .slice(0, 6)
      : [];

    if (nearbyStations.length === 0) return [];

    // 2) Current weather for all stations (includes wind, temp, etc)
    const wxUrl = `https://wsdot.wa.gov/Traffic/api/WeatherInformation/WeatherInformationREST.svc/GetCurrentWeatherInformationAsJson?AccessCode=${encodeURIComponent(
      WSDOT_ACCESS_CODE
    )}`;
    const wxRes = await fetchWithTimeout(wxUrl);
    if (!wxRes.ok) throw new Error(`WSDOT weather failed: ${wxRes.status}`);
    const wx = await wxRes.json();
    const byId = new Map(Array.isArray(wx) ? wx.map((w) => [w.StationID, w]) : []);

    return nearbyStations
      .map((s) => {
        const r = byId.get(s.StationCode) || null;
        return {
          id: `wsdot-${s.StationCode}`,
          name: s.StationName || r?.StationName || 'Weather Station',
          elev: null,
          temp: r?.TemperatureInFahrenheit != null ? Math.round(Number(r.TemperatureInFahrenheit)) : null,
          humidity: r?.RelativeHumidity != null ? Math.round(Number(r.RelativeHumidity)) : null,
          wind: r?.WindSpeedInMPH != null ? Math.round(Number(r.WindSpeedInMPH)) : null,
          gust: r?.WindGustSpeedInMPH != null ? Math.round(Number(r.WindGustSpeedInMPH)) : null,
          dir: r?.WindDirectionCardinal || null,
          updated: safeJsonParseDate(r?.ReadingTime) || null,
        };
      })
      .filter((w) => w.temp != null || w.wind != null);
  } catch (err) {
    console.error('[weather] error', err);
    return [];
  }
}

async function fetchPassConditions() {
  if (!WSDOT_ACCESS_CODE) return { passes: [] };
  try {
    const url = `https://wsdot.wa.gov/Traffic/api/MountainPassConditions/MountainPassConditionsREST.svc/GetMountainPassConditionsAsJson?AccessCode=${encodeURIComponent(
      WSDOT_ACCESS_CODE
    )}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`WSDOT passes failed: ${res.status}`);
    const data = await res.json();

    const nearby = Array.isArray(data)
      ? data
          .filter((p) => {
            const lat = p?.Latitude;
            const lon = p?.Longitude;
            if (typeof lat !== 'number' || typeof lon !== 'number') return false;
            return haversineMiles(CRYSTAL_LAT, CRYSTAL_LON, lat, lon) <= 80;
          })
          .slice(0, 10)
      : [];

    return {
      passes: nearby.map((p) => ({
        id: p.MountainPassId,
        name: p.MountainPassName,
        status: p.TravelAdvisoryActive ? 'advisory' : (p.RoadCondition || 'unknown'),
        restriction: p.RestrictionOne?.RestrictionText || p.RestrictionTwo?.RestrictionText || null,
        temp: p.TemperatureInFahrenheit ?? null,
        weather: p.WeatherCondition ?? null,
        updated: safeJsonParseDate(p.DateUpdated) || null,
        // Extra fields (if present in API; harmless if null)
        elevationFt: p.ElevationInFeet ?? null,
        travelEastbound: p.TravelEastbound ?? null,
        travelWestbound: p.TravelWestbound ?? null,
        conditions: p.RoadCondition ?? null,
        link: p?.MountainPassConditionUrl ?? null,
      })),
    };
  } catch (err) {
    console.error('[roads] error', err);
    return { passes: [] };
  }
}

async function fetchAvalancheData() {
  try {
    const url = 'https://api.avalanche.org/v2/public/product?type=forecast&center_id=NWAC&zone_id=1';
    const res = await fetchWithTimeout(url, {}, 9000);
    if (!res.ok) throw new Error(`avalanche.org failed: ${res.status}`);
    const data = await res.json();

    const today = Array.isArray(data) ? data[0] : data;

    const danger = today?.danger || today?.danger_rating || null;
    const level = today?.danger_level || today?.overall_danger || null;

    const problems = Array.isArray(today?.avalanche_problems)
      ? today.avalanche_problems.map((p) => p?.name).filter(Boolean)
      : [];

    return {
      level: typeof level === 'number' ? level : null,
      danger: typeof danger === 'string' ? danger : null,
      problems,
      summary: today?.bottom_line || today?.summary || null,
      link: today?.url || 'https://nwac.us',
    };
  } catch (err) {
    console.error('[avalanche] error', err);
    return null;
  }
}

async function fetchLiftStatus() {
  if (!OTS_API_KEY || !OTS_RESORT_ID) return [];
  try {
    const url = `https://api.onthesnow.com/api/v1/resort/${encodeURIComponent(OTS_RESORT_ID)}/lifts`;
    const res = await fetchWithTimeout(url, {
      headers: {
        Authorization: `Bearer ${OTS_API_KEY}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) throw new Error(`OnTheSnow lifts failed: ${res.status}`);
    const data = await res.json();

    const lifts = Array.isArray(data?.lifts) ? data.lifts : Array.isArray(data) ? data : [];
    return lifts.map((l, idx) => ({
      id: l?.id ?? idx,
      name: l?.name ?? 'Lift',
      status: String(l?.status || 'unknown').toLowerCase(),
      updated: l?.updated_at ?? null,
    }));
  } catch (err) {
    console.error('[lifts] error', err);
    return [];
  }
}

async function fetchRunStatus() {
  if (!OTS_API_KEY || !OTS_RESORT_ID) return [];
  try {
    const url = `https://api.onthesnow.com/api/v1/resort/${encodeURIComponent(OTS_RESORT_ID)}/trails`;
    const res = await fetchWithTimeout(url, {
      headers: {
        Authorization: `Bearer ${OTS_API_KEY}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) throw new Error(`OnTheSnow trails failed: ${res.status}`);
    const data = await res.json();

    const runs = Array.isArray(data?.trails) ? data.trails : Array.isArray(data) ? data : [];
    return runs.map((r, idx) => ({
      id: r?.id ?? idx,
      name: r?.name ?? 'Run',
      difficulty: (r?.difficulty || '').toLowerCase(),
      status: String(r?.status || 'unknown').toLowerCase(),
      groomed: !!r?.groomed,
    }));
  } catch (err) {
    console.error('[runs] error', err);
    return [];
  }
}

function calcSnowFromForecast(forecast) {
  if (!forecast || !Array.isArray(forecast.daily)) return null;

  const next2Days = forecast.daily.slice(0, 2);
  const new48h = next2Days.reduce((sum, d) => sum + (Number(d.snow) || 0), 0);
  const new24h = Number(next2Days[0]?.snow) || 0;

  if (new24h <= 0 && new48h <= 0) return null;

  return {
    new24h: new24h,
    new48h: new48h,
    base: null,
    season: null,
    report: 'Estimated from NWS forecast wording (not an official snow report).',
    updated: new Date().toISOString(),
  };
}

async function buildState() {
  const [forecast, cams, weather, roads, aval, lifts, runs] = await Promise.all([
    fetchNOAAForecast(),
    fetchWSDOTCameras(),
    fetchWSDOTWeatherStations(),
    fetchPassConditions(),
    fetchAvalancheData(),
    fetchLiftStatus(),
    fetchRunStatus(),
  ]);

  const snow = calcSnowFromForecast(forecast);

  // Keep your existing cams behavior (frontend already handles image/link)
  const staticCams = [
    {
      id: "crystal-summit-360",
      name: "Crystal Summit 360°",
      type: "external",
      category: "mountain",
      link: "https://crystalmountainresort.roundshot.com/",
      desc: "Crystal Mountain summit panorama (official)"
    },
    {
      id: "crystal-webcams",
      name: "Crystal Webcams",
      type: "external",
      category: "mountain",
      link: "https://www.crystalmountainresort.com/the-mountain/webcams",
      desc: "Official Crystal Mountain webcam page"
    }
  ];

  const allCams = [...staticCams, ...(Array.isArray(cams) ? cams : [])];

  const state = {
    generatedAt: new Date().toISOString(),
    FORECAST: forecast,
    CAMS: allCams,
    WEATHER: weather,
    ROADS: roads,
    AVAL: aval,
    SNOW: snow,
    LIFTS: lifts,
    RUNS: runs,
  };

  return state;
}

// --- API routes ---
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/state', async (req, res) => {
  try {
    const now = Date.now();
    if (cachedState && now - cachedAt < CACHE_TTL_MS) {
      return res.json(cachedState);
    }

    const state = await buildState();
    cachedState = state;
    cachedAt = now;
    return res.json(state);
  } catch (err) {
    console.error('[state] error', err);
    return res.status(500).json({ error: 'Failed to build state' });
  }
});

// --- Static frontend (served after `npm run build`) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));

  // SPA fallback
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Crystal Peak server listening on port ${PORT}`);
});
