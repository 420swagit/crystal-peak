import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import {
  Camera, Thermometer, Wind, CloudSnow, Mountain, RefreshCw, ChevronRight, ChevronLeft, Star,
  AlertTriangle, MapPin, Info, Menu, X, ExternalLink, TrendingUp, Activity, Snowflake, ArrowUp,
  ArrowDown, CheckCircle, XCircle, MinusCircle, Coffee, Heart, Loader, WifiOff
} from 'lucide-react';

const AppContext = createContext();
const useApp = () => useContext(AppContext);
const defaultSettings = { units: 'imperial', favorites: [] };
const API_BASE = '/api';

const fmt = {
  temp: (t, u) => t == null ? '—' : u === 'metric' ? `${Math.round((t - 32) * 5 / 9)}°C` : `${t}°F`,
  elev: (e, u) => e == null ? '—' : u === 'metric' ? `${Math.round(e * 0.3048)}m` : `${e.toLocaleString()}'`,
  snow: (i, u) => i == null ? '—' : u === 'metric' ? `${Math.round(i * 2.54)}cm` : `${i}"`,
  wind: (m, u) => m == null ? '—' : u === 'metric' ? `${Math.round(m * 1.609)} km/h` : `${m} mph`,
  // freezing level in meters ASL
  height: (m, u) => m == null ? '—' : u === 'metric' ? `${Math.round(m)}m` : `${Math.round(m * 3.28084).toLocaleString()}'`,
};

const statusColor = s => ({ open: 'text-emerald-400', hold: 'text-amber-400', closed: 'text-rose-400', partial: 'text-amber-400' }[s] || 'text-slate-400');
const statusBg = s => ({ open: 'bg-emerald-500/20 border-emerald-500/30', hold: 'bg-amber-500/20 border-amber-500/30', closed: 'bg-rose-500/20 border-rose-500/30', partial: 'bg-amber-500/20 border-amber-500/30' }[s] || 'bg-slate-500/20 border-slate-500/30');
const diffColor = d => ({ green: 'bg-emerald-500', blue: 'bg-sky-500', black: 'bg-slate-900', 'double-black': 'bg-slate-900' }[d] || 'bg-slate-500');
const diffIcon = d => ({ green: '●', blue: '■', black: '◆', 'double-black': '◆◆' }[d] || '○');

const Badge = ({ status, lg }) => (
  <span className={`inline-flex items-center gap-1 ${lg ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs'} font-semibold uppercase tracking-wide rounded-full border ${statusBg(status)}`}>
    {status === 'open' && <CheckCircle className="w-3 h-3 text-emerald-400" />}
    {(status === 'hold' || status === 'partial') && <MinusCircle className="w-3 h-3 text-amber-400" />}
    {status === 'closed' && <XCircle className="w-3 h-3 text-rose-400" />}
    <span className={statusColor(status)}>{status}</span>
  </span>
);

const Card = ({ children, className = '', onClick }) => (
  <div onClick={onClick} className={`bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700/50 overflow-hidden ${onClick ? 'cursor-pointer hover:bg-slate-800/70' : ''} ${className}`}>
    {children}
  </div>
);

const Stat = ({ icon: Icon, label, value, sub, onClick }) => (
  <Card onClick={onClick} className="p-4">
    <div className="p-2 bg-cyan-500/20 rounded-lg w-fit mb-3"><Icon className="w-5 h-5 text-cyan-400" /></div>
    <p className="text-2xl font-bold text-white">{value}</p>
    <p className="text-xs text-slate-400 mt-1">{label}</p>
    {sub && <p className="text-xs text-slate-500">{sub}</p>}
  </Card>
);

const NotAvailable = ({ message = 'Data not available' }) => (
  <Card className="p-8 text-center"><p className="text-slate-500">{message}</p></Card>
);

const ErrorBanner = ({ message, onRetry }) => (
  <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-center justify-between">
    <div className="flex items-center gap-2"><WifiOff className="w-4 h-4 text-rose-400" /><span className="text-sm text-rose-400">{message}</span></div>
    {onRetry && <button onClick={onRetry} className="text-xs text-cyan-400">Retry</button>}
  </div>
);

const Nav = ({ page, setPage, menu, setMenu }) => {
  const { settings, setSettings, data, dataLoading } = useApp();
  const hasCams = (data?.CAMS?.length ?? 0) > 0;
  const hasForecast = (data?.FORECAST?.daily?.length ?? 0) > 0;
  const hasTemps = (data?.WEATHER?.length ?? 0) > 0;
  const hasWind = hasTemps && data?.WEATHER?.some(w => w.wind != null);
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
              <span className="text-cyan-400">Crystal</span><span className="text-white">Peak</span>
            </span>
          </button>

          <div className="flex items-center gap-2">
            {dataLoading && <Loader className="w-4 h-4 text-cyan-400 animate-spin" />}
            <button
              onClick={() => setSettings(s => ({ ...s, units: s.units === 'imperial' ? 'metric' : 'imperial' }))}
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
          {primary.map(n => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium ${page === n.id ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400'}`}
            >
              <n.icon className="w-4 h-4" />{n.label}
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
                {secondary.map(n => (
                  <button
                    key={n.id}
                    onClick={() => { setPage(n.id); setMenu(false); }}
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
                {['About', 'Support', 'Privacy'].map(i => (
                  <button
                    key={i}
                    onClick={() => { setPage(i.toLowerCase()); setMenu(false); }}
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

const Home = ({ setPage }) => {
  const { settings, data } = useApp();
  const WEATHER = data?.WEATHER || [];
  const FORECAST = data?.FORECAST || { hourly: [], daily: [] };
  const SNOW = data?.SNOW;
  const LIFTS = data?.LIFTS || [];
  const RUNS = data?.RUNS || [];
  const AVAL = data?.AVAL;

  const freezingDaily = FORECAST?.freezing?.daily || [];

  const openLifts = LIFTS.filter(l => l.status === 'open').length;
  const groomedRuns = RUNS.filter(r => r.groomed).length;

  const hasSnow = !!SNOW;
  const hasLifts = LIFTS.length > 0;
  const hasRuns = RUNS.length > 0;
  const hasTemps = WEATHER.length > 0;
  const hasForecast = FORECAST.daily.length > 0;
  const hasFreeze = freezingDaily.length > 0;
  const hasAval = AVAL?.level != null;

  if (!hasSnow && !hasLifts && !hasRuns && !hasTemps && !hasForecast && !hasFreeze && !hasAval) {
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
        {hasSnow && <Stat icon={Snowflake} label="New Snow (24h)" value={fmt.snow(SNOW.new24h, settings.units)} sub={`Base: ${fmt.snow(SNOW.base, settings.units)}`} onClick={() => setPage('snow')} />}
        {hasLifts && <Stat icon={Activity} label="Lifts Open" value={`${openLifts}/${LIFTS.length}`} onClick={() => setPage('lifts')} />}
        {hasRuns && <Stat icon={TrendingUp} label="Groomed" value={groomedRuns} sub={`of ${RUNS.length}`} onClick={() => setPage('runs')} />}
        {hasTemps && WEATHER[0] && <Stat icon={Thermometer} label={WEATHER[0].name || 'Temp'} value={fmt.temp(WEATHER[0].temp, settings.units)} onClick={() => setPage('temps')} />}
      </div>

      {hasFreeze && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-400 uppercase">Freezing Level</h3>
            <span className="text-xs text-slate-500">Next 7 days</span>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={freezingDaily.slice(0, 7)}>
                <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(v) => settings.units === 'metric'
                    ? `${Math.round(v)}m`
                    : `${Math.round(v * 3.28084).toLocaleString()}'`
                  }
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
                  formatter={(value) => [fmt.height(value, settings.units), 'Freezing level']}
                />
                <Line type="monotone" dataKey="max_m" dot={false} stroke="#f59e0b" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-500">0°C level height (daily max). Source: Open-Meteo.</p>
        </Card>
      )}

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
              <p className="text-sm text-slate-300 mt-1">{AVAL.danger}. {AVAL.problems?.join(', ')}</p>
              <button onClick={() => setPage('backcountry')} className="text-xs text-cyan-400 mt-2">Full Report →</button>
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

  // Expect: { id, name, category, type, src, link, desc, icon }
  const validCams = CAMS.filter(c => (c?.src && String(c.src).length) || (c?.link && String(c.link).length));
  const categories = [...new Set(validCams.map(c => c.category).filter(Boolean))];
  const cams = filter === 'all' ? validCams : validCams.filter(c => c.category === filter);

  if (validCams.length === 0) return <NotAvailable message="No webcams available" />;

  if (sel) {
    const cam = validCams.find(c => c.id === sel);
    const idx = validCams.findIndex(c => c.id === sel);
    if (!cam) { setSel(null); return null; }

    const isImage = cam.type === 'image' && !!cam.src;

    return (
      <div className="space-y-4">
        <button onClick={() => setSel(null)} className="flex items-center gap-2 text-cyan-400">
          <ChevronLeft className="w-4 h-4" />Back
        </button>

        <Card>
          <div className="aspect-video bg-slate-900 flex items-center justify-center relative overflow-hidden">
            {isImage && !imgErr[cam.id] ? (
              <img
                src={cam.src}
                alt={cam.name}
                className="w-full h-full object-cover"
                onError={() => setImgErr(p => ({ ...p, [cam.id]: true }))}
              />
            ) : (
              <div className="text-center px-6">
                <span className="text-6xl">{cam.icon || '📷'}</span>
                <p className="text-sm text-slate-400 mt-3">
                  {imgErr[cam.id] ? 'Image failed to load.' : 'This cam opens externally.'}
                </p>
                {cam.link && (
                  <a href={cam.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-4 text-cyan-400 text-sm">
                    Open <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            )}

            <div className="absolute bottom-4 right-4 flex gap-2">
              {isImage && (
                <button
                  onClick={() => setImgErr(p => ({ ...p, [cam.id]: false }))}
                  className="p-2 bg-slate-800/80 rounded-lg text-white"
                  title="Retry"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              )}
              {cam.link && (
                <a
                  href={cam.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 bg-slate-800/80 rounded-lg text-white"
                  title="Open source"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
              )}
            </div>
          </div>

          <div className="p-4">
            <h2 className="text-lg font-semibold text-white">{cam.name}</h2>
            <p className="text-sm text-slate-400 mt-1">{cam.desc || '—'}</p>
            <p className="text-xs text-slate-500 mt-2 capitalize">Category: {cam.category || 'other'}</p>
          </div>
        </Card>

        <div className="flex gap-2">
          <button
            disabled={idx === 0}
            onClick={() => setSel(validCams[idx - 1]?.id)}
            className="flex-1 py-3 bg-slate-800 rounded-lg text-slate-300 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />Prev
          </button>
          <button
            disabled={idx === validCams.length - 1}
            onClick={() => setSel(validCams[idx + 1]?.id)}
            className="flex-1 py-3 bg-slate-800 rounded-lg text-slate-300 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            Next<ChevronRight className="w-4 h-4" />
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
            className={`px-4 py-2 rounded-lg text-sm ${filter === 'all' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-slate-800 text-slate-400'}`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-4 py-2 rounded-lg text-sm capitalize ${filter === cat ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-slate-800 text-slate-400'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {cams.map(c => {
          const isImage = c.type === 'image' && !!c.src;
          const thumbOk = isImage && !imgErr[c.id];

          return (
            <Card key={c.id} onClick={() => setSel(c.id)}>
              <div className="aspect-video bg-slate-900 flex items-center justify-center overflow-hidden">
                {thumbOk ? (
                  <img
                    src={c.src}
                    alt={c.name}
                    className="w-full h-full object-cover"
                    onError={() => setImgErr(p => ({ ...p, [c.id]: true }))}
                  />
                ) : (
                  <span className="text-4xl">{c.icon || '📷'}</span>
                )}
              </div>
              <div className="p-3">
                <h3 className="text-sm font-medium text-white truncate">{c.name}</h3>
                <p className="text-xs text-slate-500 capitalize">{c.category || 'other'}</p>
              </div>
            </Card>
          );
        })}
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
              className={`flex-1 py-2 rounded-lg text-sm ${idx === i ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-slate-800 text-slate-400'}`}
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
                {/* FIX: backend provides `time`, not `hr` */}
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
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
                  <p className="text-sm font-semibold text-white">{fmt.temp(d.hi, settings.units)}{d.lo != null && ` / ${fmt.temp(d.lo, settings.units)}`}</p>
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

  const open = LIFTS.filter(l => l.status === 'open').length;
  const hold = LIFTS.filter(l => l.status === 'hold').length;
  const list = filter === 'all' ? LIFTS : LIFTS.filter(l => l.status === filter);

  if (view === 'lightboard') {
    return (
      <div className="space-y-4">
        <button onClick={() => setView('status')} className="flex items-center gap-2 text-cyan-400"><ChevronLeft className="w-4 h-4" />Back</button>
        <div className="bg-slate-900 rounded-xl p-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white">Lift Status</h2>
            <p className="text-cyan-400 text-lg">{open}/{LIFTS.length} Open</p>
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
  }

  if (view === 'elevations') {
    return (
      <div className="space-y-4">
        <button onClick={() => setView('status')} className="flex items-center gap-2 text-cyan-400"><ChevronLeft className="w-4 h-4" />Back</button>
        <Card>
          <div className="p-4 border-b border-slate-700"><h2 className="text-lg font-semibold text-white">Elevations</h2></div>
          <div className="divide-y divide-slate-700/50">
            {[...LIFTS].sort((a, b) => (b.topElev || 0) - (a.topElev || 0)).map((l, i) => (
              <div key={l.id || i} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-white">{l.name}</h3>
                  <Badge status={l.status} />
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-slate-400 flex items-center gap-1"><ArrowUp className="w-3 h-3" />{fmt.elev(l.topElev, settings.units)}</span>
                  <span className="text-slate-400 flex items-center gap-1"><ArrowDown className="w-3 h-3" />{fmt.elev(l.bottomElev, settings.units)}</span>
                  {l.vertical && <span className="text-cyan-400">↕ {fmt.elev(l.vertical, settings.units)}</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="flex-1 bg-emerald-500/20 border border-emerald-500/30 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-emerald-400">{open}</p><p className="text-xs text-slate-400">Open</p>
        </div>
        {hold > 0 && (
          <div className="flex-1 bg-amber-500/20 border border-amber-500/30 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-400">{hold}</p><p className="text-xs text-slate-400">Hold</p>
          </div>
        )}
        <div className="flex-1 bg-slate-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-white">{LIFTS.length}</p><p className="text-xs text-slate-400">Total</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setView('elevations')} className="px-3 py-1.5 bg-slate-800 rounded-lg text-sm text-slate-300">Elevations</button>
        <button onClick={() => setView('lightboard')} className="px-3 py-1.5 bg-slate-800 rounded-lg text-sm text-slate-300">Lightboard</button>
      </div>

      <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {['all', 'open', 'hold', 'closed'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm ${filter === f ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-slate-800 text-slate-400'}`}
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

  const toggle = id => setSettings(s => ({ ...s, favorites: s.favorites.includes(id) ? s.favorites.filter(x => x !== id) : [...s.favorites, id] }));

  let list = RUNS;
  if (filter === 'favorites') list = RUNS.filter(r => settings.favorites.includes(r.id));
  else if (filter !== 'all') list = RUNS.filter(r => r.difficulty === filter);
  if (groomed) list = list.filter(r => r.groomed);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div><p className="text-sm text-slate-400">Grooming</p><p className="text-2xl font-bold text-white">{RUNS.filter(r => r.groomed).length} Groomed</p></div>
          <span className="text-4xl">🚜</span>
        </div>
      </Card>

      <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {[{ id: 'all', l: 'All' }, { id: 'favorites', l: '⭐' }, { id: 'green', l: '●' }, { id: 'blue', l: '■' }, { id: 'black', l: '◆' }, { id: 'double-black', l: '◆◆' }].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm ${filter === f.id ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-slate-800 text-slate-400'}`}>
            {f.l}
          </button>
        ))}
      </div>

      <button onClick={() => setGroomed(!groomed)} className={`w-full flex items-center justify-between p-3 rounded-lg ${groomed ? 'bg-cyan-500/20 border border-cyan-500/30' : 'bg-slate-800'}`}>
        <span className="text-sm text-slate-300">Groomed only</span>
        <div className={`w-10 h-6 rounded-full ${groomed ? 'bg-cyan-500' : 'bg-slate-600'} relative`}>
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white ${groomed ? 'left-5' : 'left-1'}`} />
        </div>
      </button>

      <div className="space-y-2">
        {list.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No runs match</div>
        ) : list.map((r, i) => (
          <Card key={r.id || i} className="p-4">
            <div className="flex items-center gap-3">
              <button onClick={() => toggle(r.id)}>
                <Star className={`w-5 h-5 ${settings.favorites.includes(r.id) ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
              </button>
              <div className={`w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold ${diffColor(r.difficulty)}`}>{diffIcon(r.difficulty)}</div>
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
        ))}
      </div>
    </div>
  );
};

const Snow = () => {
  const { settings, data } = useApp();
  const SNOW = data?.SNOW;
  if (!SNOW) return <NotAvailable message="Snow report not available" />;

  return (
    <div className="space-y-4">
      <Card className="p-6 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border-cyan-500/30 text-center">
        <p className="text-sm text-cyan-400 uppercase">New Snow (24h)</p>
        <p className="text-6xl font-bold text-white mt-2">{fmt.snow(SNOW.new24h, settings.units)}</p>
        {SNOW.surface && <p className="text-slate-400 mt-2">{SNOW.surface}</p>}
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 text-center"><p className="text-xs text-slate-500">48hr</p><p className="text-2xl font-bold text-white">{fmt.snow(SNOW.new48h, settings.units)}</p></Card>
        <Card className="p-4 text-center"><p className="text-xs text-slate-500">Base</p><p className="text-2xl font-bold text-white">{fmt.snow(SNOW.base, settings.units)}</p></Card>
        <Card className="p-4 text-center"><p className="text-xs text-slate-500">Season</p><p className="text-2xl font-bold text-white">{fmt.snow(SNOW.season, settings.units)}</p></Card>
        <Card className="p-4 text-center"><p className="text-xs text-slate-500">Updated</p><p className="text-lg font-bold text-white">{SNOW.updated || '—'}</p></Card>
      </div>
    </div>
  );
};

const Temps = () => {
  const { settings, data } = useApp();
  const WEATHER = data?.WEATHER || [];
  if (WEATHER.length === 0) return <NotAvailable message="Temp data not available" />;

  return (
    <div className="space-y-4">
      {WEATHER.map((s, i) => (
        <Card key={s.id || i} className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold text-white">{s.name}</h3>
              <p className="text-xs text-slate-500">{fmt.elev(s.elev, settings.units)}</p>
            </div>
            <p className="text-3xl font-bold text-white">{fmt.temp(s.temp, settings.units)}</p>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-3 border-t border-slate-700">
            <div><p className="text-xs text-slate-500">Wind</p><p className="text-sm font-medium text-white">{fmt.wind(s.wind, settings.units)} {s.dir || ''}</p></div>
            <div><p className="text-xs text-slate-500">Gusts</p><p className="text-sm font-medium text-white">{fmt.wind(s.gust, settings.units)}</p></div>
            <div><p className="text-xs text-slate-500">Humidity</p><p className="text-sm font-medium text-white">{s.humidity != null ? `${s.humidity}%` : '—'}</p></div>
          </div>
        </Card>
      ))}
    </div>
  );
};

const WindPage = () => {
  const { settings, data } = useApp();
  const WEATHER = data?.WEATHER || [];
  const withWind = WEATHER.filter(w => w.wind != null);
  if (withWind.length === 0) return <NotAvailable message="Wind data not available" />;

  const primary = withWind[0];
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3">{primary.name}</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-4xl font-bold text-white">{fmt.wind(primary.wind, settings.units)}</p>
            <p className="text-sm text-slate-400">Gusts {fmt.wind(primary.gust, settings.units)}</p>
          </div>
          <div className="text-right">
            <span className="text-4xl">🧭</span>
            <p className="text-sm text-cyan-400">{primary.dir || '—'}</p>
          </div>
        </div>
      </Card>

      {withWind.length > 1 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3">All Stations</h3>
          {withWind.map((s, i) => (
            <div key={s.id || i} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
              <div><p className="text-sm font-medium text-white">{s.name}</p><p className="text-xs text-slate-500">{fmt.elev(s.elev, settings.units)}</p></div>
              <div className="text-right">
                <p className="text-sm font-semibold text-white">{fmt.wind(s.wind, settings.units)} {s.dir || ''}</p>
                <p className="text-xs text-slate-500">G {fmt.wind(s.gust, settings.units)}</p>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};

const Roads = () => {
  const { settings, data } = useApp();
  const passes = data?.ROADS?.passes || [];
  const [sel, setSel] = useState(null);

  if (passes.length === 0) return <NotAvailable message="Road conditions not available" />;

  const toBadge = (p) => {
    const s = String(p?.status || '').toLowerCase();
    if (s === 'advisory') return 'hold';
    if (s.includes('open') || s.includes('bare') || s.includes('dry')) return 'open';
    if (s.includes('closed')) return 'closed';
    return 'partial';
  };

  const formatUpdated = (iso) => {
    try {
      if (!iso) return '—';
      return new Date(iso).toLocaleString();
    } catch { return '—'; }
  };

  if (sel) {
    const p = passes.find(x => String(x.id) === String(sel));
    if (!p) { setSel(null); return null; }

    return (
      <div className="space-y-4">
        <button onClick={() => setSel(null)} className="flex items-center gap-2 text-cyan-400">
          <ChevronLeft className="w-4 h-4" />Back
        </button>

        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">{p.name}</h2>
              <p className="text-xs text-slate-500 mt-1">WSDOT pass report</p>
            </div>
            <Badge status={toBadge(p)} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Card className="p-3 bg-slate-900/40 border-slate-700/50">
              <p className="text-xs text-slate-500">Temperature</p>
              <p className="text-lg font-semibold text-white">{p.temp != null ? fmt.temp(p.temp, settings.units) : '—'}</p>
            </Card>
            <Card className="p-3 bg-slate-900/40 border-slate-700/50">
              <p className="text-xs text-slate-500">Elevation</p>
              <p className="text-lg font-semibold text-white">
                {p.elevationFt != null ? fmt.elev(p.elevationFt, settings.units) : '—'}
              </p>
            </Card>
          </div>

          <div className="mt-4 space-y-3">
            <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-700/50">
              <p className="text-xs text-slate-500">Travel eastbound</p>
              <p className="text-sm text-white mt-1">{p.travelEastbound || '—'}</p>
            </div>
            <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-700/50">
              <p className="text-xs text-slate-500">Travel westbound</p>
              <p className="text-sm text-white mt-1">{p.travelWestbound || '—'}</p>
            </div>
            <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-700/50">
              <p className="text-xs text-slate-500">Conditions</p>
              <p className="text-sm text-white mt-1">{p.conditions || p.status || '—'}</p>
            </div>
            <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-700/50">
              <p className="text-xs text-slate-500">Weather</p>
              <p className="text-sm text-white mt-1">{p.weather || '—'}</p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <span>Last updated</span>
            <span className="text-slate-300">{formatUpdated(p.updated)}</span>
          </div>

          {p.link && (
            <a
              href={p.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-cyan-400 text-sm"
            >
              View on WSDOT <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-lg font-semibold text-white">Mountain Passes</h2>
        <p className="text-sm text-slate-400">Tap a pass to view full pass report</p>
      </Card>

      {passes.map((p, i) => (
        <Card key={p.id || i} className="p-4" onClick={() => setSel(String(p.id))}>
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-medium text-white">{p.name}</h3>
            <Badge status={toBadge(p)} />
          </div>
          {p.restriction && <p className="text-sm text-amber-400 mb-2">{p.restriction}</p>}
          <div className="flex gap-4 text-xs text-slate-400">
            {p.temp != null && <span>Temp: {fmt.temp(p.temp, settings.units)}</span>}
            {p.weather && <span>{p.weather}</span>}
          </div>
          {p.updated && <p className="text-xs text-slate-500 mt-2">Updated: {formatUpdated(p.updated)}</p>}
        </Card>
      ))}
    </div>
  );
};

const Backcountry = () => {
  const { data } = useApp();
  const AVAL = data?.AVAL;
  if (!AVAL) return <NotAvailable message="Avalanche data not available" />;

  const colors = { 1: 'bg-emerald-500', 2: 'bg-yellow-500', 3: 'bg-amber-500', 4: 'bg-rose-500', 5: 'bg-rose-700' };

  return (
    <div className="space-y-4">
      <Card className="p-6 text-center">
        <p className="text-sm text-slate-400 uppercase">Avalanche Danger</p>
        <div className="flex items-center justify-center gap-3 mt-4">
          <div className={`w-16 h-16 ${colors[AVAL.level] || 'bg-slate-500'} rounded-full flex items-center justify-center`}>
            <span className="text-2xl font-bold text-white">{AVAL.level || '?'}</span>
          </div>
          <p className="text-3xl font-bold text-white">{AVAL.danger || 'Unknown'}</p>
        </div>
      </Card>

      {AVAL.problems?.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3">Problems</h3>
          <div className="flex flex-wrap gap-2">
            {AVAL.problems.map((p, i) => (
              <span key={i} className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-sm">{p}</span>
            ))}
          </div>
        </Card>
      )}

      {AVAL.summary && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3">Summary</h3>
          <p className="text-slate-300">{AVAL.summary}</p>
        </Card>
      )}

      {AVAL.link && (
        <a href={AVAL.link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 p-4 bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-400">
          <ExternalLink className="w-5 h-5" />Full NWAC Report
        </a>
      )}
    </div>
  );
};

const InfoPage = () => (
  <Card className="p-4">
    <h2 className="text-lg font-semibold text-white mb-4">Mountain Info</h2>
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-400 mb-2">Hours</h3>
        <p className="text-white">9 AM - 4 PM (typical)</p>
      </div>

      <div className="border-t border-slate-700 pt-4">
        <h3 className="text-sm font-semibold text-slate-400 mb-2">Links</h3>
        {[
          { l: 'Crystal Mountain', u: 'https://www.crystalmountainresort.com' },
          { l: 'NWAC', u: 'https://nwac.us' },
          { l: 'WSDOT Passes', u: 'https://wsdot.com/travel/real-time/mountainpasses' },
        ].map(x => (
          <a key={x.l} href={x.u} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg text-slate-300 hover:text-white mt-2">
            <span>{x.l}</span><ExternalLink className="w-4 h-4" />
          </a>
        ))}
      </div>

      <div className="border-t border-slate-700 pt-4">
        <h3 className="text-sm font-semibold text-slate-400 mb-2">Contact</h3>
        <p className="text-slate-300">(360) 663-2265</p>
      </div>
    </div>
  </Card>
);

const About = () => (
  <div className="space-y-4">
    <Card className="p-6 text-center">
      <div className="w-16 h-16 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Mountain className="w-10 h-10 text-white" />
      </div>
      <h1 className="text-2xl font-bold text-white">Crystal Peak</h1>
      <p className="text-slate-400 mt-2">Live ski conditions</p>
    </Card>

    <Card className="p-4">
      <div className="flex items-start gap-3 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 mb-4">
        <AlertTriangle className="w-5 h-5 text-amber-400" />
        <div>
          <p className="text-sm text-amber-400 font-medium">Not Affiliated</p>
          <p className="text-xs text-slate-400">Independent project</p>
        </div>
      </div>
      <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3">Sources</h3>
      <p className="text-sm text-slate-300">NWS • WSDOT • NWAC • Open-Meteo</p>
    </Card>
  </div>
);

const Support = () => (
  <div className="space-y-4">
    <Card className="p-6 text-center">
      <div className="w-16 h-16 bg-gradient-to-br from-rose-400 to-pink-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Heart className="w-10 h-10 text-white" />
      </div>
      <h1 className="text-2xl font-bold text-white">Support</h1>
    </Card>
    <Card className="p-4">
      <p className="text-sm text-slate-300 mb-4">Built by skiers!</p>
      <a href="#" className="flex items-center justify-center gap-2 p-4 bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-400">
        <Coffee className="w-5 h-5" />Buy Coffee
      </a>
    </Card>
  </div>
);

const Privacy = () => (
  <Card className="p-4">
    <h1 className="text-xl font-bold text-white mb-4">Privacy</h1>
    <div className="space-y-4 text-sm text-slate-300">
      <p><strong className="text-white">Storage:</strong> Preferences saved locally</p>
      <p><strong className="text-white">Data:</strong> Fetched from NWS, WSDOT, NWAC, Open-Meteo</p>
    </div>
  </Card>
);

export default function App() {
  const [page, setPage] = useState('home');
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(defaultSettings);

  const [data, setData] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataErr, setDataErr] = useState(null);

  useEffect(() => { try { const s = localStorage.getItem('cpSettings'); if (s) setSettings(p => ({ ...p, ...JSON.parse(s) })); } catch { } }, []);
  useEffect(() => { try { localStorage.setItem('cpSettings', JSON.stringify(settings)); } catch { } }, [settings]);
  useEffect(() => { setMenu(false); }, [page]);

  const refresh = useCallback(async () => {
    setDataLoading(true);
    try {
      const res = await fetch(`${API_BASE}/state`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`API ${res.status}`);
      setData(await res.json());
      setDataErr(null);
    } catch (err) {
      setDataErr(err.message);
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); const i = setInterval(refresh, 120000); return () => clearInterval(i); }, [refresh]);

  useEffect(() => {
    if (!data) return;
    const avail = new Set(['home', 'info', 'about', 'support', 'privacy']);
    if ((data.CAMS?.length ?? 0) > 0) avail.add('cams');
    if ((data.FORECAST?.daily?.length ?? 0) > 0) avail.add('forecast');
    if ((data.WEATHER?.length ?? 0) > 0) {
      avail.add('temps');
      if (data.WEATHER.some(w => w.wind != null)) avail.add('wind');
    }
    if (data.SNOW) avail.add('snow');
    if ((data.LIFTS?.length ?? 0) > 0) avail.add('lifts');
    if ((data.RUNS?.length ?? 0) > 0) avail.add('runs');
    if (data.AVAL) avail.add('backcountry');
    if ((data.ROADS?.passes?.length ?? 0) > 0) avail.add('roads');
    if (!avail.has(page)) setPage('home');
  }, [data, page]);

  const titles = {
    home: 'Dashboard',
    cams: 'Webcams',
    forecast: 'Forecast',
    lifts: 'Lifts',
    runs: 'Runs',
    snow: 'Snow',
    temps: 'Temps',
    wind: 'Wind',
    roads: 'Roads',
    backcountry: 'Backcountry',
    info: 'Info',
    about: 'About',
    support: 'Support',
    privacy: 'Privacy',
  };

  const render = () => {
    switch (page) {
      case 'home': return <Home setPage={setPage} />;
      case 'cams': return <Cams />;
      case 'forecast': return <Forecast />;
      case 'lifts': return <Lifts />;
      case 'runs': return <Runs />;
      case 'snow': return <Snow />;
      case 'temps': return <Temps />;
      case 'wind': return <WindPage />;
      case 'roads': return <Roads />;
      case 'backcountry': return <Backcountry />;
      case 'info': return <InfoPage />;
      case 'about': return <About />;
      case 'support': return <Support />;
      case 'privacy': return <Privacy />;
      default: return <Home setPage={setPage} />;
    }
  };

  return (
    <AppContext.Provider value={{ settings, setSettings, data, dataLoading, dataErr, refresh }}>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white">
        <div
          className="fixed inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.15) 1px, transparent 0)',
            backgroundSize: '24px 24px'
          }}
        />
        <Nav page={page} setPage={setPage} menu={menu} setMenu={setMenu} />
        <main className="relative pt-28 pb-8 px-4 max-w-lg mx-auto">
          {dataErr && <ErrorBanner message={dataErr} onRetry={refresh} />}
          {page !== 'home' && <h1 className="text-xl font-bold text-white mb-4">{titles[page]}</h1>}
          {render()}
        </main>
        <footer className="relative border-t border-slate-800 py-6 px-4 text-center">
          <p className="text-xs text-slate-500">Crystal Peak • Not affiliated with Crystal Mountain</p>
          {data?.generatedAt && <p className="text-xs text-slate-600 mt-1">Data: {new Date(data.generatedAt).toLocaleTimeString()}</p>}
        </footer>
      </div>
    </AppContext.Provider>
  );
}
