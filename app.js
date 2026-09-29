/*
 * Strategy Play chart controller
 *
 * IMPORTANT: TradingView's full Supercharts/Advanced Charts drawing toolbar is
 * proprietary and is not bundled by Lightweight Charts. This file therefore
 * keeps Strategy Play independent while making the drawing layer behave like
 * a real charting workspace: drawings are anchored to absolute time/price,
 * persist across timeframes, can be selected/deleted, and work with touch.
 *
 * No SmartFX/backend connection is used.
 */

const $ = id => document.getElementById(id);

const MARKETS = [
  { value: 'BTCUSDT', label: 'Bitcoin / USDT', source: 'binance', api: 'BTCUSDT' },
  { value: 'XAUUSD', label: 'Gold / USD', source: 'stooq', api: 'XAUUSD' },
  { value: 'GBPJPY', label: 'GBP / JPY', source: 'stooq', api: 'GBPJPY' },
  { value: 'EURUSD', label: 'EUR / USD', source: 'stooq', api: 'EURUSD' }
];

const state = {
  symbol: localStorage.getItem('sp_symbol') || 'BTCUSDT',
  timeframe: localStorage.getItem('sp_tf') || '1h',
  candles: [],
  visibleCount: 0,
  playing: false,
  timer: null,
  speed: 1,
  tool: 'crosshair',
  drawings: [],
  trades: [],
  selectedId: null,
  drawingStart: null,
  dragDrawing: null,
  lastMarketKey: ''
};

// -----------------------------
// UI setup
// -----------------------------
function ensureMarketOptions() {
  const select = $('symbol');
  select.innerHTML = MARKETS.map(m => `<option value="${m.value}">${m.label}</option>`).join('');
  select.value = state.symbol;

  $('timeframe').innerHTML = [
    ['1m','1m'], ['5m','5m'], ['15m','15m'], ['30m','30m'],
    ['1h','1H'], ['4h','4H'], ['1d','1D'], ['1w','1W']
  ].map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
  $('timeframe').value = state.timeframe;
}

function replaceToolsWithWorkspaceTools() {
  const tools = $('tools');
  if (!tools) return;

  tools.innerHTML = [
    ['crosshair','✛','Cursor'],
    ['trend','╱','Trend line'],
    ['hline','━','Horizontal line'],
    ['ray','↗','Ray'],
    ['rectangle','□','Rectangle'],
    ['fib','⌁','Fib retracement'],
    ['text','T','Text'],
    ['erase','⌫','Delete']
  ].map(([tool,icon,label]) =>
    `<button class="tool${tool==='crosshair'?' active':''}" data-tool="${tool}" type="button">${icon}<span>${label}</span></button>`
  ).join('');

  tools.querySelectorAll('.tool').forEach(btn =>
    btn.addEventListener('click', () => setTool(btn.dataset.tool))
  );
}

ensureMarketOptions();
replaceToolsWithWorkspaceTools();

const chart = LightweightCharts.createChart($('chart'), {
  layout: {
    background: { color: '#060907' },
    textColor: '#c7d0ca'
  },
  grid: {
    vertLines: { color: '#101713' },
    horzLines: { color: '#101713' }
  },
  rightPriceScale: {
    borderColor: '#1c2922',
    scaleMargins: { top: 0.08, bottom: 0.08 }
  },
  timeScale: {
    borderColor: '#1c2922',
    timeVisible: true,
    secondsVisible: false
  },
  crosshair: {
    mode: LightweightCharts.CrosshairMode.Normal
  },
  handleScale: {
    mouseWheel: true,
    pinch: true
  },
  handleScroll: {
    mouseWheel: true,
    pressedMouseMove: true,
    horzTouchDrag: true,
    vertTouchDrag: true
  }
});

const series = chart.addCandlestickSeries({
  upColor: '#9cff57',
  downColor: '#e66b6b',
  borderVisible: false,
  wickUpColor: '#9cff57',
  wickDownColor: '#e66b6b'
});

const overlay = $('overlay');
const ctx = overlay.getContext('2d');

function workspaceKey() {
  // Drawings are intentionally NOT keyed by timeframe.
  return `strategy-play:${state.symbol}`;
}

function save() {
  const payload = {
    version: 2,
    drawings: state.drawings,
    trades: state.trades,
    journal: $('journal').value
  };

  localStorage.setItem(workspaceKey(), JSON.stringify(payload));
  localStorage.setItem('sp_symbol', state.symbol);
  localStorage.setItem('sp_tf', state.timeframe);

  $('saveStatus').textContent = 'Saved';
  updateStats();
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(workspaceKey());
    const d = raw ? JSON.parse(raw) : {};

    state.drawings = Array.isArray(d.drawings) ? d.drawings : [];
    state.trades = Array.isArray(d.trades) ? d.trades : [];

    $('journal').value = d.journal || '';
  } catch {
    state.drawings = [];
    state.trades = [];
  }

  state.selectedId = null;
  updateStats();
  drawOverlay();
}

function updateStats() {
  $('drawingCount').textContent = state.drawings.length;
  $('tradeCount').textContent = state.trades.length;
}

function setTool(tool) {
  state.tool = tool;
  state.selectedId = null;

  document.querySelectorAll('.tool').forEach(b =>
    b.classList.toggle('active', b.dataset.tool === tool)
  );

  overlay.style.cursor =
    tool === 'crosshair'
      ? 'crosshair'
      : tool === 'erase'
        ? 'not-allowed'
        : 'crosshair';

  drawOverlay();
}

// -----------------------------
// Data
// -----------------------------
async function loadBinance() {
  const url =
    `https://api.binance.com/api/v3/klines?symbol=${market().api}&interval=${state.timeframe}&limit=1000`;

  const r = await fetch(url);

  if (!r.ok) {
    throw new Error('Binance data unavailable');
  }

  const raw = await r.json();

  return raw.map(x => ({
    time: Math.floor(x[0] / 1000),
    open: +x[1],
    high: +x[2],
    low: +x[3],
    close: +x[4]
  }));
}

/*
 * Stooq's downloadable endpoint is used as a no-key fallback for the FX/gold
 * markets. It is daily data, so intraday FX/gold requires a licensed feed/API.
 */
async function loadStooq() {
  if (state.timeframe !== '1d' && state.timeframe !== '1w') {
    throw new Error(
      'Intraday FX/Gold data needs a market-data API. Select 1D or 1W for the public feed.'
    );
  }

  const symbol = market().api.toLowerCase();
  const url = `https://stooq.com/q/d/l/?s=${symbol}&d1=20190101&i=d`;

  const r = await fetch(url);

  if (!r.ok) {
    throw new Error('Public FX/gold data unavailable');
  }

  const text = await r.text();

  const lines = text.trim().split(/\r?\n/).slice(1);

  return lines
    .map(line => {
      const [date, open, high, low, close] = line.split(',');

      return {
        time: Math.floor(
          new Date(`${date}T00:00:00Z`).getTime() / 1000
        ),
        open: +open,
        high: +high,
        low: +low,
        close: +close
      };
    })
    .filter(x => Number.isFinite(x.open));
}

function market() {
  return MARKETS.find(m => m.value === state.symbol) || MARKETS[0];
}

async function loadCandles() {
  $('loading').classList.remove('hidden');

  stop();

  try {
    state.candles =
      market().source === 'binance'
        ? await loadBinance()
        : await loadStooq();

    state.visibleCount = state.candles.length;

    series.setData(state.candles);
    chart.timeScale().fitContent();

    loadSaved();
    syncReplay();

    $('pairTitle').textContent = market().label;

    $('chartStatus').textContent =
      `Historical candles loaded • ${state.timeframe.toUpperCase()} • manual replay`;
  } catch (e) {
    state.candles = [];

    series.setData([]);

    $('pairTitle').textContent = market().label;

    $('chartStatus').textContent =
      e.message || 'Could not load market data.';

    syncReplay();
    loadSaved();
  } finally {
    $('loading').classList.add('hidden');
    drawOverlay();
  }
}

// -----------------------------
// Replay
// -----------------------------
function syncReplay() {
  $('replayRange').max = Math.max(1, state.candles.length);

  $('replayRange').value =
    Math.min(state.visibleCount || 0, state.candles.length);

  $('candleCounter').textContent =
    `${state.visibleCount || 0} / ${state.candles.length}`;
}

function renderVisible() {
  series.setData(state.candles.slice(0, state.visibleCount));
  syncReplay();
  drawOverlay();
}

function step() {
  if (state.visibleCount < state.candles.length) {
    state.visibleCount++;
    renderVisible();
  } else {
    stop();
  }
}

function play() {
  if (state.playing || !state.candles.length) return;

  state.playing = true;

  $('playBtn').textContent = '▶ Playing';

  state.timer = setInterval(
    step,
    Math.max(120, 1000 / state.speed)
  );
}

function stop() {
  state.playing = false;

  clearInterval(state.timer);
  state.timer = null;

  if ($('playBtn')) {
    $('playBtn').textContent = '▶ Play';
  }
}

// -----------------------------
// Drawing engine
// -----------------------------
function resize() {
  const r = $('chartWrap').getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  overlay.width = Math.floor(r.width * dpr);
  overlay.height = Math.floor(r.height * dpr);

  overlay.style.width = r.width + 'px';
  overlay.style.height = r.height + 'px';

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  chart.resize(r.width, r.height);

  drawOverlay();
}

function point(e) {
  const r = overlay.getBoundingClientRect();

  const x = e.clientX - r.left;
  const y = e.clientY - r.top;

  return {
    x,
    y,
    time: chart.timeScale().coordinateToTime(x),
    price: series.coordinateToPrice(y)
  };
}

function xy(p) {
  if (!p) return [null, null];

  return [
    chart.timeScale().timeToCoordinate(p.time),
    series.priceToCoordinate(p.price)
  ];
}

function drawLine(a, b, color = '#9cff57', dash = []) {
  if (
    a[0] == null ||
    b[0] == null ||
    a[1] == null ||
    b[1] == null
  ) return;

  ctx.save();

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.setLineDash(dash);

  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();

  ctx.restore();
}

function drawSelectionBox(x, y, w, h) {
  ctx.save();

  ctx.strokeStyle = '#d8ffd0';
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1;

  ctx.strokeRect(x, y, w, h);

  ctx.restore();
}

function isSelected(d) {
  return state.selectedId === d.id;
}

function drawOverlay() {
  if (!overlay.width) return;

  ctx.clearRect(
    0,
    0,
    overlay.clientWidth,
    overlay.clientHeight
  );

  for (const d of state.drawings) {
    const selected = isSelected(d);
    const color = selected ? '#ffffff' : '#9cff57';

    if (d.type === 'trend' || d.type === 'ray') {
      const a = xy(d.a);
      const b = xy(d.b);

      drawLine(a, b, color);

      if (
        d.type === 'ray' &&
        a[0] != null &&
        b[0] != null
      ) {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];

        if (Math.abs(dx) > 0.001) {
          drawLine(
            b,
            [
              overlay.clientWidth,
              b[1] + dy / dx *
                (overlay.clientWidth - b[0])
            ],
            color
          );
        }
      }

      if (
        selected &&
        a[0] != null &&
        b[0] != null
      ) {
        ctx.fillStyle = '#fff';

        ctx.fillRect(
          a[0] - 3,
          a[1] - 3,
          6,
          6
        );

        ctx.fillRect(
          b[0] - 3,
          b[1] - 3,
          6,
          6
        );
      }
    }

    if (d.type === 'hline') {
      const y = series.priceToCoordinate(d.price);

      if (y != null) {
        drawLine(
          [0, y],
          [overlay.clientWidth, y],
          color,
          [6, 5]
        );
      }
    }

    if (d.type === 'rectangle') {
      const a = xy(d.a);
      const b = xy(d.b);

      if (
        a[0] != null &&
        b[0] != null
      ) {
        const x = Math.min(a[0], b[0]);
        const y = Math.min(a[1], b[1]);
        const w = Math.abs(b[0] - a[0]);
        const h = Math.abs(b[1] - a[1]);

        ctx.save();

        ctx.fillStyle = 'rgba(156,255,87,.07)';
        ctx.fillRect(x, y, w, h);

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;

        ctx.strokeRect(x, y, w, h);

        ctx.restore();

        if (selected) {
          drawSelectionBox(x, y, w, h);
        }
      }
    }

    if (d.type === 'fib') {
      const a = xy(d.a);
      const b = xy(d.b);

      if (
        a[0] != null &&
        b[0] != null
      ) {
        const levels = [
          0,
          0.236,
          0.382,
          0.5,
          0.618,
          0.786,
          1
        ];

        levels.forEach(l => {
          const price =
            d.a.price +
            (d.b.price - d.a.price) * l;

          const y = series.priceToCoordinate(price);

          if (y != null) {
            drawLine(
              [
                Math.min(a[0], b[0]),
                y
              ],
              [
                overlay.clientWidth,
                y
              ],
              color,
              [3, 4]
            );

            ctx.save();

            ctx.fillStyle = color;
            ctx.font = '11px sans-serif';

            ctx.fillText(
              `${(l * 100).toFixed(1)}%`,
              Math.min(a[0], b[0]) + 5,
              y - 3
            );

            ctx.restore();
          }
        });
      }
    }

    if (d.type === 'text') {
      const a = xy(d.a);

      if (a[0] != null) {
        ctx.save();

        ctx.fillStyle = color;
        ctx.font = '13px sans-serif';

        ctx.fillText(
          d.text,
          a[0],
          a[1]
        );

        ctx.restore();
      }
    }
  }

  // Manual trade levels remain workspace data,
  // independent of timeframe.
  for (const t of state.trades) {
    for (
      const [p, c, label] of [
        [t.entry, '#9cff57', 'Entry'],
        [t.sl, '#e66b6b', 'SL'],
        [t.tp, '#63d43c', 'TP']
      ]
    ) {
      const y = series.priceToCoordinate(p);

      if (y == null) continue;

      drawLine(
        [0, y],
        [overlay.clientWidth, y],
        c,
        [7, 5]
      );

      ctx.save();

      ctx.fillStyle = c;
      ctx.font = '11px sans-serif';

      ctx.fillText(
        label,
        8,
        y - 4
      );

      ctx.restore();
    }
  }
}

function nearestDrawing(p) {
  let best = null;
  let bestDist = 14;

  for (const d of state.drawings) {
    if (d.type === 'hline') {
      const y = series.priceToCoordinate(d.price);

      if (
        y != null &&
        Math.abs(y - p.y) < bestDist
      ) {
        best = d;
        bestDist = Math.abs(y - p.y);
      }

      continue;
    }

    const a = xy(d.a);
    const b = d.b ? xy(d.b) : a;

    if (
      a[0] == null ||
      a[1] == null
    ) continue;

    if (d.type === 'text') {
      const dist = Math.hypot(
        a[0] - p.x,
        a[1] - p.y
      );

      if (dist < bestDist) {
        best = d;
        bestDist = dist;
      }
    } else if (d.type === 'rectangle') {
      const x1 = Math.min(a[0], b[0]);
      const x2 = Math.max(a[0], b[0]);

      const y1 = Math.min(a[1], b[1]);
      const y2 = Math.max(a[1], b[1]);

      const near = Math.min(
        Math.abs(p.x - x1),
        Math.abs(p.x - x2),
        Math.abs(p.y - y1),
        Math.abs(p.y - y2)
      );

      if (
        p.x >= x1 - 10 &&
        p.x <= x2 + 10 &&
        p.y >= y1 - 10 &&
        p.y <= y2 + 10 &&
        near < bestDist
      ) {
        best = d;
        bestDist = near;
      }
    } else {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];

      const len2 = dx * dx + dy * dy;

      const t = len2
        ? Math.max(
            0,
            Math.min(
              1,
              (
                (p.x - a[0]) * dx +
                (p.y - a[1]) * dy
              ) / len2
            )
          )
        : 0;

      const dist = Math.hypot(
        p.x - (a[0] + t * dx),
        p.y - (a[1] + t * dy)
      );

      if (dist < bestDist) {
        best = d;
        bestDist = dist;
      }
    }
  }

  return best;
}

function addDrawing(type, a, b, extra = {}) {
  state.drawings.push({
    id: crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
    type,
    a,
    ...(b ? { b } : {}),
    ...extra
  });

  save();
  drawOverlay();
}

// -----------------------------
// Drawing interaction
// -----------------------------
let start = null;

overlay.addEventListener('pointerdown', e => {
  if (state.tool === 'crosshair') return;

  overlay.setPointerCapture?.(e.pointerId);

  const p = point(e);

  if (state.tool === 'erase') {
    const hit = nearestDrawing(p);

    if (hit) {
      state.drawings =
        state.drawings.filter(
          d => d.id !== hit.id
        );

      state.selectedId = null;

      save();
      drawOverlay();
    }

    return;
  }

  if (state.tool === 'text') {
    const text = prompt('Text to place on chart:');

    if (text) {
      addDrawing(
        'text',
        {
          time: p.time,
          price: p.price
        },
        null,
        { text }
      );
    }

    return;
  }

  const hit = nearestDrawing(p);

  if (hit && e.shiftKey) {
    state.drawings =
      state.drawings.filter(
        d => d.id !== hit.id
      );

    state.selectedId = null;

    save();
    drawOverlay();

    return;
  }

  start = p;

  state.selectedId =
    hit?.id || null;

  drawOverlay();
});

overlay.addEventListener('pointerup', e => {
  if (!start) return;

  const end = point(e);
  const a = start;

  start = null;

  if (
    a.time == null ||
    end.time == null ||
    a.price == null ||
    end.price == null
  ) return;

  if (state.tool === 'trend') {
    addDrawing(
      'trend',
      {
        time: a.time,
        price: a.price
      },
      {
        time: end.time,
        price: end.price
      }
    );
  }

  else if (state.tool === 'ray') {
    addDrawing(
      'ray',
      {
        time: a.time,
        price: a.price
      },
      {
        time: end.time,
        price: end.price
      }
    );
  }

  else if (state.tool === 'hline') {
    addDrawing(
      'hline',
      {
        time: a.time,
        price: a.price
      }
    );
  }

  else if (state.tool === 'rectangle') {
    addDrawing(
      'rectangle',
      {
        time: a.time,
        price: a.price
      },
      {
        time: end.time,
        price: end.price
      }
    );
  }

  else if (state.tool === 'fib') {
    addDrawing(
      'fib',
      {
        time: a.time,
        price: a.price
      },
      {
        time: end.time,
        price: end.price
      }
    );
  }
});

// Double tap/click a selected drawing removes it.
overlay.addEventListener('dblclick', e => {
  const hit = nearestDrawing(point(e));

  if (hit) {
    state.drawings =
      state.drawings.filter(
        d => d.id !== hit.id
      );

    state.selectedId = null;

    save();
    drawOverlay();
  }
});

// -----------------------------
// Controls
// -----------------------------
$('playBtn').onclick = play;

$('pauseBtn').onclick = stop;

$('nextBtn').onclick = step;

$('speed').oninput = e => {
  state.speed = +e.target.value;

  $('speedValue').textContent =
    state.speed + 'x';

  if (state.playing) {
    stop();
    play();
  }
};

$('replayRange').oninput = e => {
  state.visibleCount = +e.target.value;

  stop();
  renderVisible();
};

$('saveBtn').onclick = save;

$('resetBtn').onclick = () =>
  chart.timeScale().fitContent();

$('fitBtn').onclick = () =>
  chart.timeScale().fitContent();

$('clearDrawings').onclick = () => {
  if (
    confirm(
      'Clear all drawings for this market?'
    )
  ) {
    state.drawings = [];
    state.selectedId = null;

    save();
    drawOverlay();
  }
};

$('recordTrade').onclick = () => {
  const entry = +$('entry').value;
  const sl = +$('sl').value;
  const tp = +$('tp').value;

  if (!entry || !sl || !tp) {
    return alert(
      'Enter Entry, Stop Loss and Take Profit first.'
    );
  }

  state.trades.push({
    entry,
    sl,
    tp,
    note: $('tradeNote').value,
    createdAt: new Date().toISOString()
  });

  $('entry').value =
    $('sl').value =
    $('tp').value =
    $('tradeNote').value = '';

  save();
  drawOverlay();
};

$('journal').oninput = () => {
  $('saveStatus').textContent = 'Unsaved';

  clearTimeout(window._save);

  window._save = setTimeout(
    save,
    500
  );
};

$('symbol').onchange = () => {
  state.symbol = $('symbol').value;

  localStorage.setItem(
    'sp_symbol',
    state.symbol
  );

  loadCandles();
};

$('timeframe').onchange = () => {
  state.timeframe = $('timeframe').value;

  localStorage.setItem(
    'sp_tf',
    state.timeframe
  );

  loadCandles();
};

$('mobileMenu').onclick = () =>
  $('sidebar').classList.toggle('open');

// -----------------------------
// Resize / crosshair
// -----------------------------
new ResizeObserver(resize).observe(
  $('chartWrap')
);

window.addEventListener(
  'resize',
  resize
);

chart.subscribeCrosshairMove(p => {
  if (!p.point) {
    $('crosshairInfo').classList.add('hidden');
    return;
  }

  const price =
    series.coordinateToPrice(
      p.point.y
    );

  const time =
    chart.timeScale().coordinateToTime(
      p.point.x
    );

  if (price == null || !time) return;

  $('crosshairInfo').classList.remove(
    'hidden'
  );

  $('crosshairInfo').textContent =
    `${new Date(Number(time) * 1000).toLocaleString()} • ${Number(price).toFixed(2)}`;
});

// Keep drawing interaction touch-friendly.
['touchstart', 'touchmove', 'touchend'].forEach(
  type =>
    overlay.addEventListener(
      type,
      e => {
        if (state.tool !== 'crosshair') {
          e.preventDefault();
        }
      },
      { passive: false }
    )
);

loadCandles();
