// ============================================================
// STRATEGY PLAY
// TradingView official Advanced Chart widget
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


const STORAGE_KEY =
  "strategy_play_workspace_v2";


let replayTimer = null;
let replayPosition = 100;
let replaySpeed = 1;


// ============================================================
// DOM
// ============================================================

const $ = (id) =>
  document.getElementById(id);


const symbolSelect =
  $("symbol");

const timeframeSelect =
  $("timeframe");

const pairTitle =
  $("pairTitle");

const chartStatus =
  $("chartStatus");

const loading =
  $("loading");

const chartContainer =
  $("tradingview_chart");

const sidebar =
  $("sidebar");

const mobileMenu =
  $("mobileMenu");

const saveBtn =
  $("saveBtn");

const resetBtn =
  $("resetBtn");

const playBtn =
  $("playBtn");

const pauseBtn =
  $("pauseBtn");

const nextBtn =
  $("nextBtn");

const speedSlider =
  $("speed");

const speedValue =
  $("speedValue");

const replayRange =
  $("replayRange");

const replayRangeBottom =
  $("replayRangeBottom");

const replayState =
  $("replayState");

const candleCounter =
  $("candleCounter");

const bottomReplayText =
  $("bottomReplayText");

const entryInput =
  $("entry");

const slInput =
  $("sl");

const tpInput =
  $("tp");

const tradeNoteInput =
  $("tradeNote");

const recordTradeBtn =
  $("recordTrade");

const tradeCount =
  $("tradeCount");

const saveStatus =
  $("saveStatus");

const journal =
  $("journal");


// ============================================================
// WORKSPACE
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


function loadWorkspace() {

  try {

    const raw =
      localStorage.getItem(
        STORAGE_KEY
      );

    if (!raw) {

      return defaultWorkspace();

    }

    const saved =
      JSON.parse(raw);

    const defaults =
      defaultWorkspace();

    return {

      ...defaults,

      ...saved,

      replay: {

        ...defaults.replay,

        ...(saved.replay || {})

      },

      trades:
        Array.isArray(saved.trades)
          ? saved.trades
          : []

    };

  } catch (error) {

    console.error(
      "Workspace load failed:",
      error
    );

    return defaultWorkspace();

  }

}


let workspace =
  loadWorkspace();


// ============================================================
// SAVE
// ============================================================

function saveWorkspace(
  message = "Saved"
) {

  workspace.symbol =
    symbolSelect.value;

  workspace.timeframe =
    timeframeSelect.value;

  workspace.journal =
    journal.value;

  workspace.replay.position =
    replayPosition;

  workspace.replay.speed =
    replaySpeed;

  try {

    localStorage.setItem(

      STORAGE_KEY,

      JSON.stringify(workspace)

    );

    setSaveStatus(message);

  } catch (error) {

    console.error(
      "Workspace save failed:",
      error
    );

    setSaveStatus(
      "Save failed"
    );

  }

}


function setSaveStatus(message) {

  if (saveStatus) {

    saveStatus.textContent =
      message;

  }

}


// ============================================================
// UI
// ============================================================

function updatePairTitle() {

  const market =
    MARKETS[
      symbolSelect.value
    ];

  if (
    market &&
    pairTitle
  ) {

    pairTitle.textContent =
      market.name;

  }

}


function updateTradeCount() {

  if (tradeCount) {

    tradeCount.textContent =
      String(
        workspace.trades.length
      );

  }

}


function updateSpeedUI() {

  if (speedValue) {

    speedValue.textContent =
      `${replaySpeed}x`;

  }

}


function updateReplayUI() {

  const value =
    Math.max(
      0,
      Math.min(
        100,
        Number(replayPosition) || 100
      )
    );


  if (replayRange) {

    replayRange.value =
      String(value);

  }


  if (replayRangeBottom) {

    replayRangeBottom.value =
      String(value);

  }


  if (value >= 100) {

    if (replayState) {

      replayState.textContent =
        "Live chart";

    }

    if (candleCounter) {

      candleCounter.textContent =
        "Replay position: live";

    }

    if (bottomReplayText) {

      bottomReplayText.textContent =
        "Live";

    }

    return;

  }


  if (replayState) {

    replayState.textContent =
      "Replay mode";

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


// ============================================================
// TRADINGVIEW OFFICIAL WIDGET
// ============================================================

function clearTradingView() {

  if (!chartContainer) {

    return;

  }

  chartContainer.innerHTML = "";

}


function createTradingViewChart() {

  clearTradingView();

  if (!chartContainer) {

    return;

  }


  const market =
    MARKETS[
      symbolSelect.value
    ];

  const interval =
    TIMEFRAMES[
      timeframeSelect.value
    ] || "60";


  if (!market) {

    showChartError(
      "Market configuration error."
    );

    return;

  }


  showChartLoading(
    "Loading TradingView…"
  );


  /*
    This is TradingView's current official
    Advanced Chart widget embed.

    It is NOT the old tv.js constructor.
  */

  const wrapper =
    document.createElement(
      "div"
    );

  wrapper.className =
    "tradingview-widget-container";


  wrapper.style.width =
    "100%";

  wrapper.style.height =
    "100%";


  const widget =
    document.createElement(
      "div"
    );

  widget.className =
    "tradingview-widget-container__widget";


  widget.style.width =
    "100%";

  widget.style.height =
    "100%";


  wrapper.appendChild(
    widget
  );


  const script =
    document.createElement(
      "script"
    );

  script.type =
    "text/javascript";

  script.src =
    "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

  script.async =
    true;


  const configuration = {

    autosize: true,

    symbol:
      market.tvSymbol,

    interval:
      interval,

    timezone:
      "Etc/UTC",

    theme:
      "dark",

    backgroundColor:
      "#030403",

    gridColor:
      "rgba(30, 40, 28, 0.35)",

    style:
      "1",

    locale:
      "en",

    allow_symbol_change:
      true,

    hide_top_toolbar:
      false,

    hide_side_toolbar:
      false,

    hide_legend:
      false,

    hide_volume:
      false,

    withdateranges:
      true,

    save_image:
      false,

    calendar:
      false,

    studies:
      [],

    support_host:
      "https://www.tradingview.com"

  };


  /*
    TradingView's embed script reads its
    configuration from the script contents.
  */

  script.textContent =
    JSON.stringify(
      configuration
    );


  chartContainer.appendChild(
    wrapper
  );

  wrapper.appendChild(
    script
  );


  /*
    The official widget creates its chart
    inside an iframe.

    Wait for that iframe instead of waiting
    for the old tv.js API.
  */

  waitForTradingViewFrame();

}


function waitForTradingViewFrame() {

  let attempts = 0;

  const maxAttempts =
    150;


  const timer =
    setInterval(() => {

      attempts += 1;


      const iframe =
        chartContainer
          ?.querySelector(
            "iframe"
          );


      if (iframe) {

        clearInterval(timer);

        iframe.addEventListener(
          "load",
          () => {

            showChartReady();

          },
          {
            once: true
          }
        );


        /*
          Some browsers may already have
          completed the iframe load before
          our listener was attached.
        */

        setTimeout(() => {

          showChartReady();

        }, 2500);


        return;

      }


      if (
        attempts >=
        maxAttempts
      ) {

        clearInterval(timer);

        showChartError(

          "TradingView did not create the chart. Refresh the page and try again."

        );

      }

    }, 100);

}


function showChartLoading(
  message
) {

  if (loading) {

    loading.style.display =
      "grid";

    loading.textContent =
      message;

  }


  if (chartStatus) {

    chartStatus.textContent =
      message;

  }

}


function showChartReady() {

  if (loading) {

    loading.style.display =
      "none";

  }


  if (chartStatus) {

    chartStatus.textContent =
      "TradingView chart ready";

  }

}


function showChartError(
  message
) {

  if (loading) {

    loading.style.display =
      "grid";

    loading.textContent =
      message;

  }


  if (chartStatus) {

    chartStatus.textContent =
      message;

  }

}


// ============================================================
// MARKET / TIMEFRAME
// ============================================================

function changeChart() {

  stopReplay();

  replayPosition =
    100;

  updatePairTitle();

  updateReplayUI();

  createTradingViewChart();

  saveWorkspace(
    "Chart changed"
  );

}


// ============================================================
// REPLAY
// ============================================================

function setReplayPosition(
  value
) {

  let numeric =
    Number(value);


  if (
    !Number.isFinite(
      numeric
    )
  ) {

    numeric = 100;

  }


  replayPosition =
    Math.max(
      0,
      Math.min(
        100,
        numeric
      )
    );


  updateReplayUI();

  saveWorkspace(
    "Replay position saved"
  );

}


function nextReplayStep() {

  replayPosition =
    Math.min(
      100,
      replayPosition + 1
    );


  updateReplayUI();

  saveWorkspace(
    "Replay position saved"
  );

}


function startReplay() {

  if (replayTimer) {

    return;

  }


  if (
    replayPosition >= 100
  ) {

    replayPosition =
      0;

  }


  updateReplayUI();


  const delay =
    Math.max(
      150,
      1000 / replaySpeed
    );


  replayTimer =
    setInterval(() => {

      if (
        replayPosition >=
        100
      ) {

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

    clearInterval(
      replayTimer
    );

    replayTimer =
      null;

  }


  updateReplayUI();

}


// ============================================================
// MANUAL TRADES
// ============================================================

function recordTrade() {

  const entry =
    Number(
      entryInput?.value
    );

  const sl =
    Number(
      slInput?.value
    );

  const tp =
    Number(
      tpInput?.value
    );

  const note =
    tradeNoteInput
      ?.value
      .trim() || "";


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
    MARKETS[
      symbolSelect.value
    ];


  workspace.trades.unshift({

    id:
      Date.now(),

    symbol:
      symbolSelect.value,

    symbolName:
      market?.name ||
      symbolSelect.value,

    timeframe:
      timeframeSelect.value,

    entry,

    sl,

    tp,

    note,

    createdAt:
      new Date()
        .toISOString()

  });


  updateTradeCount();

  saveWorkspace(
    "Trade recorded"
  );


  if (entryInput) {

    entryInput.value =
      "";

  }


  if (slInput) {

    slInput.value =
      "";

  }


  if (tpInput) {

    tpInput.value =
      "";

  }


  if (tradeNoteInput) {

    tradeNoteInput.value =
      "";

  }

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
    100;

  replaySpeed =
    1;


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


  setSaveStatus(
    "Workspace reset"
  );

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
// EVENTS
// ============================================================

symbolSelect?.addEventListener(
  "change",
  changeChart
);


timeframeSelect?.addEventListener(
  "change",
  changeChart
);


saveBtn?.addEventListener(
  "click",
  () => {

    saveWorkspace(
      "Saved"
    );

  }
);


resetBtn?.addEventListener(
  "click",
  resetWorkspace
);


mobileMenu?.addEventListener(
  "click",
  toggleMobileMenu
);


playBtn?.addEventListener(
  "click",
  startReplay
);


pauseBtn?.addEventListener(
  "click",
  stopReplay
);


nextBtn?.addEventListener(
  "click",
  nextReplayStep
);


speedSlider?.addEventListener(
  "input",
  () => {

    replaySpeed =
      Number(
        speedSlider.value
      ) || 1;


    updateSpeedUI();


    if (replayTimer) {

      stopReplay();

      startReplay();

    }


    saveWorkspace(
      "Speed saved"
    );

  }
);


replayRange?.addEventListener(
  "input",
  () => {

    setReplayPosition(
      replayRange.value
    );

  }
);


replayRangeBottom?.addEventListener(
  "input",
  () => {

    setReplayPosition(
      replayRangeBottom.value
    );

  }
);


recordTradeBtn?.addEventListener(
  "click",
  recordTrade
);


journal?.addEventListener(
  "input",
  () => {

    workspace.journal =
      journal.value;

    saveWorkspace(
      "Journal saved"
    );

  }
);


// ============================================================
// INITIALIZE
// ============================================================

function initialize() {

  symbolSelect.value =
    workspace.symbol ||
    "BTCUSDT";


  timeframeSelect.value =
    workspace.timeframe ||
    "60";


  replayPosition =
    Number(
      workspace.replay?.position
    ) || 100;


  replaySpeed =
    Number(
      workspace.replay?.speed
    ) || 1;


  journal.value =
    workspace.journal ||
    "";


  updatePairTitle();

  updateTradeCount();

  updateSpeedUI();

  updateReplayUI();


  /*
    Give the browser a moment to establish
    the chart container dimensions before
    injecting TradingView.
  */

  requestAnimationFrame(() => {

    setTimeout(() => {

      createTradingViewChart();

    }, 100);

  });

}


initialize();
