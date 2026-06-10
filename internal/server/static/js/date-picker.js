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

