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
    compare: 'Compare', compare_off: 'Compare Off', compare_elapsed: 'Same Progress', compare_full: 'Full Previous', currentPeriod: 'Current', previousPeriod: 'Previous', modelMovers: 'Model Changes', sourceMovers: 'Source Changes', topFive: 'Top 5', noComparisonData: 'No comparison data.',
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
    apply: 'Apply', previousMonth: 'Previous month', nextMonth: 'Next month', dateRange: 'Date range',
    pricingKicker: 'Pricing', pricingTitle: 'Model Prices', syncPrices: 'Sync Prices', backToDashboard: 'Dashboard',
    manualPrice: 'Manual Price', inputPrice: 'Input ($/1M)', outputPrice: 'Output ($/1M)', cacheReadPrice: 'Cache Read ($/1M)', cacheCreatePrice: 'Cache Write ($/1M)', note: 'Note', cancel: 'Cancel', savePrice: 'Save Price',
    missingPrices: 'Missing Prices', manualOverrides: 'Manual Overrides', setPrice: 'Set Price', edit: 'Edit', delete: 'Delete', noMissingPrices: 'No missing model prices.', noOverrides: 'No manual overrides.',
    sourceURL: 'Source URL', cachePath: 'Cache File', lastSync: 'Last Sync', lastDownload: 'Last Download', status: 'Status', never: 'Never', ok: 'OK', syncedModels: 'Synced Models', missing: 'Missing', overrides: 'Overrides', saved: 'Saved', syncFailed: 'Sync failed', saveFailed: 'Save failed', deleteFailed: 'Delete failed'
  },
  zh: {
    title: '使用分析', to: '至', totalCost: '总费用', totalTokens: '总 Tokens',
    sessions: '会话数', prompts: 'Prompt 数', apiCalls: 'API 调用数', cacheHitRate: '缓存命中率', costByModel: '模型费用占比', costOverTime: '费用趋势',
    compare: '对比', compare_off: '关闭对比', compare_elapsed: '相同进度', compare_full: '完整上期', currentPeriod: '当前周期', previousPeriod: '上一周期', modelMovers: '模型变化', sourceMovers: '来源变化', topFive: 'TOP 5', noComparisonData: '暂无对比数据。',
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
    apply: '应用', previousMonth: '上个月', nextMonth: '下个月', dateRange: '日期范围',
    pricingKicker: '价格', pricingTitle: '模型价格', syncPrices: '同步价格', backToDashboard: '仪表盘',
    manualPrice: '手动价格', inputPrice: '输入', outputPrice: '输出', cacheReadPrice: '缓存读取', cacheCreatePrice: '缓存写入', note: '备注', cancel: '取消', savePrice: '保存价格',
    missingPrices: '缺失价格', manualOverrides: '手动覆盖', setPrice: '设置价格', edit: '编辑', delete: '删除', noMissingPrices: '暂无缺失价格的模型。', noOverrides: '暂无手动覆盖。',
    sourceURL: '来源地址', cachePath: '缓存文件', lastSync: '最近同步', lastDownload: '最近下载', status: '状态', never: '从未', ok: '正常', syncedModels: '已同步模型', missing: '缺失', overrides: '覆盖', saved: '已保存', syncFailed: '同步失败', saveFailed: '保存失败', deleteFailed: '删除失败'
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
const COMPARE_REGION_ANIMATION_MS = 340;
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
let trendCompareHideTimer = null;
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

