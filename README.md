# Strategy Play V1

Manual historical trading/replay workspace. No bot, no automatic strategy analysis, and no SmartFX dependency.

## Included
- Responsive black/green trading-terminal UI
- Historical crypto candles from Binance public API
- Symbol/timeframe selection
- Play, Pause, Next Candle and replay slider
- Crosshair
- Trendline, horizontal level, zone, Fibonacci and text tools
- Manual Entry / SL / TP records
- Analysis journal
- Per-symbol/timeframe browser persistence using localStorage
- Static-site deployment; no app.py or Python server

## Render
Create a **Static Site** from this repository. Build command: leave empty. Publish directory: `.`. No start command.

## Important V1 note
This first package stores your work in the browser. It does not yet use a cloud database. That keeps the first deployment entirely dashboard/browser-based and separate from SmartFX. A database can be added later for cross-device persistence without introducing a bot or strategy engine.
