import React, { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import {
  Camera,
  Thermometer,
  Wind,
  CloudSnow,
  Mountain,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Star,
  AlertTriangle,
  MapPin,
  Info,
  Menu,
  X,
  ExternalLink,
  TrendingUp,
  Activity,
  Snowflake,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  XCircle,
  MinusCircle,
  Coffee,
  Heart,
  Loader,
  WifiOff,
} from 'lucide-react';

const AppContext = createContext();
const useApp = () => useContext(AppContext);
const defaultSettings = { units: 'imperial', favorites: [] };
const API_BASE = '/api';

// --- small date helpers ---
const toISODate = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const dayLabel = (isoDate) => {
  const d = new Date(`${isoDate}T00:00:00`);
  const wd = d.toLocaleDateString(undefined, { weekday: 'short' });
  const dom = d.getDate();
  return `${wd} ${dom}`;
};

const fmt = {
  temp: (t, u) => (t == null ? '—' : u === 'metric' ? `${Math.round(((t - 32) * 5) / 9)}°C` : `${t}°F`),
  elev: (e, u) => (e == null ? '—' : u === 'metric' ? `${Math.round(e * 0.3048)}m` : `${e.toLocaleString()}'`),
  snow: (i, u) => (i == null ? '—' : u === 'metric' ? `${Math.round(i * 2.54)}cm` : `${i}"`),
  wind: (m, u) => (m == null ? '—' : u === 'metric' ? `${Math.round(m * 1.609)} km/h` : `${m} mph`),
  height: (meters, u) =>
    meters == null
      ? '—'
      : u === 'metric'
      ? `${Math.round(meters).toLocaleString()} m`
      : `${Math.round(meters * 3.28084).toLocaleString()} ft`,
};

const statusColor = (s) =>
  ({ open: 'text-emerald-400', hold: 'text-amber-400', closed: 'text-rose-400', partial: 'text-amber-400' }[s] ||
  'text-slate-400');
const statusBg = (s) =>
  ({
    open: 'bg-emerald-500/20 border-emerald-500/30',
    hold: 'bg-amber-500/20 border-amber-500/30',
    closed: 'bg-rose-500/20 border-rose-500/30',
    partial: 'bg-amber-500/20 border-amber-500/30',
  }[s] || 'bg-slate-500/20 border-slate-500/30');
const diffColor = (d) =>
  ({ green: 'bg-emerald-500', blue: 'bg-sky-500', black: 'bg-slate-900', 'double-black': 'bg-slate-900' }[d] ||
  'bg-slate-500');
const diffIcon = (d) => ({ green: '●', blue: '■', black: '◆', 'double-black': '◆◆' }[d] || '○');

const Badge = ({ status, lg }) => (
  <span
    className={`inline-flex items-center gap-1 ${
      lg ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs'
    } font-semibold uppercase tracking-wide rounded-full border ${statusBg(status)}`}
  >
    {status === 'open' && <CheckCircle className="w-3 h-3 text-emerald-400" />}
    {(status === 'hold' || status === 'partial') && <MinusCircle className="w-3 h-3 text-amber-400" />}
    {status === 'closed' && <XCircle className="w-3 h-3 text-rose-400" />}
    <span className={statusColor(status)}>{status}</span>
  </span>
);

const Card = ({ children, className = '', onClick }) => (
  <div
    onClick={onClick}
    className={`bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden ${
      onClick ? 'cursor-pointer hover:bg-slate-800/70' : ''
    } ${className}`}
  >
    {children}
  </div>
);

const Stat = ({ icon: Icon, label, value, sub, onClick }) => (
  <Card onClick={onClick} className="p-4">
    <div className="p-2 bg-cyan-500/20 rounded-lg w-fit mb-3">
      <Icon className="w-5 h-5 text-cyan-400" />
    </div>
    <p className="text-2xl font-bold text-white">{value}</p>
    <p className="text-xs text-slate-400 mt-1">{label}</p>
    {sub && <p className="text-xs text-slate-500">{sub}</p>}
  </Card>
);

const NotAvailable = ({ message = 'Data not available' }) => (
  <Card className="p-8 text-center">
    <p className="text-slate-500">{message}</p>
  </Card>
);

const ErrorBanner = ({ message, onRetry }) => (
  <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-center justify-between">
    <div className="flex items-center gap-2">
      <WifiOff className="w-4 h-4 text-rose-400" />
      <span className="text-sm text-rose-400">{message}</span>
    </div>
    {onRetry && (
      <button onClick={onRetry} className="text-xs text-cyan-400">
        Retry
      </button>
    )}
  </div>
);

const Nav = ({ page, setPage, menu, setMenu }) => {
  const { settings, setSettings, data, dataLoading } = useApp();

  const hasCams = (data?.CAMS?.length ?? 0) > 0;
  const hasForecast = (data?.FORECAST?.daily?.length ?? 0) > 0;
  const hasTemps = (data?.WEATHER?.length ?? 0) > 0;
  const hasWind = hasTemps && data?.WEATHER?.some((w) => w.wind != null);
  const hasSnow = !!data?.SNOW;
  const hasLifts = (data?.LIFTS?.length ?? 0) > 0;
  const hasRuns = (data?.RUNS?.length ?? 0) > 0;
  const hasAval = !!data?.AVAL;
  const hasRoads = (data?.ROADS?.passes?.length ?? 0) > 0;

  const primary = [
    { id: 'home', label: 'Home', icon: Mountain },
    hasCams && { id: 'cams', label: 'Cams', icon: Camera },
    hasForecast && { id: 'forecast', label: 'Forecast', icon: CloudSnow },
    hasLifts && { id: 'lifts', label: 'Lifts', icon: Activity },
    hasRuns && { id: 'runs', label: 'Runs', icon: TrendingUp },
    hasSnow && { id: 'snow', label: 'Snow', icon: Snowflake },
  ].filter(Boolean);

  const secondary = [
    hasTemps && { id: 'temps', label: 'Temps', icon: Thermometer },
    hasWind && { id: 'wind', label: 'Wind', icon: Wind },
    hasRoads && { id: 'roads', label: 'Roads', icon: MapPin },
    hasAval && { id: 'backcountry', label: 'Backcountry', icon: Mountain },
    { id: 'info', label: 'Info', icon: Info },
  ].filter(Boolean);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-lg border-b border-slate-700/50">
        <div className="flex items-center justify-between px-4 h-14">
          <button onClick={() => setPage('home')} className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg flex items-center justify-center">
              <Mountain className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold">
              <span className="text-cyan-400">Crystal</span>
              <span className="text-white">Peak</span>
            </span>
          </button>

          <div className="flex items-center gap-2">
            {dataLoading && <Loader className="w-4 h-4 text-cyan-400 animate-spin" />}
            <button
              onClick={() => setSettings((s) => ({ ...s, units: s.units === 'imperial' ? 'metric' : 'imperial' }))}
              className="px-2 py-1 text-xs font-mono bg-slate-800 rounded border border-slate-700 text-slate-300"
            >
              {settings.units === 'imperial' ? '°F' : '°C'}
            </button>
            <button onClick={() => setMenu(!menu)} className="p-2 text-slate-300">
              {menu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        <nav className="flex overflow-x-auto border-t border-slate-800/50" style={{ scrollbarWidth: 'none' }}>
          {primary.map((n) => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium ${
                page === n.id ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400'
              }`}
            >
              <n.icon className="w-4 h-4" />
              {n.label}
            </button>
          ))}
        </nav>
      </header>

      {menu && (
        <div className="fixed inset-0 z-40 bg-slate-900 pt-28 overflow-y-auto">
          <div className="px-4 py-6 space-y-6">
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase mb-3">More</h3>
              <div className="grid grid-cols-2 gap-2">
                {secondary.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setPage(n.id);
                      setMenu(false);
                    }}
                    className="flex items-center gap-3 px-4 py-3 bg-slate-800/50 rounded-lg text-slate-300"
                  >
                    <n.icon className="w-5 h-5 text-cyan-400" />
                    <span>{n.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase mb-3">About</h3>
              <div className="space-y-2">
                {['About', 'Support', 'Privacy'].map((i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setPage(i.toLowerCase());
                      setMenu(false);
                    }}
                    className="w-full px-4 py-3 bg-slate-800/50 rounded-lg text-slate-300 text-left"
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const FreezingLevelCard = ({ units }) => {
  const LAT = 46.932517;
  const LON = -121.48067;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [daily, setDaily] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);

  const MAX_WEEKS_BACK = 4;

  const fetchFreezing = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const tz = encodeURIComponent('America/Los_Angeles');
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${LAT}&longitude=${LON}` +
        `&daily=freezing_level_height_max` +
        `&timezone=${tz}` +
        `&past_days=30` +
        `&forecast_days=7`;

      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Freezing API ${res.status}`);

      const j = await res.json();
      const times = j?.daily?.time || [];
      const vals = j?.daily?.freezing_level_height_max || [];

      const out = times.map((t, i) => ({
        date: t,
        meters: typeof vals[i] === 'number' ? vals[i] : null,
      }));

      setDaily(out);
    } catch (e) {
      setErr(e?.message || 'Failed to load freezing levels');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFreezing();
    const id = setInterval(fetchFreezing, 6 * 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchFreezing]);

  const weekData = useMemo(() => {
    const map = new Map(daily.map((d) => [d.date, d.meters]));
    const today = new Date();
    const points = [];

    for (let i = 0; i < 7; i++) {
      const date = toISODate(addDays(today, i - weekOffset * 7));
      points.push({
        date,
        label: dayLabel(date),
        meters: map.has(date) ? map.get(date) : null,
      });
    }

    return points;
  }, [daily, weekOffset]);

  const canGoForward = weekOffset > 0;
  const canGoBack = weekOffset < MAX_WEEKS_BACK;

  const yTickFormatter = (v) => {
    if (v == null) return '';
    return units === 'metric' ? `${Math.round(v)}m` : `${Math.round(v * 3.28084)}ft`;
  };

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-400 uppercase">Freezing Level (7-day)</h3>
          <Loader className="w-4 h-4 text-cyan-400 animate-spin" />
        </div>
        <p className="text-xs text-slate-500 mt-3">Loading freezing levels…</p>
      </Card>
    );
  }

  if (err) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-400 uppercase">Freezing Level (7-day)</h3>
          <button onClick={fetchFreezing} className="text-xs text-cyan-400">
            Retry
          </button>
        </div>
        <p className="text-sm text-rose-400 mt-3">{err}</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-400 uppercase">Freezing Level (7-day)</h3>
          <p className="text-xs text-slate-500 mt-1">
            {weekOffset === 0 ? 'Current week' : `${weekOffset} week${weekOffset === 1 ? '' : 's'} back`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canGoBack && (
            <button
              onClick={() => setWeekOffset((w) => Math.min(MAX_WEEKS_BACK, w + 1))}
              className="p-2 bg-slate-800/70 border border-slate-700 rounded-lg text-slate-200 hover:bg-slate-800"
              title="Previous week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          {canGoForward && (
            <button
              onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
              className="p-2 bg-slate-800/70 border border-slate-700 rounded-lg text-slate-200 hover:bg-slate-800"
              title="Next week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={weekData}>
            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={yTickFormatter}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
              labelStyle={{ color: '#cbd5e1' }}
              formatter={(val) => [fmt.height(val, units), 'Freezing level']}
            />
            <Line type="monotone" dataKey="meters" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 text-xs text-slate-500">Tip: Use the arrows to browse back up to ~1 month of weekly freezing levels.</div>
    </Card>
  );
};

const Home = ({ setPage }) => {
  const { settings, data } = useApp();

  const WEATHER = data?.WEATHER || [];
  const FORECAST = data?.FORECAST || { hourly: [], daily: [] };
  const SNOW = data?.SNOW;
  const LIFTS = data?.LIFTS || [];
  const RUNS = data?.RUNS || [];
  const AVAL = data?.AVAL;

  const openLifts = LIFTS.filter((l) => l.status === 'open').length;
  const groomedRuns = RUNS.filter((r) => r.groomed).length;

  const hasSnow = !!SNOW;
  const hasLifts = LIFTS.length > 0;
  const hasRuns = RUNS.length > 0;
  const hasTemps = WEATHER.length > 0;
  const hasForecast = FORECAST.daily.length > 0;
  const hasAval = AVAL?.level != null;

  if (!hasSnow && !hasLifts && !hasRuns && !hasTemps && !hasForecast && !hasAval) {
    return (
      <div className="space-y-6">
        <Card className="p-6 text-center">
          <Loader className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {hasSnow && (
          <Stat
            icon={Snowflake}
            label="New Snow (24h)"
            value={fmt.snow(SNOW.new24h, settings.units)}
            sub={`Base: ${fmt.snow(SNOW.base, settings.units)}`}
            onClick={() => setPage('snow')}
          />
        )}
        {hasLifts && <Stat icon={Activity} label="Lifts Open" value={`${openLifts}/${LIFTS.length}`} onClick={() => setPage('lifts')} />}
        {hasRuns && <Stat icon={TrendingUp} label="Groomed" value={groomedRuns} sub={`of ${RUNS.length}`} onClick={() => setPage('runs')} />}
        {hasTemps && WEATHER[0] && <Stat icon={Thermometer} label={WEATHER[0].name || 'Temp'} value={fmt.temp(WEATHER[0].temp, settings.units)} onClick={() => setPage('temps')} />}
      </div>

      <FreezingLevelCard units={settings.units} />

      {hasForecast && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3">Forecast</h3>
          <div className="flex overflow-x-auto gap-3" style={{ scrollbarWidth: 'none' }}>
            {FORECAST.daily.slice(0, 7).map((d, i) => (
              <div key={i} className="flex-shrink-0 w-16 text-center">
                <p className="text-xs text-slate-400 mb-1">{d.day}</p>
                <p className="text-2xl mb-1">{d.icon || '🌤️'}</p>
                <p className="text-sm font-semibold text-white">{fmt.temp(d.hi, settings.units)}</p>
                {d.lo != null && <p className="text-xs text-slate-500">{fmt.temp(d.lo, settings.units)}</p>}
                {d.snow > 0 && <p className="text-xs text-cyan-400 mt-1">+{fmt.snow(d.snow, settings.units)}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {hasAval && AVAL.level >= 3 && (
        <Card className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-semibold text-amber-400">Avalanche Warning</h3>
              <p className="text-sm text-slate-300 mt-1">
                {AVAL.danger}. {AVAL.problems?.join(', ')}
              </p>
              <button onClick={() => setPage('backcountry')} className="text-xs text-cyan-400 mt-2">
                Full Report →
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

const Cams = () => {
  const { data } = useApp();
  const CAMS = data?.CAMS || [];

  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState(null);
  const [imgErr, setImgErr] = useState({});

  const validCams = CAMS.filter((c) => c.src || c.link);
  const categories = [...new Set(validCams.map((c) => c.category))];
  const cams = filter === 'all' ? validCams : validCams.filter((c) => c.category === filter);

  useEffect(() => {
    if (!sel) return;
    const exists = validCams.some((c) => c.id === sel);
    if (!exists) setSel(null);
  }, [sel, validCams]);

  if (validCams.length === 0) return <NotAvailable message="No webcams available" />;

  if (sel) {
    const cam = validCams.find((c) => c.id === sel);
    const idx = validCams.findIndex((c) => c.id === sel);
    if (!cam) return null;

    return (
      <div className="space-y-4">
        <button onClick={() => setSel(null)} className="flex items-center gap-2 text-cyan-400">
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        <Card>
          <div className="aspect-video bg-slate-900 flex items-center justify-center relative overflow-hidden">
            {cam.type === 'image' && cam.src && !imgErr[cam.id] ? (
              <img
                src={cam.src}
                alt={cam.name}
                className="w-full h-full object-cover"
                onError={() => setImgErr((p) => ({ ...p, [cam.id]: true }))}
              />
            ) : (
              <div className="text-center">
                <span className="text-6xl">{cam.icon || '📷'}</span>
                {cam.link && (
                  <a href={cam.link} target="_blank" rel="noopener noreferrer" className="block mt-4 text-cyan-400 text-sm">
                    Open →
                  </a>
                )}
              </div>
            )}

            <div className="absolute bottom-4 right-4 flex gap-2">
              <button
                onClick={() => setImgErr((p) => ({ ...p, [cam.id]: false }))}
                className="p-2 bg-slate-800/80 rounded-lg text-white"
                title="Retry image"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              {cam.link && (
                <a href={cam.link} target="_blank" rel="noopener noreferrer" className="p-2 bg-slate-800/80 rounded-lg text-white" title="Open in new tab">
                  <ExternalLink className="w-5 h-5" />
                </a>
              )}
            </div>
          </div>

          <div className="p-4">
            <h2 className="text-lg font-semibold text-white">{cam.name}</h2>
            <p className="text-sm text-slate-400 mt-1">{cam.desc}</p>
          </div>
        </Card>

        <div className="flex gap-2">
          <button
            disabled={idx === 0}
            onClick={() => setSel(validCams[idx - 1]?.id)}
            className="flex-1 py-3 bg-slate-800 rounded-lg text-slate-300 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Prev
          </button>
          <button
            disabled={idx === validCams.length - 1}
            onClick={() => setSel(validCams[idx + 1]?.id)}
            className="flex-1 py-3 bg-slate-800 rounded-lg text-slate-300 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {categories.length > 1 && (
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm ${
              filter === 'all' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-slate-800 text-slate-400'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-4 py-2 rounded-lg text-sm capitalize ${
                filter === cat ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {cams.map((c) => (
          <Card key={c.id} onClick={() => setSel(c.id)}>
            <div className="aspect-video bg-slate-900 flex items-center justify-center overflow-hidden">
              {c.type === 'image' && c.src && !imgErr[c.id] ? (
                <img
                  src={c.src}
                  alt={c.name}
                  className="w-full h-full object-cover"
                  onError={() => setImgErr((p) => ({ ...p, [c.id]: true }))}
                />
              ) : (
                <span className="text-4xl">{c.icon || '📷'}</span>
              )}
            </div>
            <div className="p-3">
              <h3 className="text-sm font-medium text-white truncate">{c.name}</h3>
              <p className="text-xs text-slate-500 capitalize">{c.category}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

const Forecast = () => {
  const { settings, data } = useApp();
  const FORECAST = data?.FORECAST || { hourly: [], daily: [] };
  const WEATHER = data?.WEATHER || [];
  const [idx, setIdx] = useState(0);
  const station = WEATHER[idx];

  if (FORECAST.daily.length === 0 && FORECAST.hourly.length === 0) return <NotAvailable message="Forecast not available" />;

  return (
    <div className="space-y-4">
      {WEATHER.length > 1 && (
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {WEATHER.map((w, i) => (
            <button
              key={w.id || i}
              onClick={() => setIdx(i)}
              className={`flex-1 py-2 rounded-lg text-sm ${
                idx === i ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {w.name}
            </button>
          ))}
        </div>
      )}

      {station && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-4xl font-bold text-white">{fmt.temp(station.temp, settings.units)}</p>
              <p className="text-sm text-slate-400 mt-1">{station.name}</p>
            </div>
            <span className="text-6xl">🌤️</span>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-700">
            <div>
              <p className="text-xs text-slate-500">Wind</p>
              <p className="text-sm font-semibold text-white">{fmt.wind(station.wind, settings.units)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Humidity</p>
              <p className="text-sm font-semibold text-white">{station.humidity != null ? `${station.humidity}%` : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Elev</p>
              <p className="text-sm font-semibold text-white">{fmt.elev(station.elev, settings.units)}</p>
            </div>
          </div>
        </Card>
      )}

      {FORECAST.hourly.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3">Hourly</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={FORECAST.hourly}>
                <defs>
                  <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="hr" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide domain={['dataMin-5', 'dataMax+5']} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} />
                <Area type="monotone" dataKey="temp" stroke="#06b6d4" strokeWidth={2} fill="url(#tg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {FORECAST.daily.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3">Extended</h3>
          <div className="space-y-3">
            {FORECAST.daily.map((d, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{d.icon || '🌤️'}</span>
                  <div>
                    <span className="text-sm text-white">{d.day}</span>
                    {d.desc && <p className="text-xs text-slate-500">{d.desc}</p>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-white">
                    {fmt.temp(d.hi, settings.units)}
                    {d.lo != null && ` / ${fmt.temp(d.lo, settings.units)}`}
                  </p>
                  {d.snow > 0 && <p className="text-xs text-cyan-400">+{fmt.snow(d.snow, settings.units)}</p>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

const Lifts = () => {
  const { settings, data } = useApp();
  const LIFTS = data?.LIFTS || [];
  const [view, setView] = useState('status');
  const [filter, setFilter] = useState('all');

  if (LIFTS.length === 0) return <NotAvailable message="Lift status not available" />;

  const open = LIFTS.filter((l) => l.status === 'open').length;
  const hold = LIFTS.filter((l) => l.status === 'hold').length;
  const list = filter === 'all' ? LIFTS : LIFTS.filter((l) => l.status === filter);

  if (view === 'lightboard')
    return (
      <div className="space-y-4">
        <button onClick={() => setView('status')} className="flex items-center gap-2 text-cyan-400">
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <div className="bg-slate-900 rounded-xl p-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white">Lift Status</h2>
            <p className="text-cyan-400 text-lg">
              {open}/{LIFTS.length} Open
            </p>
          </div>
          <div className="space-y-3">
            {LIFTS.map((l, i) => (
              <div key={l.id || i} className={`flex items-center justify-between p-4 rounded-lg ${statusBg(l.status)}`}>
                <span className="text-xl font-bold text-white">{l.name}</span>
                <Badge status={l.status} lg />
              </div>
            ))}
          </div>
        </div>
      </div>
    );

  if (view === 'elevations')
    return (
      <div className="space-y-4">
        <button onClick={() => setView('status')} className="flex items-center gap-2 text-cyan-400">
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <Card>
          <div className="p-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white">Elevations</h2>
          </div>
          <div className="divide-y divide-slate-700/50">
            {[...LIFTS]
              .sort((a, b) => (b.topElev || 0) - (a.topElev || 0))
              .map((l, i) => (
                <div key={l.id || i} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-white">{l.name}</h3>
                    <Badge status={l.status} />
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-slate-400 flex items-center gap-1">
                      <ArrowUp className="w-3 h-3" />
                      {fmt.elev(l.topElev, settings.units)}
                    </span>
                    <span className="text-slate-400 flex items-center gap-1">
                      <ArrowDown className="w-3 h-3" />
                      {fmt.elev(l.bottomElev, settings.units)}
                    </span>
                    {l.vertical && <span className="text-cyan-400">↕ {fmt.elev(l.vertical, settings.units)}</span>}
                  </div>
                </div>
              ))}
          </div>
        </Card>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="flex-1 bg-emerald-500/20 border border-emerald-500/30 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-emerald-400">{open}</p>
          <p className="text-xs text-slate-400">Open</p>
        </div>
        {hold > 0 && (
          <div className="flex-1 bg-amber-500/20 border border-amber-500/30 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-400">{hold}</p>
            <p className="text-xs text-slate-400">Hold</p>
          </div>
        )}
        <div className="flex-1 bg-slate-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-white">{LIFTS.length}</p>
          <p className="text-xs text-slate-400">Total</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setView('elevations')} className="px-3 py-1.5 bg-slate-800 rounded-lg text-sm text-slate-300">
          Elevations
        </button>
        <button onClick={() => setView('lightboard')} className="px-3 py-1.5 bg-slate-800 rounded-lg text-sm text-slate-300">
          Lightboard
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {['all', 'open', 'hold', 'closed'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm ${
              filter === f ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {list.map((l, i) => (
          <Card key={l.id || i} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium text-white">{l.name}</h3>
                <p className="text-xs text-slate-500">{[l.area, l.type].filter(Boolean).join(' • ')}</p>
                {l.notes && <p className="text-xs text-amber-400 mt-1">{l.notes}</p>}
              </div>
              <Badge status={l.status} />
            </div>
            {l.vertical && (
              <div className="flex gap-4 mt-3 text-xs text-slate-400">
                <span>↕ {fmt.elev(l.vertical, settings.units)}</span>
                {l.lastChange && <span>Updated {l.lastChange}</span>}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};

const Runs = () => {
  const { settings, setSettings, data } = useApp();
  const RUNS = data?.RUNS || [];
  const [filter, setFilter] = useState('all');
  const [groomed, setGroomed] = useState(false);

  if (RUNS.length === 0) return <NotAvailable message="Run status not available" />;

  const toggle = (id) =>
    setSettings((s) => ({
      ...s,
      favorites: s.favorites.includes(id) ? s.favorites.filter((x) => x !== id) : [...s.favorites, id],
    }));

  let list = RUNS;
  if (filter === 'favorites') list = RUNS.filter((r) => settings.favorites.includes(r.id));
  else if (filter !== 'all') list = RUNS.filter((r) => r.difficulty === filter);
  if (groomed) list = list.filter((r) => r.groomed);

  const filterButtons = [
    { id: 'all', l: 'All' },
    { id: 'favorites', l: '⭐' },
    { id: 'green', l: '●' },
    { id: 'blue', l: '■' },
    { id: 'black', l: '◆' },
    { id: 'double-black', l: '◆◆' },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">Grooming</p>
            <p className="text-2xl font-bold text-white">{RUNS.filter((r) => r.groomed).length} Groomed</p>
          </div>
          <span className="text-4xl">🚜</span>
        </div>
      </Card>

      <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {filterButtons.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm ${
              filter === f.id ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {f.l}
          </button>
        ))}
      </div>

      <button
        onClick={() => setGroomed(!groomed)}
        className={`w-full flex items-center justify-between p-3 rounded-lg ${
          groomed ? 'bg-cyan-500/20 border border-cyan-500/30' : 'bg-slate-800'
        }`}
      >
        <span className="text-sm text-slate-300">Groomed only</span>
        <div className={`w-10 h-6 rounded-full ${groomed ? 'bg-cyan-500' : 'bg-slate-600'} relative`}>
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white ${groomed ? 'left-5' : 'left-1'}`} />
        </div>
      </button>

      <div className="space-y-2">
        {list.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No runs match</div>
        ) : (
          list.map((r, i) => (
            <Card key={r.id || i} className="p-4">
              <div className="flex items-center gap-3">
                <button onClick={() => toggle(r.id)}>
                  <Star
                    className={`w-5 h-5 ${
                      settings.favorites.includes(r.id) ? 'fill-amber-400 text-amber-400' : 'text-slate-600'
                    }`}
                  />
                </button>
                <div className={`w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold ${diffColor(r.difficulty)}`}>
                  {diffIcon(r.difficulty)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-white truncate">{r.name}</h3>
                    {r.groomed && <span className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded">G</span>}
                  </div>
                  {r.zone && <p className="text-xs text-slate-500">{r.zone}</p>}
                </div>
                <Badge status={r.status} />
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

// NOTE: rest of your file continues (Snow, Temps, WindPage, Roads, Backcountry, Info/About/Support/Privacy, App export)
// If you want, paste the remainder from your current file under here unchanged.
