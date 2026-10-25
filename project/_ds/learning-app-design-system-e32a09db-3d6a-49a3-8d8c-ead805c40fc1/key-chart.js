/* KeyInsight chart (split KeyInsight, Han 2026-10-24): the small framed chart on the right of .rw-key.is-split.
   Markup: <div class="rw-key-chart" data-kind="trend|compare|strip" data-values="42,47,45,53,58,64"
                [data-min="30" data-max="70" data-ticks="30,50,70" data-unit="%" data-split="3"
                 data-quote="0,5" data-xlabels="1|2|3|4|5|6" data-labels="false"]></div>
   or from script: RWKeyChart.render(el, { pattern, values, quote, split, min, max, ticks, unit, xLabels, labels }).
   Any number of matches (the frame spreads them out). Values may be negative or have one decimal; without
   min/max/ticks the scale is picked from the data (trend: the data's range; compare/strip: from 0).
   quote: indices of the values the body copy quotes, written at their points (trend; default first and latest).
   unit: a suffix for quoted values (e.g. "%"). xLabels: the text under each match (default 1..n), per language.
   yLabels: true shows the tick numbers on the left (off by default since 2026-10-25).
   The chart fills its box (4 of 10 parts of the tile, as tall as the text column) and redraws when the box changes size.
     trend    one value per match, oldest left; line + flat dots, the first and latest values written at their points
     compare  one bar per match; matches before data-split are "earlier" (grey), the rest recent (blue);
              each group's total is written over it
     strip    one pill per match at its count; a match with 0 sits on the zero line in the "none" colour;
              levels 16px apart, centred in the frame, with a thin connector where the state changes, fading from one pill's colour to the next's
   Frame for all three: dashed horizontal grid at the ticks, a vertical grid line per match, tick labels.
   Colours and type come from the --rw-key-chart-* tokens in tokens/v2.css. */
(function () {
  const num = s => (s || '').split(',').filter(x => x.trim() !== '').map(Number);
  const fmt = v => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  // Three-ish evenly spaced round ticks covering lo..hi (0 included when the range crosses it).
  // Whole-number data (counts, 0/1 tags) gets whole-number ticks.
  function niceTicks(lo, hi, whole) {
    if (hi === lo) hi = lo + 1;
    const raw = (hi - lo) / 2, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    let step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
    if (whole) step = Math.max(1, Math.round(step));
    const t = []; for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 1e6; v += step) t.push(+v.toFixed(6));
    return t;
  }
  let uid = 0;

  function svg(o, W, H) {
    const vals = o.values, n = vals.length, labels = o.labels !== false;
    const ticks = o.ticks;
    // No y-axis numbers by default (Han, 2026-10-25): the quoted values are written on the chart, so the frame starts
    // at the first match. yLabels: true (data-ylabels="true") brings the tick numbers back.
    const yl = labels && o.yLabels, L = yl ? 18 : 4, R = 4, T = 5, B = labels ? 16 : 4, P = 9; // P: inner padding so the 14px pill stays inside
    const X = i => L + P + (n > 1 ? i * (W - L - R - 2 * P) / (n - 1) : (W - L - R - 2 * P) / 2), PH = H - T - B;
    // Strip levels sit STEP px apart in a band centred in the frame, instead of at its top and bottom edges
    // (Han, 2026-10-25: the two levels were too far apart). Trend and compare use the full height.
    const STEP = 16, span = o.kind === 'strip' ? Math.min(PH, (o.max - o.min) * STEP) : PH, T0 = T + (PH - span) / 2;
    const Y = v => T0 + span - (v - o.min) / ((o.max - o.min) || 1) * span;
    const id = 'rw-kc-' + (++uid);
    let g = '', m = '';
    ticks.forEach(t => {
      g += `<line class="rw-key-chart-grid-h" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/>`;
      if (yl) g += `<text x="${L - 6}" y="${Y(t) + 3}" text-anchor="end">${fmt(t)}</text>`;
    });
    for (let i = 0; i < n; i++) {
      g += `<line class="rw-key-chart-grid-v" x1="${X(i)}" x2="${X(i)}" y1="${T}" y2="${H - B + (labels ? 3 : 0)}"/>`;
      if (labels) g += `<text x="${X(i)}" y="${H - 2}" text-anchor="middle">${o.xLabels[i] != null ? o.xLabels[i] : i + 1}</text>`;
    }
    // Gradient stops come from tokens (--rw-key-chart-line-* = Blue Gradient 01 reversed, --rw-key-chart-bar-* = Blue Gradient 02).
    const defs = `<linearGradient id="${id}h" x1="0" x2="1" y1="0" y2="0"><stop offset="0" style="stop-color:var(--rw-key-chart-line-from)"/><stop offset="1" style="stop-color:var(--rw-key-chart-line-to)"/></linearGradient>
      <linearGradient id="${id}v" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--rw-key-chart-bar-from)"/><stop offset="1" style="stop-color:var(--rw-key-chart-bar-to)"/></linearGradient>`;
    if (o.kind === 'trend') {
      const pts = vals.map((v, i) => [X(i), Y(v)]);
      m += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="url(#${id}h)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
      pts.forEach((p, i) => { m += `<circle class="rw-key-chart-dot" cx="${p[0]}" cy="${p[1]}" r="${i === n - 1 ? 4 : 2.5}"/>`; });
      // Quoted values: the latest above its point in the latest colour, the others below theirs
      // (above too when below would run into the x labels).
      if (labels) o.quote.filter(i => i >= 0 && i < n).forEach(i => {
        const last = i === n - 1, above = last || pts[i][1] + 13 > H - B - 2;
        m += `<text class="${last ? 'is-latest' : ''}" x="${pts[i][0]}" y="${pts[i][1] + (above ? -8 : 13)}" text-anchor="middle">${fmt(vals[i])}${o.unit}</text>`;
      });
    }
    if (o.kind === 'compare') {
      const k = o.split;
      vals.forEach((v, i) => { m += `<rect class="${i < k ? 'rw-key-chart-earlier' : ''}" x="${X(i) - 3}" y="${Y(v)}" width="6" height="${Y(o.min) - Y(v)}" rx="3"${i < k ? '' : ` fill="url(#${id}v)"`}/>`; });
      if (labels) [[0, k, ''], [k, n, 'is-latest']].forEach(([a, b, c]) => {
        const grp = vals.slice(a, b); if (!grp.length) return;
        m += `<text class="${c}" x="${(X(a) + X(b - 1)) / 2}" y="${Y(Math.max(...grp)) - 6}" text-anchor="middle">${fmt(grp.reduce((x, y) => x + y, 0))}</text>`;
      });
    }
    // Strip: a thin connector from one pill's end to the next pill's start wherever the state changes, drawn under the pills.
    // It fades from one pill's colour to the other's (Han, 2026-10-25: orange above to grey below).
    const pc = v => `var(--rw-key-chart-${v ? 'on' : 'none'})`;
    if (o.kind === 'strip') vals.forEach((v, i) => {
      if (i === n - 1 || vals[i + 1] === v) return;
      const x1 = X(i) + 7, y1 = Y(v), x2 = X(i + 1) - 7, y2 = Y(vals[i + 1]), gid = `${id}c${i}`;
      m += `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" style="stop-color:${pc(v)}"/><stop offset="1" style="stop-color:${pc(vals[i + 1])}"/></linearGradient>`
        + `<line class="rw-key-chart-connector" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="url(#${gid})"/>`;
    });
    if (o.kind === 'strip') vals.forEach((v, i) => { m += `<rect class="${v ? 'rw-key-chart-on' : 'rw-key-chart-none'}" x="${X(i) - 7}" y="${Y(v) - 3}" width="14" height="6" rx="3"/>`; });
    return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs>${defs}</defs>${g}${m}</svg>`;
  }

  function draw(el) {
    const r = el.getBoundingClientRect(), W = Math.round(r.width), H = Math.round(r.height);
    if (!W || !H) return;
    const d = el.dataset, key = [W, H, d.kind, d.values, d.labels, d.min, d.max, d.ticks, d.quote, d.split, d.unit, d.xlabels, d.ylabels].join('|');
    if (el._rwKey === key) return;
    el._rwKey = key;
    const values = num(d.values), n = values.length, kind = d.kind;
    const lo = kind === 'trend' ? Math.min(...values) : Math.min(0, ...values), hi = Math.max(...values, kind === 'trend' ? -Infinity : 1);
    let ticks = num(d.ticks);
    if (!ticks.length) ticks = niceTicks(d.min != null ? +d.min : lo, d.max != null ? +d.max : hi, values.every(Number.isInteger));
    const min = d.min != null ? +d.min : Math.min(ticks[0], lo), max = d.max != null ? +d.max : Math.max(ticks[ticks.length - 1], hi);
    const quote = d.quote != null ? num(d.quote) : (kind === 'trend' && n ? [0, n - 1] : []);
    const xLabels = d.xlabels ? d.xlabels.split('|') : [];
    el.innerHTML = svg({ kind, values, ticks, min, max, quote, xLabels, unit: d.unit || '', split: +(d.split || Math.floor(n / 2)), labels: d.labels !== 'false', yLabels: d.ylabels === 'true' }, W, H);
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(es => es.forEach(e => draw(e.target))) : null;
  function scan(root) {
    (root || document).querySelectorAll('.rw-key-chart').forEach(el => { if (!el._rwSeen) { el._rwSeen = true; if (ro) ro.observe(el); } el._rwKey = null; draw(el); });
  }
  // Script entry point; takes the engine's chart object (pattern, values, quote, split, ...) as is.
  function render(el, c) {
    const d = el.dataset, set = (k, v) => { if (v == null) delete d[k]; else d[k] = Array.isArray(v) ? v.join(k === 'xlabels' ? '|' : ',') : String(v); };
    set('kind', c.pattern || c.kind); set('values', c.values); set('quote', c.quote); set('split', c.split);
    set('min', c.min); set('max', c.max); set('ticks', c.ticks); set('unit', c.unit); set('xlabels', c.xLabels);
    set('labels', c.labels === false ? 'false' : null); set('ylabels', c.yLabels ? 'true' : null);
    if (!el.classList.contains('rw-key-chart')) el.classList.add('rw-key-chart');
    if (!el._rwSeen) { el._rwSeen = true; if (ro) ro.observe(el); }
    el._rwKey = null; draw(el);
  }
  window.RWKeyChart = { scan, draw, render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan()); else scan();
  if (document.fonts) document.fonts.ready.then(() => scan());
})();
