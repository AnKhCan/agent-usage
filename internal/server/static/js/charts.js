// ── Charts & Data Fetching ──
function initCharts() {
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

const TREND_COST_EPSILON = 0.0000001;

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
    const cls = deltaClass(metric, kind);
    el.textContent = cls === 'equal' ? '-' : formatDelta(metric, kind);
    el.className = `delta ${cls}`;
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

function renderTrendCompareContext(data) {
  const chips = document.querySelectorAll('[data-trend-compare-context]');
  if (!chips.length) return;
  if (!isCompareEnabled() || !data) {
    chips.forEach(chip => {
      chip.hidden = true;
      const label = chip.querySelector('.trend-compare-chip-label');
      if (label) label.textContent = '';
      chip.removeAttribute('data-tooltip');
      chip.removeAttribute('aria-label');
    });
    return;
  }

  const mode = data.compare_mode || state.compareMode || 'elapsed';
  const modeLabel = t('compare_' + mode);
  const rangeLabel = formatAPIRange(data.compare_range);
  const detail = rangeLabel ? `${t('previousPeriod')}: ${rangeLabel}` : '';
  chips.forEach(chip => {
    let label = chip.querySelector('.trend-compare-chip-label');
    if (!label) {
      label = document.createElement('span');
      label.className = 'trend-compare-chip-label';
      chip.appendChild(label);
    }
    label.textContent = modeLabel;
    if (detail) {
      chip.dataset.tooltip = detail;
      chip.setAttribute('aria-label', `${modeLabel}, ${detail}`);
    } else {
      chip.removeAttribute('data-tooltip');
      chip.setAttribute('aria-label', modeLabel);
    }
    chip.hidden = false;
  });
}

function niceCostCeil(value) {
  const n = Math.abs(Number(value) || 0);
  if (n < TREND_COST_EPSILON) return 0;
  const base = Math.pow(10, Math.floor(Math.log10(n)));
  const fraction = n / base;
  if (fraction <= 1) return base;
  if (fraction <= 2) return 2 * base;
  if (fraction <= 5) return 5 * base;
  return 10 * base;
}

function trendDeltaCostAbs(item) {
  return Math.abs(Number(item && item.delta_cost) || 0);
}

function setTrendScaleChip(kind, scale) {
  const chip = document.querySelector(`[data-trend-scale="${kind}"]`);
  if (!chip) return;
  const label = chip.querySelector('.trend-compare-chip-label');
  if (!isCompareEnabled() || !scale) {
    chip.hidden = true;
    if (label) label.textContent = '';
    chip.removeAttribute('data-tooltip');
    chip.removeAttribute('aria-label');
    return;
  }

  const scaleText = fmtCost(scale);
  if (label) label.textContent = `${t('scaleUpper')} ${scaleText}`;
  const tooltip = t('scaleTooltip').replace('{cost}', scaleText);
  chip.dataset.tooltip = tooltip;
  chip.setAttribute('aria-label', `${t('scaleUpper')} ${scaleText}, ${tooltip}`);
  chip.hidden = false;
}

function hideTrendScaleChips() {
  document.querySelectorAll('[data-trend-scale]').forEach(chip => {
    chip.hidden = true;
    const label = chip.querySelector('.trend-compare-chip-label');
    if (label) label.textContent = '';
    chip.removeAttribute('data-tooltip');
    chip.removeAttribute('aria-label');
  });
}

function renderTrendBreakdowns(data) {
  const modelBox = $('trend-model-breakdown');
  const sourceBox = $('trend-source-breakdown');
  if (!modelBox || !sourceBox) return;
  if (!isCompareEnabled() || !data || !data.breakdowns) {
    modelBox.innerHTML = '';
    sourceBox.innerHTML = '';
    hideTrendScaleChips();
    return;
  }

  const displayName = (name, kind) => kind === 'source' && SOURCE_LABEL_KEYS[name] ? t(SOURCE_LABEL_KEYS[name]) : (name || '-');

  const renderList = (items, kind) => {
    const visibleItems = (items || []).filter(item => trendDeltaCostAbs(item) >= TREND_COST_EPSILON).slice(0, 5);
    const avgDeltaCost = visibleItems.length > 0
      ? visibleItems.reduce((sum, item) => sum + trendDeltaCostAbs(item), 0) / visibleItems.length
      : 0;
    const scale = niceCostCeil(avgDeltaCost * 2);
    setTrendScaleChip(kind, scale);
    if (visibleItems.length === 0) return `<div class="trend-breakdown-empty">${esc(t('noComparisonData'))}</div>`;
    const rows = visibleItems.map((item, idx) => {
      const deltaCost = Number(item.delta_cost) || 0;
      const cls = deltaClass({ delta: deltaCost, delta_pct: item.delta_cost_pct }, 'cost');
      const changeRatio = scale > 0 ? Math.min(1, trendDeltaCostAbs(item) / scale) : 0;
      const changeWidth = (changeRatio * 50).toFixed(1);
      const name = displayName(item.name, kind);
      const deltaText = `${signedFormatted(deltaCost, fmtCost)}${pctSuffix({ delta_pct: item.delta_cost_pct })}`;
      const currentDetail = `${fmt(item.current_tokens || 0)} ${t('tokens')} | ${fmt(item.current_calls || 0)} ${t('calls')}`;
      const previousDetail = `${fmt(item.previous_tokens || 0)} ${t('tokens')} | ${fmt(item.previous_calls || 0)} ${t('calls')}`;
      return `<div class="trend-breakdown-row ${cls}" style="--trend-change-width:${changeWidth}%;--row-index:${idx};" title="${esc(item.name)}">
        <div class="trend-breakdown-main">
          <div class="trend-breakdown-identity">
            <span class="trend-breakdown-rank">${idx + 1}</span>
            <span class="trend-breakdown-name">${esc(name)}</span>
          </div>
          <span class="trend-breakdown-delta ${cls}">${deltaText}</span>
        </div>
        <div class="trend-breakdown-metrics">
          <div class="trend-breakdown-metric">
            <span>${esc(t('currentPeriod'))}</span>
            <strong>${fmtCost(item.current_cost || 0)}</strong>
            <em>${esc(currentDetail)}</em>
          </div>
          <div class="trend-breakdown-metric">
            <span>${esc(t('previousPeriod'))}</span>
            <strong>${fmtCost(item.previous_cost || 0)}</strong>
            <em>${esc(previousDetail)}</em>
          </div>
        </div>
        <div class="trend-breakdown-track" aria-hidden="true"><span></span></div>
      </div>`;
    }).join('');
    return rows;
  };

  modelBox.innerHTML = renderList(data.breakdowns.models, 'model');
  sourceBox.innerHTML = renderList(data.breakdowns.sources, 'source');
}

function setTrendCompareVisible(visible, opts = {}) {
  const region = $('trend-compare-region');
  if (!region) return;
  if (trendCompareHideTimer) {
    clearTimeout(trendCompareHideTimer);
    trendCompareHideTimer = null;
  }

  if (visible) {
    const alreadyVisible = !region.hidden && !region.classList.contains('compare-hidden');
    region.hidden = false;
    if (opts.animate === false || alreadyVisible) {
      region.classList.remove('compare-hidden');
      return;
    }
    region.classList.add('compare-hidden');
    requestAnimationFrame(() => {
      region.classList.remove('compare-hidden');
    });
    return;
  }

  region.classList.add('compare-hidden');
  if (opts.animate === false) {
    region.hidden = true;
    if (typeof opts.afterHidden === 'function') opts.afterHidden();
    return;
  }
  trendCompareHideTimer = setTimeout(() => {
    if (!isCompareEnabled()) {
      region.hidden = true;
      if (typeof opts.afterHidden === 'function') opts.afterHidden();
    }
    trendCompareHideTimer = null;
  }, COMPARE_REGION_ANIMATION_MS);
}

function renderTrendCompare(data) {
  const region = $('trend-compare-region');
  if (!region) return;

  if (!isCompareEnabled()) {
    setTrendCompareVisible(false, {
      afterHidden: () => {
        renderTrendCompareContext(null);
        renderTrendBreakdowns(null);
      }
    });
    renderStatDeltas(null);
    return;
  }

  setTrendCompareVisible(true);
  renderTrendCompareContext(data);
  renderTrendBreakdowns(data);
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
    if (typeof updatePricingFab === 'function') updatePricingFab();

  } finally {
    isFetching = false;
    $('btn-refresh').classList.remove('loading');
    $('global-loader').classList.remove('loading');
  }
}

