const EXPECTED_TICKERS = ["AAPL", "MSFT", "GOOGL"];
const REFRESH_DELAY_MS = 90_000;

const records = [];
const attempts = [];

let cycleNumber = 0;
let successfulCycles = 0;
let paused = false;
let inFlight = false;
let timerId = null;

// Find the elements defined in stocks.html.
const tableBody = document.getElementById("stock-history");
const statusText = document.getElementById("stock-status");
const scheduleText = document.getElementById("stock-schedule");
const countsText = document.getElementById("stock-counts");
const windowText = document.getElementById("stock-window");
const errorText = document.getElementById("stock-errors");

const pauseButton = document.getElementById("pause-button");
const downloadButton = document.getElementById("download-button");


// ---------- Formatting and validation ----------

function formatUtc(value) {
  return new Date(value)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

function signedNumber(value) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return sign + Math.abs(value).toFixed(2);
}

function isValidDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function isValidStock(stock) {
  if (!stock || !EXPECTED_TICKERS.includes(stock.ticker)) {
    return false;
  }

  const numericFields = [
    "latest_price",
    "previous_close",
    "change",
    "percent_change"
  ];

  return (
    stock.currency === "USD" &&
    numericFields.every(field => Number.isFinite(stock[field])) &&
    stock.latest_price > 0 &&
    stock.previous_close > 0 &&
    isValidDate(stock.latest_date) &&
    isValidDate(stock.previous_close_date) &&
    stock.previous_close_date < stock.latest_date &&
    typeof stock.retrieved_at_utc === "string" &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(stock.retrieved_at_utc) &&
    Number.isFinite(Date.parse(stock.retrieved_at_utc))
  );
}


// ---------- Add one stock to the history ----------
function appendStock(stock, attempt) {
  const tone =
    stock.change > 0 ? "positive" :
    stock.change < 0 ? "negative" :
    "neutral";

  const direction =
    stock.change > 0 ? "Up" :
    stock.change < 0 ? "Down" :
    "No change";

  const cycleLabel = attempt.complete
    ? String(attempt.cycle)
    : `${attempt.cycle} (partial)`;

  const cellValues = [
    cycleLabel,
    formatUtc(stock.retrieved_at_utc),
    stock.ticker,
    stock.latest_date,
    stock.latest_price.toFixed(2),
    stock.previous_close_date,
    stock.previous_close.toFixed(2),
    `${direction} ${signedNumber(stock.change)}`,
    `${signedNumber(stock.percent_change)}%`
  ];

  const row = document.createElement("tr");

  cellValues.forEach((value, index) => {
    const cell = document.createElement("td");
    cell.textContent = value;

    // Color the latest price and both change columns.
    if ([4, 7, 8].includes(index)) {
      cell.className = tone;
    }

    row.appendChild(cell);
  });

  // Append a new row without removing earlier rows.
  tableBody.appendChild(row);

  // Provider responses remain in attempts, so avoid duplicating them.
  const { source, ...fields } = stock;

  records.push({
    ...fields,
    cycle: attempt.cycle,
    cycle_complete: attempt.complete
  });
}


// ---------- Fetch one complete acquisition cycle ----------

async function refreshStocks() {
  if (paused || inFlight) {
    return;
  }

  inFlight = true;
  clearTimeout(timerId);
  timerId = null;

  const attempt = {
    cycle: ++cycleNumber,
    started_at_utc: new Date().toISOString(),
    finished_at_utc: null,
    http_status: null,
    complete: false,
    records_added: 0,
    problems: [],
    snapshot: null
  };

  statusText.textContent =
    `Cycle ${attempt.cycle}: requesting stock data...`;

  scheduleText.textContent = "Request in progress.";
  errorText.hidden = true;

  try {
    const response = await fetch("/api/stocks", {
      cache: "no-store"
    });

    attempt.http_status = response.status;

    const responseText = await response.text();

    try {
      attempt.snapshot = JSON.parse(responseText);
    } catch {
      attempt.response_text = responseText;

      throw new Error(
        `HTTP ${response.status}: expected JSON. ` +
        "Check that you opened stocks.html using port 8001."
      );
    }

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}.`);
    }

    const snapshot = attempt.snapshot;

    if (
      !snapshot ||
      !Array.isArray(snapshot.stocks) ||
      !Array.isArray(snapshot.errors)
    ) {
      throw new Error("The server returned an unexpected data structure.");
    }

    windowText.textContent =
      `${snapshot.mode}. Requested date range: ` +
      `${snapshot.requested_from} through ${snapshot.requested_through}.`;

    attempt.problems.push(
      ...snapshot.errors.map(error =>
        `${error?.ticker ?? "API"}: ` +
        `${error?.message ?? "Unknown error"}`
      )
    );

    const seenTickers = new Set();
    const validStocks = [];

    for (const stock of snapshot.stocks) {
      if (
        !isValidStock(stock) ||
        seenTickers.has(stock.ticker)
      ) {
        attempt.problems.push(
          `Skipped an invalid or duplicate record: ` +
          `${stock?.ticker ?? "unknown ticker"}.`
        );

        continue;
      }

      seenTickers.add(stock.ticker);
      validStocks.push(stock);
    }

    const missingTickers = EXPECTED_TICKERS.filter(
      ticker => !seenTickers.has(ticker)
    );

    if (missingTickers.length > 0) {
      attempt.problems.push(
        `Missing valid records for: ${missingTickers.join(", ")}.`
      );
    }

    if (snapshot.ok !== true) {
      attempt.problems.push(
        "The server did not report a complete successful cycle."
      );
    }

    attempt.complete =
      snapshot.ok === true &&
      attempt.problems.length === 0 &&
      validStocks.length === EXPECTED_TICKERS.length;

    for (const stock of validStocks) {
      appendStock(stock, attempt);
    }

    attempt.records_added = validStocks.length;

    if (attempt.complete) {
      successfulCycles += 1;

      statusText.textContent =
        `Cycle ${attempt.cycle} complete: ` +
        `added ${validStocks.length} stock rows.`;
    } else {
      statusText.textContent =
        `Cycle ${attempt.cycle} incomplete: ` +
        `added ${validStocks.length} valid stock rows.`;
    }
  } catch (error) {
    attempt.problems.push(
      error instanceof Error ? error.message : String(error)
    );

    statusText.textContent =
      `Cycle ${attempt.cycle} failed. Earlier rows are retained.`;
  } finally {
    attempt.finished_at_utc = new Date().toISOString();
    attempts.push(attempt);

    inFlight = false;

    countsText.textContent =
      `Successful cycles: ${successfulCycles} | Rows: ${records.length}`;

    errorText.textContent = attempt.problems.join("\n");
    errorText.hidden = attempt.problems.length === 0;

    downloadButton.disabled = false;

    if (paused) {
      scheduleText.textContent = "Updates paused.";
    } else {
      const nextRequestTime = Date.now() + REFRESH_DELAY_MS;

      scheduleText.textContent =
        `Next request starts around ${formatUtc(nextRequestTime)} UTC.`;

      timerId = setTimeout(refreshStocks, REFRESH_DELAY_MS);
    }
  }
}


// ---------- Pause and resume ----------

pauseButton.addEventListener("click", () => {
  paused = !paused;

  clearTimeout(timerId);
  timerId = null;

  pauseButton.textContent = paused
    ? "Resume updates"
    : "Pause updates";

  if (paused) {
    scheduleText.textContent = inFlight
      ? "Pausing after the current request finishes."
      : "Updates paused.";
  } else if (inFlight) {
    scheduleText.textContent = "Request in progress.";
  } else {
    refreshStocks();
  }
});


// ---------- Download the collected evidence ----------

downloadButton.addEventListener("click", () => {
  const evidence = {
    exported_at_utc: new Date().toISOString(),
    source: "Massive daily stock aggregates",
    expected_tickers: EXPECTED_TICKERS,
    price_mode: "End-of-day daily closes; split-adjusted",
    comparison:
      "Latest returned daily close minus previous returned trading close.",
    refresh_policy: {
      delay_after_completion_ms: REFRESH_DELAY_MS,
      overlapping_requests: false
    },
    successful_cycles: successfulCycles,
    row_count: records.length,
    records,
    attempts
  };

  const blob = new Blob(
    [JSON.stringify(evidence, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "q1_stock_evidence.json";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
});


// Start only after all variables and event handlers are ready.
refreshStocks();