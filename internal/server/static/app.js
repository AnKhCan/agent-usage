// ── Security & Utils ──
const esc = s => {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
};
const $ = id => document.getElementById(id);
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
const fmtCost = n => n === 0 ? '$0.00' : n >= 1 ? '$' + n.toFixed(2) : '$' + n.toFixed(4);

// ── Timezone helpers ──
// Format a Date as YYYY-MM-DD in local timezone (avoids toISOString which returns UTC)
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(y, m - 1, d);
  if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) return null;
  return parsed;
}

function isDateValue(value) {
  return !!parseLocalDate(value);
}

function firstOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d, days) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(d, months) {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

function normalizeRange(from, to) {
  const today = localDateStr(new Date());
  let start = isDateValue(from) ? from : today;
  let end = isDateValue(to) ? to : start;
  if (start > end) [start, end] = [end, start];
  return { from: start, to: end };
}

// Convert date label from API to display label.
// With tz_offset, bucketing is already in local time — return as-is.
function utcToLocalLabel(s) {
  return s;
}

// ── i18n ──
const I18N = {
  en: {
    title: 'Usage Analytics', to: 'to', totalCost: 'Total Cost', totalTokens: 'Total Tokens',
    sessions: 'Sessions', prompts: 'Prompts', apiCalls: 'API Calls', cacheHitRate: 'Cache Hit Rate', costByModel: 'Cost by Model', costOverTime: 'Cost Trend',
    compare: 'Compare', compare_off: 'Compare Off', compare_elapsed: 'Same Progress', compare_full: 'Full Previous', trendCompare: 'Trend Comparison', currentPeriod: 'Current', previousPeriod: 'Previous', modelMovers: 'Model Changes', sourceMovers: 'Source Changes', noComparisonData: 'No comparison data.',
    tokenUsage: 'Token Usage', dailySessions: 'Daily Sessions', source: 'Source', project: 'Project',
    branch: 'Branch', time: 'Time', tokens: 'Tokens', cost: 'Cost', refresh: 'Refresh',
    sessionLog: 'Session Log',
    today: 'Today', thisWeek: 'This Week', thisMonth: 'This Month', thisYear: 'This Year',
    last3d: 'Last 3 Days', last7d: 'Last 7 Days', last30d: 'Last 30 Days', custom: 'Custom',
    light: 'Light', dark: 'Dark', system: 'System', autoOn: 'Auto ✓', autoOff: 'Auto',
    input: 'Input', output: 'Output', cacheRead: 'Cache Read', cacheCreate: 'Cache Write',
    gran_1m: '1 min', gran_30m: '30 min', gran_1h: '1 hour', gran_6h: '6 hours', gran_12h: '12 hours', gran_1d: '1 day', gran_1w: '1 week', gran_1M: '1 month',
    model: 'Model', calls: 'Calls', allSources: 'All Sources', claudeCode: 'Claude Code', codex: 'Codex', openClaw: 'OpenClaw', openCode: 'OpenCode', kiro: 'Kiro CLI', pi: 'Pi',
    filterProject: 'Filter by project...', justNow: 'just now', mAgo: 'm ago', hAgo: 'h ago', dAgo: 'd ago',
    noSessions: 'No sessions found in this period.', unitMin: 'min', unitSec: 'sec',
    apply: 'Apply', previousMonth: 'Previous month', nextMonth: 'Next month', dateRange: 'Date range'
  },
  zh: {
    title: '使用分析', to: '至', totalCost: '总费用', totalTokens: '总 Tokens',
    sessions: '会话数', prompts: 'Prompt 数', apiCalls: 'API 调用数', cacheHitRate: '缓存命中率', costByModel: '模型费用占比', costOverTime: '费用趋势',
    compare: '对比', compare_off: '关闭对比', compare_elapsed: '相同进度', compare_full: '完整上期', trendCompare: '趋势对比', currentPeriod: '当前周期', previousPeriod: '上一周期', modelMovers: '模型变化', sourceMovers: '来源变化', noComparisonData: '暂无对比数据。',
    tokenUsage: 'Token 用量', dailySessions: '每日会话数', source: '来源', project: '项目',
    branch: '分支', time: '时间', tokens: 'Tokens', cost: '费用', refresh: '刷新',
    sessionLog: '会话记录',
    today: '今天', thisWeek: '本周', thisMonth: '本月', thisYear: '今年',
    last3d: '近3天', last7d: '近7天', last30d: '近30天', custom: '自定义',
    light: '浅色', dark: '深色', system: '跟随系统', autoOn: '自动 ✓', autoOff: '自动',
    input: '输入', output: '输出', cacheRead: '缓存读取', cacheCreate: '缓存写入',
    gran_1m: '1 分钟', gran_30m: '30 分钟', gran_1h: '1 小时', gran_6h: '6 小时', gran_12h: '12 小时', gran_1d: '1 天', gran_1w: '1 周', gran_1M: '1 个月',
    model: '模型', calls: '调用次数', allSources: '全部来源', claudeCode: 'Claude Code', codex: 'Codex', openClaw: 'OpenClaw', openCode: 'OpenCode', kiro: 'Kiro CLI', pi: 'Pi',
    filterProject: '按项目筛选...', justNow: '刚刚', mAgo: '分钟前', hAgo: '小时前', dAgo: '天前',
    noSessions: '当前时间段内暂无会话数据。', unitMin: '分钟', unitSec: '秒',
    apply: '应用', previousMonth: '上个月', nextMonth: '下个月', dateRange: '日期范围'
  }
};

// ── State ──
const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];
const SOURCE_LABEL_KEYS = { claude: 'claudeCode', codex: 'codex', openclaw: 'openClaw', opencode: 'openCode', kiro: 'kiro', pi: 'pi' };
const RANGE_SHORTCUTS = ['today', 'thisWeek', 'thisMonth', 'thisYear', 'last3d', 'last7d', 'last30d'];
const PRESETS = [...RANGE_SHORTCUTS, 'custom'];
const GRANULARITIES = ['1m', '30m', '1h', '6h', '12h', '1d', '1w', '1M'];
const COMPARE_MODES = ['off', 'elapsed', 'full'];
const REFRESH_INTERVALS = [30, 60, 300, 1800, 3600];
const initialCompareMode = localStorage.getItem('au-compareEnabled') === 'false'
  ? 'off'
  : (localStorage.getItem('au-compareMode') || 'elapsed');

let state = {
  lang: localStorage.getItem('au-lang') || (navigator.language.includes('zh') ? 'zh' : 'en'),
  theme: localStorage.getItem('au-theme') || 'system',
  preset: localStorage.getItem('au-preset') || 'today',
  granularity: localStorage.getItem('au-granularity') || '1h',
  compareMode: initialCompareMode,
  autoRefresh: localStorage.getItem('au-autoRefresh') !== 'false',
  refreshInterval: parseInt(localStorage.getItem('au-refreshInterval')) || 300,
  customFrom: localStorage.getItem('au-customFrom') || '',
  customTo: localStorage.getItem('au-customTo') || '',
  source: localStorage.getItem('au-source') || '',
  model: localStorage.getItem('au-model') || '',
};

let autoTimer = null;
let charts = {};
let allSessions = [];
let sessionTotal = 0;
let sessionTotalPages = 1;
let sessionSort = { key: 'start_time', dir: 'desc' };
let sessionPage = 1;
const PAGE_SIZE = 20;
let expandedSessions = new Set(); // Stores opened sid
let isFetching = false;
let projectFilterTimer = null;
let datePicker = {
  open: false,
  viewMonth: null,
  draftFrom: '',
  draftTo: '',
  selectingEnd: false,
  hoverDate: ''
};

function eventIncludesElement(e, el) {
  if (!el) return false;
  if (typeof e.composedPath === 'function') return e.composedPath().includes(el);
  return el.contains(e.target);
}

const ENHANCED_SELECT_IDS = ['sel-granularity', 'sel-compare-mode', 'filter-source', 'filter-model', 'sel-refresh-interval', 'sel-theme', 'sel-lang'];
const customSelects = new Map();

function t(key) { return (I18N[state.lang] || I18N.en)[key] || key; }
function persist(key, val) { state[key] = val; localStorage.setItem('au-' + key, val); }
function isCompareEnabled() { return state.compareMode !== 'off'; }

function sameRange(a, b) {
  return a && b && a.from === b.from && a.to === b.to;
}

function storeRange(range) {
  persist('customFrom', range.from);
  persist('customTo', range.to);
}

function rangeForPreset(preset) {
  const now = new Date();
  const todayStr = localDateStr(now);

  switch (preset) {
    case 'today':
      return { from: todayStr, to: todayStr };
    case 'thisWeek': {
      const start = new Date(now);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      return { from: localDateStr(start), to: todayStr };
    }
    case 'thisMonth': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: localDateStr(start), to: todayStr };
    }
    case 'thisYear':
      return { from: `${now.getFullYear()}-01-01`, to: todayStr };
    case 'last3d':
      return { from: localDateStr(addDays(now, -2)), to: todayStr };
    case 'last7d':
      return { from: localDateStr(addDays(now, -6)), to: todayStr };
    case 'last30d':
      return { from: localDateStr(addDays(now, -29)), to: todayStr };
    default:
      return null;
  }
}

function matchingShortcutForRange(range) {
  return RANGE_SHORTCUTS.find(p => sameRange(range, rangeForPreset(p))) || '';
}

function matchingPresetForRange(range) {
  return matchingShortcutForRange(range) || 'custom';
}

function setPickerDraft(range, opts = {}) {
  datePicker.draftFrom = range.from;
  datePicker.draftTo = range.to;
  datePicker.selectingEnd = false;
  datePicker.hoverDate = '';
  if (opts.alignView !== false) datePicker.viewMonth = firstOfMonth(parseLocalDate(range.from));
}

function setPreset(preset, opts = {}) {
  const range = rangeForPreset(preset);
  if (!range) return;

  persist('preset', preset);
  storeRange(range);
  setPickerDraft(range, { alignView: opts.alignView });
  sessionPage = 1;

  if (opts.closePicker) {
    closeDatePicker();
  }
  buildControls();
  if (opts.refresh !== false) {
    refresh();
    applyAutoRefresh();
  }
}

function applyTheme() {
  const th = state.theme === 'system' ? (window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light') : state.theme;
  document.documentElement.setAttribute('data-theme', th);
  document.documentElement.style.colorScheme = th;
  Object.values(charts).forEach(c => c && c.resize());
}

function getThemeColors() {
  const cs = getComputedStyle(document.documentElement);
  return {
    bg: cs.getPropertyValue('--chart-bg').trim() || 'transparent',
    text: cs.getPropertyValue('--chart-text').trim() || '#f3f4f6',
    muted: cs.getPropertyValue('--chart-muted').trim() || '#9ca3af',
    grid: cs.getPropertyValue('--chart-grid').trim() || '#262a36',
    tooltipBg: cs.getPropertyValue('--tooltip-bg').trim() || 'rgba(21, 24, 34, 0.95)',
    tooltipBorder: cs.getPropertyValue('--tooltip-border').trim() || '#374151',
  };
}

function baseOpt() {
  const tc = getThemeColors();
  return {
    backgroundColor: tc.bg,
    textStyle: { color: tc.text, fontFamily: 'Inter, sans-serif' },
    grid: { left: 60, right: 30, top: 40, bottom: 40 },
    tooltip: { trigger: 'axis', backgroundColor: tc.tooltipBg, borderColor: tc.tooltipBorder, textStyle: { color: tc.text }, padding: [12, 16], borderRadius: 8 }
  };
}

// ── Time range ──
function getTimeRange() {
  const now = new Date(); const todayStr = localDateStr(now);
  return rangeForPreset(state.preset) || normalizeRange(state.customFrom || todayStr, state.customTo || state.customFrom || todayStr);
}

async function api(path, opts) {
  const r = getTimeRange();
  const q = new URLSearchParams();
  q.set('from', r.from);
  q.set('to', r.to);
  if (state.granularity) q.set('granularity', state.granularity);
  if (isCompareEnabled()) q.set('compare_mode', state.compareMode);
  if (state.source) q.set('source', state.source);
  if (state.model && !(opts && opts.skipModel)) q.set('model', state.model);
  q.set('tz_offset', new Date().getTimezoneOffset());
  if (opts && opts.params) {
    Object.entries(opts.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') q.set(key, value);
    });
  }
  const res = await fetch(`/api/${path}?${q.toString()}`);
  return res.json();
}

// ── Charts & Data Fetching ──
function initCharts() {
  charts.compare = echarts.init($('chart-compare'));
  charts.pie = echarts.init($('chart-pie'));
  charts.cost = echarts.init($('chart-cost'));
  charts.tokens = echarts.init($('chart-tokens'));
  window.addEventListener('resize', () => Object.values(charts).forEach(c => c && c.resize()));
}

function sessionQueryParams() {
  const projectInput = $('filter-project');
  return {
    page: sessionPage,
    page_size: PAGE_SIZE,
    sort: sessionSort.key,
    dir: sessionSort.dir,
    project: projectInput ? projectInput.value.trim() : ''
  };
}

function applySessionPage(data) {
  allSessions = (data && data.items) || [];
  sessionTotal = (data && data.total) || 0;
  sessionTotalPages = (data && data.total_pages) || 1;
  sessionPage = (data && data.page) || sessionPage;
  renderSessionTable();
}

async function refreshSessionsOnly() {
  if (isFetching) return;
  isFetching = true;
  $('global-loader').classList.add('loading');

  try {
    const sessions = await api('sessions-page', { params: sessionQueryParams() });
    applySessionPage(sessions);
  } finally {
    isFetching = false;
    $('global-loader').classList.remove('loading');
  }
}

function scheduleSessionRefresh() {
  if (projectFilterTimer) clearTimeout(projectFilterTimer);
  projectFilterTimer = setTimeout(() => {
    projectFilterTimer = null;
    refreshSessionsOnly();
  }, 250);
}

function pctSuffix(metric) {
  if (!metric || metric.delta_pct === undefined || metric.delta_pct === null || !isFinite(metric.delta_pct)) return '';
  const v = metric.delta_pct;
  return ` \uFF5C ${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function signedFormatted(delta, formatter) {
  const n = Number(delta) || 0;
  if (Math.abs(n) < 0.0000001) return formatter(0);
  return `${n > 0 ? '+' : '-'}${formatter(Math.abs(n))}`;
}

function formatDelta(metric, kind) {
  if (!metric) return '';
  const delta = Number(metric.delta) || 0;
  if (kind === 'cost') return `${signedFormatted(delta, fmtCost)}${pctSuffix(metric)}`;
  if (kind === 'cache') return signedFormatted(delta * 100, n => `${n.toFixed(1)}%`);
  return `${signedFormatted(Math.round(delta), fmt)}${pctSuffix(metric)}`;
}

function deltaClass(metric, kind) {
  const delta = Number(metric && metric.delta) || 0;
  if (Math.abs(delta) < 0.0000001) return 'equal';

  let magnitude;
  if (kind === 'cache') {
    magnitude = Math.abs(delta * 100);
    if (magnitude >= 20) return delta > 0 ? 'increase-3' : 'decrease-3';
    if (magnitude >= 10) return delta > 0 ? 'increase-2' : 'decrease-2';
    return delta > 0 ? 'increase-1' : 'decrease-1';
  }

  if (metric && metric.delta_pct !== undefined && metric.delta_pct !== null && isFinite(metric.delta_pct)) {
    magnitude = Math.abs(Number(metric.delta_pct) || 0);
    if (magnitude >= 50) return delta > 0 ? 'increase-3' : 'decrease-3';
    if (magnitude >= 25) return delta > 0 ? 'increase-2' : 'decrease-2';
    return delta > 0 ? 'increase-1' : 'decrease-1';
  }

  return delta > 0 ? 'increase-3' : 'decrease-3';
}

function renderStatDeltas(compare) {
  const configs = [
    ['d-tokens', compare && compare.summary && compare.summary.tokens, 'count'],
    ['d-cost', compare && compare.summary && compare.summary.cost, 'cost'],
    ['d-sessions', compare && compare.summary && compare.summary.sessions, 'count'],
    ['d-prompts', compare && compare.summary && compare.summary.prompts, 'count'],
    ['d-calls', compare && compare.summary && compare.summary.calls, 'count'],
    ['d-cache-hit', compare && compare.summary && compare.summary.cache_hit_rate, 'cache'],
  ];

  configs.forEach(([id, metric, kind]) => {
    const el = $(id);
    if (!el) return;
    if (!isCompareEnabled() || !metric) {
      el.textContent = '';
      el.className = 'delta';
      el.removeAttribute('title');
      return;
    }
    el.textContent = formatDelta(metric, kind);
    el.className = `delta ${deltaClass(metric, kind)}`;
    el.title = `${t('previousPeriod')}: ${kind === 'cost' ? fmtCost(metric.previous || 0) : kind === 'cache' ? ((metric.previous || 0) * 100).toFixed(1) + '%' : fmt(Math.round(metric.previous || 0))}`;
  });
}

function formatAPIInstant(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return value;
  return d.toLocaleString(dateLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatAPIRange(range) {
  if (!range) return '';
  return `${formatAPIInstant(range.from)} - ${formatAPIInstant(range.to)}`;
}

function renderTrendBreakdowns(data) {
  const box = $('trend-breakdowns');
  if (!box) return;
  if (!isCompareEnabled() || !data || !data.breakdowns) {
    box.innerHTML = '';
    return;
  }

  const displayName = (name, kind) => kind === 'source' && SOURCE_LABEL_KEYS[name] ? t(SOURCE_LABEL_KEYS[name]) : (name || '-');

  const renderSection = (title, items, kind) => {
    const visibleItems = (items || []).slice(0, 5);
    const maxCurrentCost = Math.max(...visibleItems.map(item => Number(item.current_cost) || 0), 0);
    const rows = visibleItems.map((item, idx) => {
      const cls = deltaClass({ delta: item.delta_cost || 0, delta_pct: item.delta_cost_pct }, 'cost');
      const share = maxCurrentCost > 0 ? Math.max(4, Math.min(100, ((Number(item.current_cost) || 0) / maxCurrentCost) * 100)) : 0;
      const name = displayName(item.name, kind);
      const deltaText = `${signedFormatted(item.delta_cost || 0, fmtCost)}${pctSuffix({ delta_pct: item.delta_cost_pct })}`;
      return `<div class="trend-breakdown-row ${cls}" style="--trend-share:${share.toFixed(1)}%;" title="${esc(item.name)}">
        <div class="trend-breakdown-main">
          <div class="trend-breakdown-identity">
            <span class="trend-breakdown-rank">${idx + 1}</span>
            <span class="trend-breakdown-name">${esc(name)}</span>
          </div>
          <span class="trend-breakdown-delta ${cls}">${deltaText}</span>
        </div>
        <div class="trend-breakdown-meta">
          <span>${t('currentPeriod')} <strong>${fmtCost(item.current_cost || 0)}</strong></span>
          <span>${t('previousPeriod')} ${fmtCost(item.previous_cost || 0)}</span>
          <span>${t('tokens')} ${fmt(item.current_tokens || 0)}</span>
          <span>${t('calls')} ${fmt(item.current_calls || 0)}</span>
        </div>
        <div class="trend-breakdown-track" aria-hidden="true"><span></span></div>
      </div>`;
    }).join('');
    return `<section class="trend-breakdown-section">
      <div class="trend-breakdown-title">${title}</div>
      ${rows || `<div class="trend-breakdown-empty">${t('noComparisonData')}</div>`}
    </section>`;
  };

  box.innerHTML = [
    renderSection(t('modelMovers'), data.breakdowns.models, 'model'),
    renderSection(t('sourceMovers'), data.breakdowns.sources, 'source')
  ].join('');
}

function renderTrendCompare(data) {
  const card = $('trend-compare-card');
  const label = $('compare-range-label');
  if (!card) return;

  if (!isCompareEnabled()) {
    card.hidden = true;
    renderStatDeltas(null);
    renderTrendBreakdowns(null);
    return;
  }

  card.hidden = false;
  const tc = getThemeColors();
  const points = (data && data.series) || [];
  const labels = points.map(p => p.label || p.previous_label || '');
  const current = points.map(p => +(((p.current && p.current.cost) || 0).toFixed(4)));
  const previous = points.map(p => +(((p.previous && p.previous.cost) || 0).toFixed(4)));
  const hasData = points.some(p => ((p.current && (p.current.tokens || p.current.cost)) || (p.previous && (p.previous.tokens || p.previous.cost))));

  if (label) {
    label.textContent = data ? `${t('previousPeriod')}: ${formatAPIRange(data.compare_range)}` : '';
  }

  charts.compare.setOption({
    ...baseOpt(),
    grid: { ...baseOpt().grid, left: 64, right: 34, top: 48, bottom: 36 },
    graphic: hasData ? { type: 'text', style: { text: '' } } : {
      type: 'text', left: 'center', top: 'center',
      style: { text: t('noComparisonData'), fill: tc.muted, fontSize: 14, fontFamily: 'inherit' }
    },
    tooltip: {
      ...baseOpt().tooltip,
      trigger: 'axis',
      formatter: params => {
        const idx = params && params.length ? params[0].dataIndex : 0;
        const p = points[idx] || {};
        const c = (p.current && p.current.cost) || 0;
        const prev = (p.previous && p.previous.cost) || 0;
        const delta = c - prev;
        return `<div style="font-weight:700;margin-bottom:6px;">${esc(p.label || '')}</div>
          <div>${esc(t('currentPeriod'))}: ${fmtCost(c)}</div>
          <div>${esc(t('previousPeriod'))}${p.previous_label ? ` (${esc(p.previous_label)})` : ''}: ${fmtCost(prev)}</div>
          <div style="margin-top:4px;color:${delta > 0 ? 'var(--delta-increase-2)' : delta < 0 ? 'var(--delta-decrease-2)' : 'var(--delta-equal)'};">${signedFormatted(delta, fmtCost)}</div>`;
      }
    },
    legend: {
      top: 0, left: 'center',
      textStyle: { color: tc.muted, fontSize: 11 },
      itemGap: 16, itemWidth: 16, itemHeight: 8
    },
    xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: tc.grid } }, axisLabel: { color: tc.muted } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: tc.grid } }, axisLabel: { color: tc.muted, formatter: v => '$' + v } },
    series: [
      { name: t('currentPeriod'), type: 'line', smooth: true, symbolSize: 5, showSymbol: labels.length <= 60, data: current, color: '#3b82f6', lineStyle: { width: 3 }, areaStyle: { opacity: 0.08 } },
      { name: t('previousPeriod'), type: 'line', smooth: true, symbolSize: 5, showSymbol: labels.length <= 60, data: previous, color: '#94a3b8', lineStyle: { width: 2, type: 'dashed' } }
    ]
  }, true);

  renderTrendBreakdowns(data);
  charts.compare.resize();
}

async function refresh() {
  if (isFetching) return;
  isFetching = true;
  $('btn-refresh').classList.add('loading');
  $('global-loader').classList.add('loading');

  try {
    const [stats, costModel, costTime, tokensTime, sessions, trendCompare] = await Promise.all([
      api('stats'),
      api('cost-by-model', {skipModel: true}),
      api('cost-over-time'),
      api('tokens-over-time'),
      api('sessions-page', { params: sessionQueryParams() }),
      isCompareEnabled() ? api('trends/compare') : Promise.resolve(null)
    ]);

    // Update model filter dropdown from cost-by-model results
    updateModelFilter(costModel || []);

    $('s-cost').textContent = fmtCost(stats.total_cost || 0);
    $('s-tokens').textContent = fmt(stats.total_tokens || 0);
    $('s-sessions').textContent = stats.total_sessions || 0;
    $('s-prompts').textContent = stats.total_prompts || 0;
    $('s-calls').textContent = fmt(stats.total_calls || 0);
    $('s-cache-hit').textContent = ((stats.cache_hit_rate || 0) * 100).toFixed(1) + '%';
    renderStatDeltas(trendCompare);

    const tc = getThemeColors();

    // Empty state helper
    const emptyGraphic = (text) => ({
      type: 'text', left: 'center', top: 'center',
      style: { text, fill: tc.muted, fontSize: 14, fontFamily: 'inherit' }
    });

    // Build global model→color mapping from costModel (sorted by cost DESC)
    // This ensures the same model always gets the same color across all charts
    const modelColorMap = {};
    (costModel || []).forEach((d, i) => { modelColorMap[d.model] = colors[i % colors.length]; });

    // Pie -> Doughnut
    const pieData = (costModel || []).filter(d => d.cost > 0).map(d => ({
      name: d.model, value: +d.cost.toFixed(4),
      itemStyle: { color: modelColorMap[d.model] }
    }));
    // Compute total for percentage in legend
    const pieTotal = pieData.reduce((s, d) => s + d.value, 0);
    charts.pie.setOption({
      ...baseOpt(),
      graphic: pieData.length === 0 ? emptyGraphic(t('noSessions')) : { type: 'text', style: { text: '' } },
      tooltip: { trigger: 'item', formatter: p => `<div style="font-weight:600;margin-bottom:4px;">${esc(p.name)}</div>${fmtCost(p.value)} (${p.percent}%)`, ...baseOpt().tooltip },
      legend: {
        type: 'scroll', top: 0, left: 'center',
        textStyle: { color: tc.muted, fontSize: 11 },
        itemGap: 12, itemWidth: 10, itemHeight: 10,
        pageTextStyle: { color: tc.muted }, pageIconColor: tc.muted,
        formatter: name => name.length > 30 ? name.slice(0, 27) + '...' : name,
        tooltip: { show: true }
      },
      series: [{
        type: 'pie', radius: ['35%', '65%'], center: ['50%', '55%'],
        itemStyle: { borderRadius: 6, borderColor: tc.bg, borderWidth: 2 },
        label: {
          show: true, position: 'outside',
          formatter: p => p.percent >= 5 ? `${p.percent}%` : '',
          color: tc.muted, fontSize: 11
        },
        labelLine: { show: true, length: 8, length2: 6 },
        labelLayout: { hideOverlap: true },
        data: pieData
      }]
    }, true);

    // Common Zoom Options
    const dataZoomOpts = [
      { type: 'inside', start: 0, end: 100 }
    ];

    renderTrendCompare(trendCompare);

    // Cost Trend
    const costDates = [...new Set((costTime || []).map(d => d.date))].sort().map(utcToLocalLabel);
    const costModels = [...new Set((costTime || []).map(d => d.model))];
    const costSeries = costModels.map(m => {
      const map = Object.fromEntries((costTime || []).filter(d => d.model === m).map(d => [utcToLocalLabel(d.date), d.value]));
      return {
        name: m,
        type: 'bar', stack: 'cost',
        barMaxWidth: 40,
        color: modelColorMap[m],
        emphasis: { focus: 'series' },
        data: costDates.map(d => +(map[d] || 0).toFixed(4))
      };
    });
    charts.cost.setOption({
      ...baseOpt(), grid: { ...baseOpt().grid, top: 50 }, dataZoom: dataZoomOpts,
      graphic: costDates.length === 0 ? emptyGraphic(t('noSessions')) : { type: 'text', style: { text: '' } },
      tooltip: {
        ...baseOpt().tooltip, trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: v => fmtCost(v)
      },
      legend: {
        type: 'scroll', top: 0, left: 'center',
        textStyle: { color: tc.muted, fontSize: 11 },
        itemGap: 12, itemWidth: 10, itemHeight: 10,
        pageTextStyle: { color: tc.muted }, pageIconColor: tc.muted,
        formatter: name => name.length > 30 ? name.slice(0, 27) + '...' : name,
        tooltip: { show: true }
      },
      xAxis: { type: 'category', data: costDates, axisLine: { lineStyle: { color: tc.grid } }, axisLabel: { color: tc.muted } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: tc.grid } }, axisLabel: { color: tc.muted, formatter: v => '$' + v } },
      series: costSeries
    }, true);

    // Token Breakdown (Bar)
    const tokenDates = (tokensTime || []).map(d => utcToLocalLabel(d.date));
    charts.tokens.setOption({
      ...baseOpt(), grid: { ...baseOpt().grid, top: 50 }, dataZoom: dataZoomOpts,
      graphic: tokenDates.length === 0 ? emptyGraphic(t('noSessions')) : { type: 'text', style: { text: '' } },
      tooltip: { ...baseOpt().tooltip, axisPointer: { type: 'shadow' } },
      legend: {
        type: 'scroll', top: 0, left: 'center',
        textStyle: { color: tc.muted, fontSize: 11 },
        itemGap: 12, itemWidth: 10, itemHeight: 10,
        pageTextStyle: { color: tc.muted }, pageIconColor: tc.muted
      },
      xAxis: { type: 'category', data: tokenDates, axisLine: { lineStyle: { color: tc.grid } }, axisLabel: { color: tc.muted } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: tc.grid } }, axisLabel: { color: tc.muted, formatter: v => fmt(v) } },
      series: [
        // [重构]: 将折线图全部改为同轴堆叠柱状图，直观展示 Token 总吞吐量与占比，彻底消除量级碾压遮挡
        { name: t('input'), type: 'bar', stack: 'Tokens', data: (tokensTime || []).map(d => d.input_tokens), color: '#3b82f6', barMaxWidth: 40 },
        { name: t('output'), type: 'bar', stack: 'Tokens', data: (tokensTime || []).map(d => d.output_tokens), color: '#22c55e' },
        { name: t('cacheRead'), type: 'bar', stack: 'Tokens', data: (tokensTime || []).map(d => d.cache_read), color: '#8b5cf6' },
        { name: t('cacheCreate'), type: 'bar', stack: 'Tokens', data: (tokensTime || []).map(d => d.cache_create), color: '#f59e0b' }
      ]
    }, true);

    applySessionPage(sessions);

  } finally {
    isFetching = false;
    $('btn-refresh').classList.remove('loading');
    $('global-loader').classList.remove('loading');
  }
}

// ── Time Formatting ──
function relTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts.replace(' ', 'T').replace(' +0000 UTC', 'Z'));
  if (isNaN(d)) return ts.replace('T', ' ').slice(0, 16);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return t('justNow');
  if (diff < 3600) return Math.floor(diff / 60) + t('mAgo');
  if (diff < 86400) return Math.floor(diff / 3600) + t('hAgo');
  if (diff < 604800) return Math.floor(diff / 86400) + t('dAgo');
  return d.toLocaleDateString();
}

function fmtLocalTime(ts) {
  if (!ts) return '';
  const d = new Date(ts.replace(' ', 'T').replace(' +0000 UTC', 'Z'));
  if (isNaN(d)) return ts;
  return d.toLocaleString();
}

// ── Session Table Logic ──
function renderSessionTable() {
  const page = allSessions;
  const totalPages = Math.max(1, sessionTotalPages || 1);
  const total = sessionTotal || 0;
  if (sessionPage > totalPages) sessionPage = totalPages;
  const start = (sessionPage - 1) * PAGE_SIZE;
  const visibleStart = total > 0 ? start + 1 : 0;
  const visibleEnd = Math.min(start + page.length, total);
  const k = sessionSort.key;

  // Update headers
  document.querySelectorAll('.sortable').forEach(th => {
    th.classList.remove('asc', 'desc');
    let arrow = th.querySelector('.sort-arrow');
    if (!arrow) { arrow = document.createElement('span'); arrow.className = 'sort-arrow'; th.appendChild(arrow); }
    if (th.dataset.sort === k) { th.classList.add(sessionSort.dir); arrow.textContent = sessionSort.dir === 'asc' ? '\u25B2' : '\u25BC'; }
    else { arrow.textContent = '\u25B4'; }
  });

  const tb = $('session-table');
  if (page.length === 0) {
    tb.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:40px;">${t('noSessions')}</td></tr>`;
  } else {
    // Render only main rows to prevent flicker
    tb.innerHTML = page.map(s => {
      const isExpanded = expandedSessions.has(s.session_id);
      return `<tr class="session-row${isExpanded ? ' expanded' : ''}" data-sid="${esc(s.session_id)}">
        <td><span class="badge ${esc(s.source)}">${esc(s.source)}</span></td>
        <td title="${esc(s.cwd)}">${esc(s.project || s.cwd || '-')}</td>
        <td>${esc(s.git_branch || '-')}</td>
        <td title="${esc(fmtLocalTime(s.start_time))}">${relTime(s.start_time)}</td>
        <td>${s.prompts}</td><td>${fmt(s.tokens || 0)}</td><td style="font-weight:500;color:var(--green)">${fmtCost(s.total_cost || 0)}</td>
        <td>
          <button class="expand-btn ${isExpanded ? 'open' : ''}" data-sid="${esc(s.session_id)}">
            <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
          </button>
        </td>
      </tr>`;
    }).join('');

    // Re-attach already expanded details
    page.forEach(s => { if (expandedSessions.has(s.session_id)) fetchAndInjectDetail(s.session_id, true); });
  }

  // Pagination UI
  const pag = $('pagination');
  if (totalPages <= 1) {
    pag.innerHTML = total > 0 ? `<span class="page-info">${total} total</span>` : '';
  } else {
    let html = `<span class="page-info">${visibleStart}-${visibleEnd} of ${total}</span>`;
    html += `<button class="page-btn" data-page="${sessionPage - 1}" ${sessionPage === 1 ? 'disabled' : ''}>&larr;</button>`;
    const pStart = Math.max(1, Math.min(sessionPage - 2, totalPages - 4)), pEnd = Math.min(totalPages, pStart + 4);
    for (let i = pStart; i <= pEnd; i++) html += `<button class="page-btn ${i === sessionPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    html += `<button class="page-btn" data-page="${sessionPage + 1}" ${sessionPage === totalPages ? 'disabled' : ''}>&rarr;</button>`;
    pag.innerHTML = html;
  }
}

// ── DOM-based Row Expansion (No full render) ──
document.addEventListener('click', e => {
  const rangeWrap = $('range-control-wrap');
  if (datePicker.open && rangeWrap && !eventIncludesElement(e, rangeWrap)) {
    closeDatePicker();
  }
  if (!e.target.closest('.custom-select-wrap')) {
    closeCustomSelects();
  }

  const expandBtn = e.target.closest('.expand-btn');
  if (expandBtn) {
    const sid = expandBtn.dataset.sid;
    const sessionRow = expandBtn.closest('.session-row');
    if (expandedSessions.has(sid)) {
      expandedSessions.delete(sid);
      expandBtn.classList.remove('open');
      if (sessionRow) sessionRow.classList.remove('expanded');
      const detailRow = document.getElementById(`detail-row-${sid}`);
      if (detailRow) {
        detailRow.classList.remove('show');
        setTimeout(() => detailRow.remove(), 300); // Wait for transition
      }
    } else {
      expandedSessions.add(sid);
      expandBtn.classList.add('open');
      if (sessionRow) sessionRow.classList.add('expanded');
      fetchAndInjectDetail(sid);
    }
  }

  const pageBtn = e.target.closest('.page-btn:not(:disabled)');
  if (pageBtn && !pageBtn.classList.contains('active')) {
    sessionPage = parseInt(pageBtn.dataset.page);
    refreshSessionsOnly();
  }
});

async function fetchAndInjectDetail(sid, isRestore = false) {
  const tr = document.querySelector(`.session-row[data-sid="${sid}"]`);
  if (!tr) return;

  if (!isRestore) {
    tr.insertAdjacentHTML('afterend', `
      <tr class="detail-row" id="detail-row-${sid}">
        <td colspan="8">
          <div class="detail-content" id="detail-content-${sid}">
             <div style="color:var(--muted);font-size:12px;">Loading details...</div>
          </div>
        </td>
      </tr>
    `);
    setTimeout(() => document.getElementById(`detail-row-${sid}`).classList.add('show'), 10);
  }

  try {
    const res = await fetch(`/api/session-detail?session_id=${encodeURIComponent(sid)}`);
    const data = await res.json();
    const contentBox = document.getElementById(`detail-content-${sid}`);
    if (!contentBox) return;

    if (!data || data.length === 0) {
      contentBox.innerHTML = `<div style="color:var(--muted);font-size:13px;">No detailed model breakdown.</div>`;
      return;
    }

    contentBox.innerHTML = `
      <table class="detail-table">
        <colgroup><col style="width:28%"><col style="width:10%"><col style="width:12%"><col style="width:12%"><col style="width:14%"><col style="width:14%"><col style="width:10%"></colgroup>
        <thead>
          <tr><th>${t('model')}</th><th>${t('calls')}</th><th>${t('input')}</th><th>${t('output')}</th>
          <th>${t('cacheRead')}</th><th>${t('cacheCreate')}</th><th>${t('cost')}</th></tr>
        </thead>
        <tbody>
          ${data.map(d => `<tr>
            <td>${esc(d.model)}</td><td>${d.calls}</td><td>${fmt(d.input_tokens)}</td><td>${fmt(d.output_tokens)}</td>
            <td>${fmt(d.cache_read)}</td><td>${fmt(d.cache_create)}</td><td>${fmtCost(d.cost_usd)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    const el = document.getElementById(`detail-content-${sid}`);
    if (el) el.innerHTML = `<div style="color:#ef4444;">Failed to load details.</div>`;
  }
}

// ── Date Range Picker ──
function selectedDraftRange() {
  const committed = getTimeRange();
  if (datePicker.open && isDateValue(datePicker.draftFrom)) {
    if (isDateValue(datePicker.draftTo)) {
      return normalizeRange(datePicker.draftFrom, datePicker.draftTo);
    }
    return { from: datePicker.draftFrom, to: datePicker.draftFrom };
  }
  return committed;
}

function rangeDisplayLabel(range) {
  const shortcut = matchingShortcutForRange(range);
  return shortcut ? t(shortcut) : formatRangeLabel(range.from, range.to);
}

function renderRangeTrigger() {
  const trigger = $('date-range-trigger');
  const label = $('date-range-label');
  if (!trigger || !label) return;

  const range = selectedDraftRange();
  const labelText = rangeDisplayLabel(range);
  label.textContent = labelText;
  trigger.classList.toggle('open', datePicker.open);
  trigger.setAttribute('aria-expanded', datePicker.open ? 'true' : 'false');
  trigger.setAttribute('aria-label', `${t('dateRange')}: ${labelText}`);
}

function renderDateShortcuts() {
  const box = $('date-shortcuts');
  if (!box) return;

  const range = selectedDraftRange();
  box.innerHTML = RANGE_SHORTCUTS.map(p => {
    const active = sameRange(range, rangeForPreset(p));
    return `<button type="button" class="date-shortcut-btn ${active ? 'active' : ''}" data-preset="${p}" aria-pressed="${active ? 'true' : 'false'}">${t(p)}</button>`;
  }).join('');
}

function dateLocale() {
  return state.lang === 'zh' ? 'zh-CN' : 'en-US';
}

function formatDateLabel(value) {
  const d = parseLocalDate(value);
  if (!d) return value || '';
  return d.toLocaleDateString(dateLocale(), { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatMonthLabel(d) {
  return d.toLocaleDateString(dateLocale(), { year: 'numeric', month: 'long' });
}

function formatRangeLabel(from, to) {
  if (from === to) return formatDateLabel(from);
  if (state.lang === 'zh') return `${formatDateLabel(from)}${t('to')}${formatDateLabel(to)}`;
  return `${formatDateLabel(from)} ${t('to')} ${formatDateLabel(to)}`;
}

function committedCustomRange() {
  return getTimeRange();
}

function orderedDates(a, b) {
  return a <= b ? [a, b] : [b, a];
}

function calendarDayClasses(value, isOutsideMonth) {
  const classes = ['day-btn'];
  const today = localDateStr(new Date());
  const from = isDateValue(datePicker.draftFrom) ? datePicker.draftFrom : '';
  const to = isDateValue(datePicker.draftTo) ? datePicker.draftTo : '';

  if (isOutsideMonth) classes.push('outside');
  if (value === today) classes.push('today');

  if (from && datePicker.selectingEnd && isDateValue(datePicker.hoverDate)) {
    const [start, end] = orderedDates(from, datePicker.hoverDate);
    if (value >= start && value <= end) classes.push('range-preview');
    if (start === end && value === start) classes.push('single-day');
    else {
      if (value === start) classes.push('range-start');
      if (value === end) classes.push('range-end');
    }
  } else if (from && to) {
    const [start, end] = orderedDates(from, to);
    if (value >= start && value <= end) classes.push('in-range');
    if (start === end && value === start) classes.push('single-day');
    else {
      if (value === start) classes.push('range-start');
      if (value === end) classes.push('range-end');
    }
  } else if (from && value === from) {
    classes.push('single-day');
  }

  return classes.join(' ');
}

function renderCalendarMonth(month) {
  const weekdays = state.lang === 'zh'
    ? ['一', '二', '三', '四', '五', '六', '日']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -offset);
  let days = '';

  for (let i = 0; i < 42; i++) {
    const day = addDays(gridStart, i);
    const value = localDateStr(day);
    const label = formatDateLabel(value);
    days += `<button type="button" class="${calendarDayClasses(value, day.getMonth() !== month.getMonth())}" data-date="${value}" aria-label="${esc(label)}" title="${value}">${day.getDate()}</button>`;
  }

  return `
    <section class="calendar-month">
      <div class="calendar-month-title">${esc(formatMonthLabel(month))}</div>
      <div class="weekday-row">${weekdays.map(w => `<div class="weekday">${w}</div>`).join('')}</div>
      <div class="day-grid">${days}</div>
    </section>
  `;
}

function renderDatePicker() {
  const popover = $('date-range-popover');
  const grid = $('calendar-grid');
  if (!popover) return;

  renderRangeTrigger();
  renderDateShortcuts();
  popover.classList.toggle('open', datePicker.open);
  popover.setAttribute('aria-label', t('dateRange'));
  popover.hidden = !datePicker.open;
  if (datePicker.open) {
    popover.removeAttribute('inert');
    popover.removeAttribute('aria-hidden');
  } else {
    popover.setAttribute('inert', '');
    popover.setAttribute('aria-hidden', 'true');
  }
  $('calendar-prev').setAttribute('aria-label', t('previousMonth'));
  $('calendar-next').setAttribute('aria-label', t('nextMonth'));

  if (!datePicker.open) return;

  const committed = committedCustomRange();
  const draftFrom = isDateValue(datePicker.draftFrom) ? datePicker.draftFrom : committed.from;

  if (!datePicker.viewMonth) {
    datePicker.viewMonth = firstOfMonth(parseLocalDate(draftFrom));
  }
  const nextMonth = addMonths(datePicker.viewMonth, 1);
  $('calendar-title').textContent = `${formatMonthLabel(datePicker.viewMonth)} - ${formatMonthLabel(nextMonth)}`;
  if (grid) grid.innerHTML = [datePicker.viewMonth, nextMonth].map(renderCalendarMonth).join('');
}

function openDatePicker() {
  const range = getTimeRange();
  datePicker.open = true;
  datePicker.viewMonth = firstOfMonth(parseLocalDate(range.from));
  datePicker.draftFrom = range.from;
  datePicker.draftTo = range.to;
  datePicker.selectingEnd = false;
  datePicker.hoverDate = '';
  renderDatePicker();
}

function closeDatePicker() {
  datePicker.open = false;
  datePicker.selectingEnd = false;
  datePicker.hoverDate = '';
  renderDatePicker();
}

function commitCustomRange(from, to, opts = {}) {
  const range = normalizeRange(from, to || from);
  persist('preset', matchingPresetForRange(range));
  storeRange(range);
  setPickerDraft(range, { alignView: opts.alignView });
  if (opts.close) datePicker.open = false;
  buildControls();
  if (opts.refresh !== false) {
    sessionPage = 1;
    refresh();
    applyAutoRefresh();
  }
}

function selectCalendarDate(value, isDoubleClick = false) {
  if (!isDateValue(value)) return;
  if (isDoubleClick) {
    commitCustomRange(value, value, { close: true });
    return;
  }

  if (!datePicker.selectingEnd || !isDateValue(datePicker.draftFrom)) {
    datePicker.draftFrom = value;
    datePicker.draftTo = '';
    datePicker.selectingEnd = true;
    datePicker.hoverDate = '';
    renderDatePicker();
    return;
  }

  commitCustomRange(datePicker.draftFrom, value, { close: true });
}

// ── Auto Refresh ──
function applyAutoRefresh() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  const btn = $('btn-auto-refresh');
  $('auto-status').textContent = state.autoRefresh ? t('autoOn') : t('autoOff');
  btn.className = 'ctrl-btn ' + (state.autoRefresh ? 'active' : '');
  if (state.autoRefresh) {
    autoTimer = setInterval(refresh, state.refreshInterval * 1000);
  }
}

function renderCompareModeControl() {
  const card = $('trend-compare-card');
  if (card) card.hidden = !isCompareEnabled();
  const modeSelect = $('sel-compare-mode');
  if (!modeSelect) return;
  modeSelect.value = state.compareMode;
  syncCustomSelect(modeSelect);
}

function measureSelectText(select, text) {
  const canvas = measureSelectText.canvas || (measureSelectText.canvas = document.createElement('canvas'));
  const ctx = canvas.getContext('2d');
  const wrap = select && select.closest('.custom-select-wrap');
  const trigger = wrap && wrap.querySelector('.custom-select-trigger');
  const cs = getComputedStyle(trigger || document.body);
  ctx.font = `${cs.fontWeight || 500} ${cs.fontSize || '13px'} ${cs.fontFamily || 'sans-serif'}`;
  return ctx.measureText(text || '').width;
}

function updateModelSelectWidth() {
  const select = $('filter-model');
  if (!select) return;
  const wrap = select.closest('.custom-select-wrap');
  if (!wrap) return;
  const maxTextWidth = Array.from(select.options).reduce((max, option) => {
    return Math.max(max, measureSelectText(select, option.textContent || ''));
  }, 0);
  const width = Math.min(260, Math.max(124, Math.ceil(maxTextWidth + 48)));
  wrap.style.setProperty('--model-select-width', `${width}px`);
}

// ── Custom Selects ──
function customSelectLabel(select) {
  const selected = select.options[select.selectedIndex];
  return selected ? selected.textContent : '';
}

function selectedOptionIndex(select) {
  return Math.max(0, Array.from(select.options).findIndex(o => o.value === select.value));
}

function setCustomSelectOpen(item, open) {
  item.wrap.classList.toggle('open', open);
  item.button.setAttribute('aria-expanded', open ? 'true' : 'false');
  item.menu.hidden = !open;
  if (open) {
    item.activeIndex = selectedOptionIndex(item.select);
    syncCustomSelect(item.select);
    const active = item.menu.querySelector('.custom-select-option.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }
}

function closeCustomSelects(exceptId = '') {
  customSelects.forEach((item, id) => {
    if (id !== exceptId) setCustomSelectOpen(item, false);
  });
}

function commitCustomSelectValue(select, value) {
  if (select.value === value) {
    closeCustomSelects();
    return;
  }
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  closeCustomSelects();
}

function syncCustomSelect(select) {
  const item = customSelects.get(select.id);
  if (!item) return;

  const options = Array.from(select.options);
  const selectedIndex = selectedOptionIndex(select);
  item.value.textContent = customSelectLabel(select);
  item.button.title = customSelectLabel(select);
  item.button.setAttribute('aria-label', select.title || customSelectLabel(select));
  if (!item.wrap.classList.contains('open')) item.activeIndex = selectedIndex;
  item.activeIndex = Math.min(Math.max(item.activeIndex, 0), Math.max(options.length - 1, 0));

  item.menu.innerHTML = options.map((option, index) => {
    const selected = option.value === select.value;
    const active = index === item.activeIndex;
    return `<button type="button" class="custom-select-option${selected ? ' selected' : ''}${active ? ' active' : ''}" role="option" aria-selected="${selected ? 'true' : 'false'}" data-value="${esc(option.value)}">
      <span class="custom-select-option-label">${esc(option.textContent)}</span>
      <svg class="custom-select-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m20 6-11 11-5-5"></path></svg>
    </button>`;
  }).join('');
}

function moveCustomSelectActive(item, delta) {
  const count = item.select.options.length;
  if (!count) return;
  item.activeIndex = (item.activeIndex + delta + count) % count;
  syncCustomSelect(item.select);
  const active = item.menu.querySelector('.custom-select-option.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function enhanceSelect(select) {
  if (!select || customSelects.has(select.id)) return;

  select.classList.add('enhanced-native-select');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  const wrap = document.createElement('div');
  wrap.className = 'custom-select-wrap';
  wrap.dataset.selectId = select.id;
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'custom-select-trigger';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = `<span class="custom-select-value"></span><svg class="custom-select-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>`;

  const menu = document.createElement('div');
  menu.className = 'custom-select-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;

  wrap.appendChild(button);
  wrap.appendChild(menu);

  const item = { select, wrap, button, menu, value: button.querySelector('.custom-select-value'), activeIndex: selectedOptionIndex(select) };
  customSelects.set(select.id, item);

  button.addEventListener('click', e => {
    e.stopPropagation();
    const nextOpen = !wrap.classList.contains('open');
    closeCustomSelects(select.id);
    setCustomSelectOpen(item, nextOpen);
  });

  button.addEventListener('keydown', e => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(e.key)) e.preventDefault();
    if (!wrap.classList.contains('open') && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      closeCustomSelects(select.id);
      setCustomSelectOpen(item, true);
      return;
    }
    if (e.key === 'ArrowDown') moveCustomSelectActive(item, 1);
    if (e.key === 'ArrowUp') moveCustomSelectActive(item, -1);
    if (e.key === 'Home') { item.activeIndex = 0; syncCustomSelect(select); }
    if (e.key === 'End') { item.activeIndex = select.options.length - 1; syncCustomSelect(select); }
    if ((e.key === 'Enter' || e.key === ' ') && wrap.classList.contains('open')) {
      const option = select.options[item.activeIndex];
      if (option) commitCustomSelectValue(select, option.value);
    }
    if (e.key === 'Escape') setCustomSelectOpen(item, false);
  });

  menu.addEventListener('click', e => {
    const option = e.target.closest('.custom-select-option');
    if (!option) return;
    commitCustomSelectValue(select, option.dataset.value);
    button.focus();
  });

  menu.addEventListener('mousemove', e => {
    const option = e.target.closest('.custom-select-option');
    if (!option) return;
    const buttons = Array.from(menu.querySelectorAll('.custom-select-option'));
    const index = buttons.indexOf(option);
    if (index >= 0 && index !== item.activeIndex) {
      item.activeIndex = index;
      syncCustomSelect(select);
    }
  });

  select.addEventListener('change', () => syncCustomSelect(select));
  syncCustomSelect(select);
}

function enhanceSelects() {
  ENHANCED_SELECT_IDS.forEach(id => enhanceSelect($(id)));
}

function syncCustomSelects() {
  customSelects.forEach(item => syncCustomSelect(item.select));
}

function normalizeDateState() {
  if (!PRESETS.includes(state.preset)) persist('preset', 'today');
  if (!COMPARE_MODES.includes(state.compareMode)) persist('compareMode', 'elapsed');

  let range = getTimeRange();
  if (state.preset === 'custom') {
    persist('preset', matchingPresetForRange(range));
    range = getTimeRange();
  }

  if (state.preset !== 'custom' || !isDateValue(state.customFrom) || !isDateValue(state.customTo)) {
    storeRange(range);
  }
  if (!datePicker.open) {
    setPickerDraft(range);
  }
}

// ── Init Setup ──
function buildControls() {
  normalizeDateState();
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));

  const buildOpts = (arr, val, labelFn) => arr.map(v => `<option value="${v}" ${val === v ? 'selected' : ''}>${labelFn(v)}</option>`).join('');

  $('sel-theme').innerHTML = buildOpts(['system', 'light', 'dark'], state.theme, t);
  $('sel-lang').innerHTML = `<option value="en" ${state.lang === 'en' ? 'selected' : ''}>EN</option><option value="zh" ${state.lang === 'zh' ? 'selected' : ''}>ZH</option>`;
  $('sel-granularity').innerHTML = buildOpts(GRANULARITIES, state.granularity, v => t('gran_' + v));
  $('sel-compare-mode').innerHTML = buildOpts(COMPARE_MODES, state.compareMode, v => t('compare_' + v));
  $('sel-refresh-interval').innerHTML = buildOpts(REFRESH_INTERVALS, state.refreshInterval, v => v >= 60 ? (v / 60) + ' ' + t('unitMin') : v + ' ' + t('unitSec'));

  const SOURCES = [['', 'allSources'], ['claude', 'claudeCode'], ['codex', 'codex'], ['openclaw', 'openClaw'], ['opencode', 'openCode'], ['kiro', 'kiro'], ['pi', 'pi']];
  $('filter-source').innerHTML = SOURCES.map(([v, k]) => `<option value="${v}" ${state.source === v ? 'selected' : ''}>${t(k)}</option>`).join('');

  renderDatePicker();
  renderCompareModeControl();
  $('filter-project').placeholder = t('filterProject');
  syncCustomSelects();
  updateModelSelectWidth();
}

// ── Events Binding ──
$('sel-theme').onchange = e => { persist('theme', e.target.value); applyTheme(); };
$('sel-lang').onchange = e => { persist('lang', e.target.value); buildControls(); refresh(); applyAutoRefresh(); };
$('sel-granularity').onchange = e => { persist('granularity', e.target.value); refresh(); };
$('sel-compare-mode').onchange = e => {
  persist('compareMode', e.target.value);
  localStorage.setItem('au-compareEnabled', isCompareEnabled() ? 'true' : 'false');
  renderCompareModeControl();
  if (!isCompareEnabled()) {
    renderStatDeltas(null);
    renderTrendBreakdowns(null);
  }
  refresh();
};
$('sel-refresh-interval').onchange = e => { persist('refreshInterval', parseInt(e.target.value)); applyAutoRefresh(); };

$('date-range-trigger').onclick = e => {
  e.stopPropagation();
  datePicker.open ? closeDatePicker() : openDatePicker();
};
$('date-shortcuts').onclick = e => {
  const btn = e.target.closest('.date-shortcut-btn');
  if (!btn) return;
  setPreset(btn.dataset.preset, { closePicker: false });
};
$('calendar-prev').onclick = () => {
  datePicker.viewMonth = addMonths(datePicker.viewMonth || firstOfMonth(parseLocalDate(committedCustomRange().from)), -1);
  renderDatePicker();
};
$('calendar-next').onclick = () => {
  datePicker.viewMonth = addMonths(datePicker.viewMonth || firstOfMonth(parseLocalDate(committedCustomRange().from)), 1);
  renderDatePicker();
};
$('calendar-apply').onclick = () => {
  const fallback = localDateStr(new Date());
  const from = datePicker.draftFrom || committedCustomRange().from || fallback;
  const to = datePicker.draftTo || from;
  commitCustomRange(from, to, { close: true });
};
$('calendar-grid').onclick = e => {
  const btn = e.target.closest('.day-btn');
  if (!btn) return;
  selectCalendarDate(btn.dataset.date, e.detail >= 2);
};
$('calendar-grid').onmouseover = e => {
  const btn = e.target.closest('.day-btn');
  if (!btn || !datePicker.selectingEnd || !datePicker.draftFrom) return;
  if (datePicker.hoverDate === btn.dataset.date) return;
  datePicker.hoverDate = btn.dataset.date;
  renderDatePicker();
};
$('calendar-grid').onmouseleave = () => {
  if (!datePicker.hoverDate) return;
  datePicker.hoverDate = '';
  renderDatePicker();
};

$('btn-refresh').onclick = () => { refresh(); applyAutoRefresh(); };
$('btn-auto-refresh').onclick = () => { persist('autoRefresh', !state.autoRefresh); applyAutoRefresh(); };
$('filter-source').onchange = e => { persist('source', e.target.value); persist('model', ''); sessionPage = 1; refresh(); };
$('filter-model').onchange = e => { persist('model', e.target.value); sessionPage = 1; refresh(); };
$('filter-project').oninput = () => { sessionPage = 1; scheduleSessionRefresh(); };

function updateModelFilter(costModel) {
  const models = costModel.map(d => d.model).filter(Boolean);
  const sel = $('filter-model');
  const prev = state.model;
  if (prev && !models.includes(prev)) { persist('model', ''); }
  sel.innerHTML = `<option value="">All Models</option>` + models.map(m =>
    `<option value="${esc(m)}" ${state.model === m ? 'selected' : ''}>${esc(m)}</option>`
  ).join('');
  syncCustomSelect(sel);
  updateModelSelectWidth();
}

document.querySelectorAll('.sortable').forEach(th => {
  th.onclick = () => {
    const k = th.dataset.sort;
    if (sessionSort.key === k) sessionSort.dir = sessionSort.dir === 'asc' ? 'desc' : 'asc';
    else { sessionSort.key = k; sessionSort.dir = ['start_time', 'total_cost', 'tokens', 'prompts'].includes(k) ? 'desc' : 'asc'; }
    sessionPage = 1;
    refreshSessionsOnly();
  };
});

window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', () => { if (state.theme === 'system') applyTheme(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && datePicker.open) {
    closeDatePicker();
  }
  if (e.key === 'Escape') {
    closeCustomSelects();
  }
});

// Bootstrap
applyTheme();
initCharts();
enhanceSelects();
buildControls();
applyAutoRefresh();
refresh();
