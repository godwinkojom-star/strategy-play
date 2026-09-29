/*
 * STRATEGY PLAY
 *
 * Chart:
 *   TradingView hosted chart widget
 *
 * Markets:
 *   BTC/USDT
 *   Gold/USD
 *   GBP/JPY
 *   EUR/USD
 *
 * Strategy Play remains manual:
 *   - no automatic signals
 *   - no SmartFX connection
 *   - no app.py
 *   - no strategy engine
 *
 * TradingView provides the actual chart UI, drawing toolbar,
 * indicators and chart interaction.
 *
 * Strategy Play adds:
 *   - selected-market workspace
 *   - manual replay controls
 *   - manual trade journal
 *   - browser persistence
 */

const MARKETS = {
  BTCUSDT: {
    label: "Bitcoin / USDT",
    tv: "BINANCE:BTCUSDT"
  },

  XAUUSD: {
    label: "Gold / USD",
    tv: "OANDA:XAUUSD"
  },

  GBPJPY: {
    label: "GBP / JPY",
    tv: "OANDA:GBPJPY"
  },

  EURUSD: {
    label: "EUR / USD",
    tv: "OANDA:EURUSD"
  }
};

const TIMEFRAMES = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1H",
  "240": "4H",
  "D": "1D",
  "W": "1W"
};

const state = {
  symbol:
    localStorage.getItem("strategyPlay.symbol") ||
    "BTCUSDT",

  timeframe:
    localStorage.getItem("strategyPlay.timeframe") ||
    "60",

  speed: 1,

  replayPercent: 100,

  replayPlaying: false,

  replayTimer: null,

  widget: null,

  chartReady: false,

  trades: [],

  journal: "",

  savedLayout: null
};

const $ = id => document.getElementById(id);

/* ---------------------------------------
   STORAGE
--------------------------------------- */

function storageKey() {
  return `strategy-play-workspace:${state.symbol}`;
}

function saveWorkspace() {

  const data = {
    version: 3,

    symbol: state.symbol,

    /*
     * Drawings are stored by TradingView inside
     * its chart layout when widget.save() is available.
     *
     * We keep the complete layout object here so
     * drawings + indicators + chart settings travel
     * with the workspace.
     */
    chartLayout: state.savedLayout,

    trades: state.trades,

    journal: state.journal,

    updatedAt: Date.now()
  };

  localStorage.setItem(
    storageKey(),
    JSON.stringify(data)
  );

  localStorage.setItem(
    "strategyPlay.symbol",
    state.symbol
  );

  localStorage.setItem(
    "strategyPlay.timeframe",
    state.timeframe
  );

  if ($("saveStatus")) {
    $("saveStatus").textContent = "Saved";
  }
}

function loadWorkspace() {

  try {

    const raw =
      localStorage.getItem(
        storageKey()
      );

    if (!raw) {

      state.savedLayout = null;
      state.trades = [];
      state.journal = "";

      if ($("journal")) {
        $("journal").value = "";
      }

      updateStats();

      return;
    }

    const data = JSON.parse(raw);

    state.savedLayout =
      data.chartLayout || null;

    state.trades =
      Array.isArray(data.trades)
        ? data.trades
        : [];

    state.journal =
      data.journal || "";

    if ($("journal")) {
      $("journal").value =
        state.journal;
    }

  } catch (error) {

    console.warn(
      "Strategy Play workspace could not be loaded:",
      error
    );

    state.savedLayout = null;
    state.trades = [];
    state.journal = "";
  }

  updateStats();
}

/* ---------------------------------------
   UI
--------------------------------------- */

function updateMarketUI() {

  const market =
    MARKETS[state.symbol];

  $("pairTitle").textContent =
    market
      ? market.label
      : state.symbol;

  $("symbol").value =
    state.symbol;

  $("timeframe").value =
    state.timeframe;
}

function updateStats() {

  $("tradeCount").textContent =
    state.trades.length;

  /*
   * TradingView owns drawing objects.
   * We intentionally don't pretend to count
   * them using our own fake drawing layer.
   */
  $("drawingCount").textContent =
    state.chartReady
      ? "TradingView"
      : "—";
}

/* ---------------------------------------
   TRADINGVIEW
--------------------------------------- */

function destroyTradingView() {

  const container =
    $("tradingview_chart");

  if (!container) return;

  container.innerHTML = "";

  state.widget = null;

  state.chartReady = false;
}

function createTradingView() {

  if (
    !window.TradingView ||
    !window.TradingView.widget
  ) {

    $("chartStatus").textContent =
      "TradingView is still loading…";

    setTimeout(
      createTradingView,
      400
    );

    return;
  }

  destroyTradingView();

  const market =
    MARKETS[state.symbol];

  if (!market) return;

  $("loading").classList.remove(
    "hidden"
  );

  $("chartStatus").textContent =
    `TradingView • ${TIMEFRAMES[state.timeframe]}`;

  const saved =
    getSavedChartLayout();

  const options = {

    container_id:
      "tradingview_chart",

    autosize: true,

    symbol:
      market.tv,

    interval:
      state.timeframe,

    timezone:
      "Etc/UTC",

    theme:
      "dark",

    style:
      "1",

    locale:
      "en",

    toolbar_bg:
      "#0e120d",

    enable_publishing:
      false,

    allow_symbol_change:
      false,

    hide_side_toolbar:
      false,

    withdateranges:
      true,

    save_image:
      false,

    studies:
      [],

    /*
     * Keep the chart professional and
     * TradingView-like.
     */
    details:
      false,

    hotlist:
      false,

    calendar:
      false,

    news:
      [],

    /*
     * SmartFX-inspired appearance.
     */
    overrides: {

      "paneProperties.background":
        "#050705",

      "paneProperties.backgroundType":
        "solid",

      "paneProperties.vertGridProperties.color":
        "#111711",

      "paneProperties.horzGridProperties.color":
        "#111711",

      "scalesProperties.textColor":
        "#9aa596",

      "scalesProperties.lineColor":
        "#263024",

      "mainSeriesProperties.candleStyle.upColor":
        "#8fd400",

      "mainSeriesProperties.candleStyle.downColor":
        "#ff4d5e",

      "mainSeriesProperties.candleStyle.borderUpColor":
        "#8fd400",

      "mainSeriesProperties.candleStyle.borderDownColor":
        "#ff4d5e",

      "mainSeriesProperties.candleStyle.wickUpColor":
        "#8fd400",

      "mainSeriesProperties.candleStyle.wickDownColor":
        "#ff4d5e"
    },

    disabled_features: [
      "header_saveload"
    ]
  };

  /*
   * IMPORTANT:
   *
   * The hosted TradingView widget does not provide
   * the same complete low-level save/load interface
   * as the self-hosted Advanced Charts library.
   *
   * We therefore restore/save the chart layout only
   * when the hosted widget exposes those methods.
   */
  if (saved) {

    /*
     * Some TradingView builds expose a saved state
     * through the constructor; unsupported builds simply
     * ignore it.
     */
    options.saved_data =
      saved;
  }

  state.widget =
    new TradingView.widget(
      options
    );

  state.widget.onChartReady(
    () => {

      state.chartReady = true;

      $("loading").classList.add(
        "hidden"
      );

      $("chartStatus").textContent =
        `TradingView chart ready • ${TIMEFRAMES[state.timeframe]}`;

      updateStats();

      restoreTradingViewState();

      installTradingViewAutosave();

      if (
        state.replayPercent < 100
      ) {
        applyReplayPosition();
      }
    }
  );
}

/* ---------------------------------------
   SAVED TRADINGVIEW STATE
--------------------------------------- */

function getSavedChartLayout() {

  try {

    const raw =
      localStorage.getItem(
        storageKey()
      );

    if (!raw) return null;

    const data =
      JSON.parse(raw);

    return data.chartLayout || null;

  } catch {

    return null;
  }
}

async function restoreTradingViewState() {

  if (
    !state.widget ||
    !state.chartReady
  ) return;

  /*
   * If this TradingView integration exposes
   * widget.load(), restore the exact layout.
   */
  if (
    state.savedLayout &&
    typeof state.widget.load === "function"
  ) {

    try {

      await state.widget.load(
        state.savedLayout
      );

    } catch (error) {

      console.warn(
        "TradingView saved layout could not be restored:",
        error
      );
    }
  }
}

function installTradingViewAutosave() {

  if (
    !state.widget ||
    typeof state.widget.save !== "function"
  ) {
    return;
  }

  /*
   * TradingView can notify us when the chart changes.
   * We save after a short delay to avoid writing on
   * every tiny interaction.
   */
  let saveTimer = null;

  const saveNow = () => {

    clearTimeout(saveTimer);

    saveTimer =
      setTimeout(
        async () => {

          try {

            state.savedLayout =
              await state.widget.save();

            saveWorkspace();

          } catch (error) {

            console.warn(
              "TradingView save unavailable:",
              error
            );
          }

        },
        900
      );
  };

  if (
    typeof state.widget.subscribe ===
    "function"
  ) {

    try {

      state.widget.subscribe(
        "drawing",
        saveNow
      );

    } catch {}
  }

  /*
   * Save the current layout when the user
   * presses our Save button.
   */
}

/* ---------------------------------------
   SAVE BUTTON
--------------------------------------- */

async function saveChartAndWorkspace() {

  if (
    state.widget &&
    state.chartReady &&
    typeof state.widget.save === "function"
  ) {

    try {

      state.savedLayout =
        await state.widget.save();

    } catch (error) {

      console.warn(
        "TradingView layout save unavailable:",
        error
      );
    }
  }

  state.journal =
    $("journal").value;

  saveWorkspace();
}

/* ---------------------------------------
   MARKET / TIMEFRAME
--------------------------------------- */

async function changeMarket() {

  stopReplay();

  state.symbol =
    $("symbol").value;

  state.replayPercent = 100;

  localStorage.setItem(
    "strategyPlay.symbol",
    state.symbol
  );

  loadWorkspace();

  updateMarketUI();

  createTradingView();

  syncReplayUI();
}

async function changeTimeframe() {

  stopReplay();

  state.timeframe =
    $("timeframe").value;

  localStorage.setItem(
    "strategyPlay.timeframe",
    state.timeframe
  );

  /*
   * Drawings belong to the TradingView chart layout
   * rather than our old fake per-timeframe drawing layer.
   */
  if (
    state.widget &&
    state.chartReady &&
    typeof state.widget.activeChart ===
    "function"
  ) {

    try {

      const chart =
        state.widget.activeChart();

      if (
        chart &&
        typeof chart.setResolution ===
        "function"
      ) {

        await chart.setResolution(
          state.timeframe
        );

        $("chartStatus").textContent =
          `TradingView • ${TIMEFRAMES[state.timeframe]}`;

        syncReplayUI();

        return;
      }

    } catch (error) {

      console.warn(
        "Could not change TradingView resolution directly:",
        error
      );
    }
  }

  createTradingView();
}

/* ---------------------------------------
   REPLAY
--------------------------------------- */

/*
 * TradingView's hosted widget does not expose
 * TradingView's proprietary Bar Replay engine.
 *
 * Strategy Play therefore uses a controlled historical
 * visible-range replay where supported by the widget.
 *
 * It progressively moves the chart's visible end point
 * through historical bars instead of pretending that
 * future bars have been deleted from TradingView's feed.
 */

function chartApi() {

  if (
    !state.widget ||
    !state.chartReady
  ) return null;

  try {

    if (
      typeof state.widget.activeChart ===
      "function"
    ) {
      return state.widget.activeChart();
    }

  } catch {}

  return null;
}

function setReplayPercent(percent) {

  percent =
    Math.max(
      0,
      Math.min(
        100,
        Number(percent)
      )
    );

  state.replayPercent =
    percent;

  applyReplayPosition();

  syncReplayUI();
}

function applyReplayPosition() {

  const chart =
    chartApi();

  if (!chart) return;

  /*
   * setVisibleRange is available on Advanced
   * Chart interfaces. The hosted widget may or may
   * not expose it, so this is deliberately guarded.
   */
  if (
    typeof chart.getVisibleRange !==
    "function" ||
    typeof chart.setVisibleRange !==
    "function"
  ) {

    return;
  }

  try {

    const current =
      chart.getVisibleRange();

    if (!current) return;

    if (
      state.replayPercent >= 100
    ) {

      return;
    }

    const from =
      Number(current.from);

    const to =
      Number(current.to);

    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      to <= from
    ) {
      return;
    }

    /*
     * We move the right edge backward through
     * the currently visible historical range.
     */
    const total =
      to - from;

    const replayTo =
      from +
      total *
      (state.replayPercent / 100);

    const minimumWindow =
      Math.max(
        total * .65,
        60 * 60
      );

    chart.setVisibleRange({
      from:
        Math.max(
          0,
          replayTo - minimumWindow
        ),
      to:
        replayTo
    });

  } catch (error) {

    console.warn(
      "Replay range unavailable:",
      error
    );
  }
}

function nextReplayStep() {

  if (
    state.replayPercent >= 100
  ) {

    state.replayPercent = 0;

  } else {

    /*
     * Fine-grained manual step.
     */
    state.replayPercent += 1;
  }

  applyReplayPosition();
  syncReplayUI();
}

function playReplay() {

  if (state.replayPlaying) {
    return;
  }

  state.replayPlaying = true;

  $("playBtn").textContent =
    "▶ Playing";

  state.replayTimer =
    setInterval(
      () => {

        if (
          state.replayPercent >= 100
        ) {

          stopReplay();

          return;
        }

        /*
         * Faster speed = larger historical jumps.
         */
        state.replayPercent +=
          state.speed;

        state.replayPercent =
          Math.min(
            100,
            state.replayPercent
          );

        applyReplayPosition();
        syncReplayUI();

      },
      900
    );
}

function stopReplay() {

  state.replayPlaying =
    false;

  clearInterval(
    state.replayTimer
  );

  state.replayTimer =
    null;

  if ($("playBtn")) {

    $("playBtn").textContent =
      "▶ Play";
  }
}

function syncReplayUI() {

  const percent =
    state.replayPercent;

  $("replayRange").value =
    percent;

  $("replayRangeBottom").value =
    percent;

  if (
    percent >= 100
  ) {

    $("replayState").textContent =
      "Live chart";

    $("candleCounter").textContent =
      "Replay position: live";

    $("bottomReplayText").textContent =
      "Live";

  } else {

    $("replayState").textContent =
      "Historical replay";

    $("candleCounter").textContent =
      `Replay position: ${percent}%`;

    $("bottomReplayText").textContent =
      `${percent}%`;
  }
}

/* ---------------------------------------
   MANUAL TRADES
--------------------------------------- */

function recordTrade() {

  const entry =
    Number(
      $("entry").value
    );

  const sl =
    Number(
      $("sl").value
    );

  const tp =
    Number(
      $("tp").value
    );

  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(sl) ||
    !Number.isFinite(tp)
  ) {

    alert(
      "Enter Entry, Stop Loss and Take Profit."
    );

    return;
  }

  state.trades.push({

    id:
      crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,

    market:
      state.symbol,

    timeframe:
      state.timeframe,

    entry,
    sl,
    tp,

    note:
      $("tradeNote").value.trim(),

    createdAt:
      new Date().toISOString()
  });

  $("entry").value = "";
  $("sl").value = "";
  $("tp").value = "";
  $("tradeNote").value = "";

  saveChartAndWorkspace();

  updateStats();
}

/* ---------------------------------------
   EVENTS
--------------------------------------- */

$("symbol").addEventListener(
  "change",
  changeMarket
);

$("timeframe").addEventListener(
  "change",
  changeTimeframe
);

$("saveBtn").addEventListener(
  "click",
  saveChartAndWorkspace
);

$("resetBtn").addEventListener(
  "click",
  () => {

    if (
      state.widget &&
      state.chartReady &&
      typeof state.widget.activeChart ===
      "function"
    ) {

      try {

        const chart =
          state.widget.activeChart();

        if (
          chart &&
          typeof chart.executeActionById ===
          "function"
        ) {

          chart.executeActionById(
            "chartReset"
          );
        }

      } catch {}
    }

    state.replayPercent = 100;

    syncReplayUI();
  }
);

$("fitBtn").addEventListener(
  "click",
  () => {

    const chart =
      chartApi();

    if (!chart) return;

    try {

      if (
        typeof chart.executeActionById ===
        "function"
      ) {

        chart.executeActionById(
          "chartReset"
        );

      }

    } catch {}
  }
);

$("clearDrawings").addEventListener(
  "click",
  () => {

    if (
      !confirm(
        "Clear all TradingView drawings from this chart?"
      )
    ) {
      return;
    }

    const chart =
      chartApi();

    if (!chart) return;

    try {

      if (
        typeof chart.removeAllShapes ===
        "function"
      ) {

        chart.removeAllShapes();

      }

      /*
       * Save after clearing.
       */
      setTimeout(
        saveChartAndWorkspace,
        300
      );

    } catch (error) {

      console.warn(
        "Could not clear TradingView drawings:",
        error
      );
    }
  }
);

$("recordTrade").addEventListener(
  "click",
  recordTrade
);

$("playBtn").addEventListener(
  "click",
  playReplay
);

$("pauseBtn").addEventListener(
  "click",
  stopReplay
);

$("nextBtn").addEventListener(
  "click",
  nextReplayStep
);

$("speed").addEventListener(
  "input",
  e => {

    state.speed =
      Number(e.target.value);

    $("speedValue").textContent =
      `${state.speed}x`;

    if (
      state.replayPlaying
    ) {

      stopReplay();
      playReplay();
    }
  }
);

$("replayRange").addEventListener(
  "input",
  e => {

    stopReplay();

    setReplayPercent(
      e.target.value
    );
  }
);

$("replayRangeBottom").addEventListener(
  "input",
  e => {

    stopReplay();

    setReplayPercent(
      e.target.value
    );
  }
);

$("journal").addEventListener(
  "input",
  () => {

    $("saveStatus").textContent =
      "Unsaved";

    clearTimeout(
      window.strategyPlayJournalTimer
    );

    window.strategyPlayJournalTimer =
      setTimeout(
        saveChartAndWorkspace,
        700
      );
  }
);

$("mobileMenu").addEventListener(
  "click",
  () => {

    $("sidebar").classList.toggle(
      "open"
    );
  }
);

/* ---------------------------------------
   INITIALISE
--------------------------------------- */

function init() {

  updateMarketUI();

  loadWorkspace();

  syncReplayUI();

  /*
   * Wait until TradingView's hosted script
   * has loaded.
   */
  createTradingView();
}

window.addEventListener(
  "beforeunload",
  () => {

    stopReplay();

    /*
     * Best-effort local journal save.
     */
    try {

      state.journal =
        $("journal").value;

      saveWorkspace();

    } catch {}
  }
);

init();
