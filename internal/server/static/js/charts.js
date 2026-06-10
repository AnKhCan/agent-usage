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
      return `<div class="trend-breakdown-row ${cls}" style="--trend-share:${share.toFixed(1)}%;--row-index:${idx};" title="${esc(item.name)}">
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

function trendPointHasData(p) {
  return [p && p.current, p && p.previous].some(v => {
    if (!v) return false;
    return ['cost', 'tokens', 'calls', 'sessions'].some(k => Number(v[k]) > 0);
  });
}

function displayTrendPoints(points) {
  const all = points || [];
  return state.activePeriods ? all.filter(trendPointHasData) : all;
}

function renderTrendPeriodControl() {
  const toggle = $('trend-period-toggle');
  if (!toggle) return;
  toggle.querySelectorAll('[data-active-periods]').forEach(btn => {
    const active = (btn.dataset.activePeriods === 'true') === !!state.activePeriods;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function setTrendCompareVisible(visible, opts = {}) {
  const card = $('trend-compare-card');
  if (!card) return;
  if (trendCompareHideTimer) {
    clearTimeout(trendCompareHideTimer);
    trendCompareHideTimer = null;
  }

  if (visible) {
    const alreadyVisible = !card.hidden && !card.classList.contains('compare-hidden');
    card.hidden = false;
    if (opts.animate === false || alreadyVisible) {
      card.classList.remove('compare-hidden');
      return;
    }
    card.classList.add('compare-hidden');
    requestAnimationFrame(() => {
      card.classList.remove('compare-hidden');
      setTimeout(() => charts.compare.resize(), COMPARE_CARD_ANIMATION_MS);
    });
    return;
  }

  card.classList.add('compare-hidden');
  if (opts.animate === false) {
    card.hidden = true;
    if (typeof opts.afterHidden === 'function') opts.afterHidden();
    return;
  }
  trendCompareHideTimer = setTimeout(() => {
    if (!isCompareEnabled()) {
      card.hidden = true;
      if (typeof opts.afterHidden === 'function') opts.afterHidden();
    }
    trendCompareHideTimer = null;
  }, COMPARE_CARD_ANIMATION_MS);
}

function renderTrendCompare(data, opts = {}) {
  const card = $('trend-compare-card');
  const label = $('compare-range-label');
  if (!card) return;
  renderTrendPeriodControl();

  if (!isCompareEnabled()) {
    setTrendCompareVisible(false, { afterHidden: () => renderTrendBreakdowns(null) });
    renderStatDeltas(null);
    return;
  }

  setTrendCompareVisible(true);
  const tc = getThemeColors();
  const rawPoints = (data && data.series) || [];
  const points = displayTrendPoints(rawPoints);
  const labels = points.map(p => p.label || p.previous_label || '');
  const current = points.map(p => +(((p.current && p.current.cost) || 0).toFixed(4)));
  const previous = points.map(p => +(((p.previous && p.previous.cost) || 0).toFixed(4)));
  const hasData = rawPoints.some(trendPointHasData);
  const hiddenPeriods = Math.max(0, rawPoints.length - points.length);

  if (label) {
    const hiddenText = state.activePeriods && hiddenPeriods > 0 ? ` · ${t('emptyPeriodsHidden')}` : '';
    label.textContent = data ? `${t('previousPeriod')}: ${formatAPIRange(data.compare_range)}${hiddenText}` : '';
  }

  const animateUpdate = opts.animateUpdate !== false;
  const updateDuration = opts.updateDuration || TREND_COMPARE_UPDATE_MS;
  charts.compare.setOption({
    ...baseOpt(),
    animation: animateUpdate,
    animationDuration: animateUpdate ? updateDuration : 0,
    animationEasing: 'quarticOut',
    animationDurationUpdate: animateUpdate ? updateDuration : 0,
    animationEasingUpdate: 'quarticOut',
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
      { id: 'trend-current', name: t('currentPeriod'), type: 'line', smooth: true, symbolSize: 5, showSymbol: labels.length <= 60, data: current, color: '#3b82f6', lineStyle: { width: 3 }, areaStyle: { opacity: 0.08 } },
      { id: 'trend-previous', name: t('previousPeriod'), type: 'line', smooth: true, symbolSize: 5, showSymbol: labels.length <= 60, data: previous, color: '#94a3b8', lineStyle: { width: 2, type: 'dashed' } }
    ]
  }, { notMerge: opts.redraw === true || opts.replace === true, lazyUpdate: false });

  if (opts.updateBreakdowns !== false) renderTrendBreakdowns(data);
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

    lastTrendCompareData = trendCompare;
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

