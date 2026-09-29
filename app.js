// ============================================================
// STRATEGY PLAY
// TradingView chart + manual replay + journal + trade records
// ============================================================

const MARKETS = {
  BTCUSDT: {
    name: "Bitcoin / USDT",
    tvSymbol: "BINANCE:BTCUSDT"
  },

  XAUUSD: {
    name: "Gold / USD",
    tvSymbol: "OANDA:XAUUSD"
  },

  GBPJPY: {
    name: "GBP / JPY",
    tvSymbol: "OANDA:GBPJPY"
  },

  EURUSD: {
    name: "EUR / USD",
    tvSymbol: "OANDA:EURUSD"
  }
};

const TIMEFRAMES = {
  "1": "1",
  "5": "5",
  "15": "15",
  "30": "30",
  "60": "60",
  "240": "240",
  "D": "D",
  "W": "W"
};

const STORAGE_KEY = "strategy_play_workspace_v1";

let tvWidget = null;
let tvReady = false;
let replayTimer = null;
let replayPosition = 100;
let replaySpeed = 1;


// ============================================================
// DOM
// ============================================================

const $ = (id) => document.getElementById(id);

const symbolSelect = $("symbol");
const timeframeSelect = $("timeframe");

const pairTitle = $("pairTitle");
const chartStatus = $("chartStatus");
const loading = $("loading");

const mobileMenu = $("mobileMenu");
const sidebar = $("sidebar");

const saveBtn = $("saveBtn");
const resetBtn = $("resetBtn");
const fitBtn = $("fitBtn");
const clearDrawingsBtn = $("clearDrawings");

const playBtn = $("playBtn");
const pauseBtn = $("pauseBtn");
const nextBtn = $("nextBtn");

const speedSlider = $("speed");
const speedValue = $("speedValue");

const replayRange = $("replayRange");
const replayRangeBottom = $("replayRangeBottom");

const replayState = $("replayState");
const candleCounter = $("candleCounter");
const bottomReplayText = $("bottomReplayText");

const entryInput = $("entry");
const slInput = $("sl");
const tpInput = $("tp");
const tradeNoteInput = $("tradeNote");
const recordTradeBtn = $("recordTrade");

const tradeCount = $("tradeCount");
const saveStatus = $("saveStatus");

const journal = $("journal");


// ============================================================
// WORKSPACE STATE
// ============================================================

function defaultWorkspace() {
  return {
    symbol: "BTCUSDT",
    timeframe: "60",

    trades: [],

    journal: "",

    replay: {
      position: 100,
      speed: 1
    }
  };
}

let workspace = loadWorkspace();


// ============================================================
// STORAGE
// ============================================================

function loadWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return defaultWorkspace();
    }

    const saved = JSON.parse(raw);

    return {
      ...defaultWorkspace(),
      ...saved,
      replay: {
        ...defaultWorkspace().replay,
        ...(saved.replay || {})
      },
      trades: Array.isArray(saved.trades)
        ? saved.trades
        : []
    };
  } catch (error) {
    console.error("Could not load workspace:", error);
    return defaultWorkspace();
  }
}


function saveWorkspace(message = "Saved") {
  workspace.symbol = symbolSelect.value;
  workspace.timeframe = timeframeSelect.value;

  workspace.replay.position = replayPosition;
  workspace.replay.speed = replaySpeed;

  workspace.journal = journal.value;

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(workspace)
    );

    setSaveStatus(message);
  } catch (error) {
    console.error("Could not save workspace:", error);
    setSaveStatus("Save failed");
  }
}


function setSaveStatus(message) {
  if (saveStatus) {
    saveStatus.textContent = message;
  }
}


// ============================================================
// UI
// ============================================================

function updatePairTitle() {
  const market = MARKETS[symbolSelect.value];

  if (pairTitle && market) {
    pairTitle.textContent = market.name;
  }
}


function updateTradeCount() {
  if (tradeCount) {
    tradeCount.textContent = String(
      workspace.trades.length
    );
  }
}


function updateReplayUI() {
  const value = Math.max(
    0,
    Math.min(100, Number(replayPosition) || 100)
  );

  if (replayRange) {
    replayRange.value = String(value);
  }

  if (replayRangeBottom) {
    replayRangeBottom.value = String(value);
  }

  if (value >= 100) {
    if (replayState) {
      replayState.textContent = "Live chart";
    }

    if (candleCounter) {
      candleCounter.textContent = "Replay position: live";
    }

    if (bottomReplayText) {
      bottomReplayText.textContent = "Live";
    }

    return;
  }

  if (replayState) {
    replayState.textContent = "Replay mode";
  }

  if (candleCounter) {
    candleCounter.textContent =
      `Replay position: ${Math.round(value)}%`;
  }

  if (bottomReplayText) {
    bottomReplayText.textContent =
      `${Math.round(value)}%`;
  }
}


function updateSpeedUI() {
  if (speedValue) {
    speedValue.textContent = `${replaySpeed}x`;
  }
}


// ============================================================
// TRADINGVIEW LOADING
// ============================================================

function setChartLoading(message = "Loading TradingView…") {
  if (loading) {
    loading.style.display = "flex";
    loading.textContent = message;
  }

  if (chartStatus) {
    chartStatus.textContent = message;
  }
}


function setChartLoaded() {
  if (loading) {
    loading.style.display = "none";
  }

  if (chartStatus) {
    chartStatus.textContent =
      "TradingView chart ready";
  }
}


function setChartError(message) {
  if (loading) {
    loading.style.display = "flex";
    loading.textContent = message;
  }

  if (chartStatus) {
    chartStatus.textContent = message;
  }
}


function tradingViewScriptAvailable() {
  return (
    typeof window.TradingView !== "undefined" &&
    typeof window.TradingView.widget === "function"
  );
}


function waitForTradingView(timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (tradingViewScriptAvailable()) {
      resolve();
      return;
    }

    const started = Date.now();

    const timer = setInterval(() => {
      if (tradingViewScriptAvailable()) {
        clearInterval(timer);
        resolve();
        return;
      }

      if (Date.now() - started >= timeout) {
        clearInterval(timer);

        reject(
          new Error(
            "TradingView library did not load."
          )
        );
      }
    }, 100);
  });
}


// ============================================================
// CREATE TRADINGVIEW
// ============================================================

async function createTradingViewChart() {
  stopReplay();

  tvReady = false;

  setChartLoading(
    "Connecting to TradingView…"
  );

  const market =
    MARKETS[symbolSelect.value];

  const interval =
    TIMEFRAMES[timeframeSelect.value] || "60";

  if (!market) {
    setChartError(
      "Market configuration error."
    );
    return;
  }

  try {
    await waitForTradingView();

    setChartLoading(
      "TradingView is loading the chart…"
    );

    const container =
      document.getElementById(
        "tradingview_chart"
      );

    if (!container) {
      throw new Error(
        "TradingView chart container not found."
      );
    }

    /*
      Important:
      Do not reuse an old widget instance.

      The container is cleared before creating
      a new TradingView widget.
    */
    container.innerHTML = "";

    tvWidget = new window.TradingView.widget({
      autosize: true,

      symbol: market.tvSymbol,

      interval: interval,

      timezone: "Etc/UTC",

      theme: "dark",

      style: "1",

      locale: "en",

      toolbar_bg: "#030403",

      enable_publishing: false,

      allow_symbol_change: true,

      hide_top_toolbar: false,

      hide_legend: false,

      hide_side_toolbar: false,

      withdateranges: true,

      save_image: false,

      container_id: "tradingview_chart",

      /*
        Keep the normal TradingView toolbar.
        We are intentionally NOT replacing it
        with fake/custom drawing buttons.
      */

      studies: [],

      /*
        SmartFS / Strategy Play inspired styling.
      */
      overrides: {
        "paneProperties.background": "#030403",
        "paneProperties.backgroundType": "solid",

        "paneProperties.vertGridProperties.color":
          "#101410",

        "paneProperties.horzGridProperties.color":
          "#101410",

        "scalesProperties.textColor":
          "#A8B0A4",

        "scalesProperties.lineColor":
          "#252B25",

        "mainSeriesProperties.candleStyle.upColor":
          "#8FD400",

        "mainSeriesProperties.candleStyle.downColor":
          "#F04F5F",

        "mainSeriesProperties.candleStyle.borderUpColor":
          "#8FD400",

        "mainSeriesProperties.candleStyle.borderDownColor":
          "#F04F5F",

        "mainSeriesProperties.candleStyle.wickUpColor":
          "#8FD400",

        "mainSeriesProperties.candleStyle.wickDownColor":
          "#F04F5F"
      }
    });

    /*
      Modern TradingView API.
      Wait until the chart is actually ready
      before touching chart methods.
    */

    if (
      tvWidget &&
      typeof tvWidget.chartReady === "function"
    ) {
      await tvWidget.chartReady();

      tvReady = true;

      setChartLoaded();

      console.log(
        "Strategy Play: TradingView chart ready."
      );

      afterChartReady();

      return;
    }

    /*
      Compatibility fallback for older widget builds.
    */

    if (
      tvWidget &&
      typeof tvWidget.onChartReady === "function"
    ) {
      tvWidget.onChartReady(() => {
        tvReady = true;

        setChartLoaded();

        console.log(
          "Strategy Play: TradingView chart ready."
        );

        afterChartReady();
      });

      return;
    }

    /*
      If TradingView created the widget but exposes
      neither readiness method, don't leave the user
      staring at an infinite loading message.
    */

    setTimeout(() => {
      if (!tvReady) {
        tvReady = true;

        setChartLoaded();

        console.warn(
          "TradingView loaded without a detectable ready callback."
        );

        afterChartReady();
      }
    }, 3000);

  } catch (error) {
    console.error(
      "TradingView initialization failed:",
      error
    );

    tvReady = false;

    setChartError(
      "TradingView could not load. Check your connection and refresh."
    );
  }
}


// ============================================================
// AFTER CHART READY
// ============================================================

function afterChartReady() {
  updateReplayUI();

  /*
    We intentionally do not call advanced chart APIs
    unless they actually exist.
  */

  if (
    tvWidget &&
    typeof tvWidget.subscribe === "function"
  ) {
    try {
      tvWidget.subscribe(
        "layout_changed",
        () => {
          saveWorkspace("Chart changed");
        }
      );
    } catch (error) {
      console.warn(
        "TradingView layout subscription unavailable:",
        error
      );
    }
  }
}


// ============================================================
// CHANGE SYMBOL / TIMEFRAME
// ============================================================

function changeChart() {
  updatePairTitle();

  replayPosition = 100;

  updateReplayUI();

  createTradingViewChart();

  saveWorkspace("Chart changed");
}


// ============================================================
// SAFE ACTIVE CHART
// ============================================================

function getActiveChart() {
  if (!tvWidget || !tvReady) {
    return null;
  }

  try {
    if (
      typeof tvWidget.activeChart === "function"
    ) {
      return tvWidget.activeChart();
    }
  } catch (error) {
    console.warn(
      "Could not access active TradingView chart:",
      error
    );
  }

  return null;
}


// ============================================================
// FIT CHART
// ============================================================

function fitChart() {
  const chart = getActiveChart();

  if (!chart) {
    return;
  }

  try {
    if (
      typeof chart.executeActionById ===
      "function"
    ) {
      chart.executeActionById("chartReset");
      return;
    }
  } catch (error) {
    console.warn(
      "TradingView chart reset unavailable:",
      error
    );
  }
}


// ============================================================
// CLEAR DRAWINGS
// ============================================================

function clearDrawings() {
  const chart = getActiveChart();

  if (!chart) {
    return;
  }

  try {
    if (
      typeof chart.removeAllShapes ===
      "function"
    ) {
      chart.removeAllShapes();

      setSaveStatus("Drawings cleared");

      return;
    }

    /*
      If this API is not available, don't pretend
      that we cleared TradingView drawings.
    */

    setSaveStatus(
      "Use TradingView's drawing tools to remove drawings"
    );

  } catch (error) {
    console.warn(
      "Could not clear TradingView drawings:",
      error
    );

    setSaveStatus(
      "Drawing clear unavailable"
    );
  }
}


// ============================================================
// REPLAY
// ============================================================

function setReplayPosition(value) {
  let numeric =
    Number(value);

  if (!Number.isFinite(numeric)) {
    numeric = 100;
  }

  numeric = Math.max(
    0,
    Math.min(100, numeric)
  );

  replayPosition = numeric;

  updateReplayUI();

  applyReplayPosition();
}


function applyReplayPosition() {
  const chart = getActiveChart();

  if (!chart) {
    return;
  }

  /*
    This is intentionally a best-effort manual
    visible-range replay.

    It is NOT TradingView's proprietary Bar Replay.
  */

  try {
    if (
      typeof chart.getVisibleRange !==
      "function" ||
      typeof chart.setVisibleRange !==
      "function"
    ) {
      return;
    }

    const current =
      chart.getVisibleRange();

    if (!current) {
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

    if (replayPosition >= 100) {
      return;
    }

    /*
      Move the right side of the visible range
      backward according to replay percentage.
    */

    const span = to - from;

    const shift =
      span *
      ((100 - replayPosition) / 100);

    const newTo = to - shift;
    const newFrom = newTo - span;

    chart.setVisibleRange({
      from: Math.max(0, newFrom),
      to: Math.max(1, newTo)
    });

  } catch (error) {
    console.warn(
      "Replay range unavailable:",
      error
    );
  }
}


function nextReplayStep() {
  const current =
    Number(replayPosition);

  if (
    !Number.isFinite(current)
  ) {
    replayPosition = 0;
  } else {
    replayPosition =
      Math.min(
        100,
        current + 1
      );
  }

  updateReplayUI();

  applyReplayPosition();

  saveWorkspace("Replay position saved");
}


function startReplay() {
  if (replayTimer) {
    return;
  }

  if (replayPosition >= 100) {
    replayPosition = 0;
  }

  updateReplayUI();

  /*
    Higher speed = faster replay.
  */

  const delay =
    Math.max(
      150,
      1000 / replaySpeed
    );

  replayTimer = setInterval(() => {
    if (replayPosition >= 100) {
      stopReplay();
      return;
    }

    nextReplayStep();

  }, delay);

  if (replayState) {
    replayState.textContent =
      "Replay playing";
  }
}


function stopReplay() {
  if (replayTimer) {
    clearInterval(replayTimer);
    replayTimer = null;
  }

  updateReplayUI();
}


// ============================================================
// TRADE RECORDING
// ============================================================

function recordTrade() {
  const entry =
    Number(entryInput?.value);

  const sl =
    Number(slInput?.value);

  const tp =
    Number(tpInput?.value);

  const note =
    tradeNoteInput?.value.trim() || "";

  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(sl) ||
    !Number.isFinite(tp)
  ) {
    setSaveStatus(
      "Enter valid Entry, SL and TP"
    );

    return;
  }

  const market =
    MARKETS[symbolSelect.value];

  const trade = {
    id:
      Date.now(),

    symbol:
      symbolSelect.value,

    symbolName:
      market?.name || symbolSelect.value,

    timeframe:
      timeframeSelect.value,

    entry,
    sl,
    tp,

    note,

    createdAt:
      new Date().toISOString()
  };

  workspace.trades.unshift(trade);

  updateTradeCount();

  saveWorkspace("Trade recorded");

  if (entryInput) entryInput.value = "";
  if (slInput) slInput.value = "";
  if (tpInput) tpInput.value = "";
  if (tradeNoteInput) tradeNoteInput.value = "";
}


// ============================================================
// RESET
// ============================================================

function resetWorkspace() {
  const confirmed =
    window.confirm(
      "Reset Strategy Play workspace? Your saved manual trades and journal will be removed."
    );

  if (!confirmed) {
    return;
  }

  stopReplay();

  workspace =
    defaultWorkspace();

  replayPosition =
    workspace.replay.position;

  replaySpeed =
    workspace.replay.speed;

  symbolSelect.value =
    workspace.symbol;

  timeframeSelect.value =
    workspace.timeframe;

  journal.value =
    workspace.journal;

  updatePairTitle();
  updateTradeCount();
  updateSpeedUI();
  updateReplayUI();

  localStorage.removeItem(
    STORAGE_KEY
  );

  createTradingViewChart();

  setSaveStatus("Workspace reset");
}


// ============================================================
// MOBILE MENU
// ============================================================

function toggleMobileMenu() {
  if (!sidebar) {
    return;
  }

  sidebar.classList.toggle(
    "open"
  );
}


// ============================================================
// EVENT LISTENERS
// ============================================================

if (symbolSelect) {
  symbolSelect.addEventListener(
    "change",
    changeChart
  );
}

if (timeframeSelect) {
  timeframeSelect.addEventListener(
    "change",
    changeChart
  );
}

if (saveBtn) {
  saveBtn.addEventListener(
    "click",
    () => {
      saveWorkspace("Saved");
    }
  );
}

if (resetBtn) {
  resetBtn.addEventListener(
    "click",
    resetWorkspace
  );
}

if (fitBtn) {
  fitBtn.addEventListener(
    "click",
    fitChart
  );
}

if (clearDrawingsBtn) {
  clearDrawingsBtn.addEventListener(
    "click",
    clearDrawings
  );
}

if (playBtn) {
  playBtn.addEventListener(
    "click",
    startReplay
  );
}

if (pauseBtn) {
  pauseBtn.addEventListener(
    "click",
    stopReplay
  );
}

if (nextBtn) {
  nextBtn.addEventListener(
    "click",
    nextReplayStep
  );
}

if (speedSlider) {
  speedSlider.addEventListener(
    "input",
    () => {
      replaySpeed =
        Number(speedSlider.value) || 1;

      updateSpeedUI();

      /*
        Restart the timer with the new speed
        if replay is currently running.
      */

      if (replayTimer) {
        stopReplay();
        startReplay();
      }

      saveWorkspace("Speed saved");
    }
  );
}

if (replayRange) {
  replayRange.addEventListener(
    "input",
    () => {
      setReplayPosition(
        replayRange.value
      );
    }
  );
}

if (replayRangeBottom) {
  replayRangeBottom.addEventListener(
    "input",
    () => {
      setReplayPosition(
        replayRangeBottom.value
      );
    }
  );
}

if (recordTradeBtn) {
  recordTradeBtn.addEventListener(
    "click",
    recordTrade
  );
}

if (journal) {
  journal.addEventListener(
    "input",
    () => {
      workspace.journal =
        journal.value;

      saveWorkspace("Journal saved");
   
