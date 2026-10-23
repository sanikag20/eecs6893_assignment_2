# EECS E6893: Big Data Analytics
## Homework 3: Data Visualization and Storytelling

**Student:** [Sanika Gumaste]  
**UNI:** [ssg2207]  
**Term:** Fall 2026  
**Final report:** [ssg2207_Sanika_Gumaste_HW3.pdf]

This submission covers D3 weather visualizations and periodic stock-price updates (Q1), a stock-monitoring data story (Q2), and a childhood-asthma data story for New York City (Q3).

The report contains the written explanations, figures, and required Q1 code excerpts. The source files and saved observations support inspection and reproduction. Viewing Q1 weather, Q2, and Q3 does not require fresh provider requests. Running the stock tracker requires internet access and a Massive API key.

## 1. File organization

```text
project-root/
├── README.md
├── [ssg2207_Sanika_Gumaste_HW3.pdf]
├── index.html
├── q1.js
├── stocks.html
├── stocks.js
├── stock_server.py
├── q2.html
├── q2.js
├── HW3_Q2_Stock_Analysis.ipynb
├── HW3_Q3_Childhood_Asthma.ipynb
├── data/
│   ├── seattle-weather.csv
│   └── q1_stock_evidence.json
├── q2_data/
│   ├── NVDA_raw.csv
│   ├── TSLA_raw.csv
│   ├── SPY_raw.csv
│   ├── stock_daily.csv
│   ├── stock_metrics.csv
│   ├── stock_summary.csv
│   ├── daily_workload.csv
│   ├── workload_summary.csv
│   ├── alert_details.csv
│   └── provenance.json
└── q3_asthma/
    ├── asthma_recent_original.csv
    ├── asthma_2023_cleaned.csv
    ├── asthma_2023_analysis.csv
    ├── borough_summary.csv
    ├── priority_assessment_candidates.csv
    ├── q3_asthma_top10.png
    ├── q3_borough_comparison.png
    └── q3_rate_vs_visits.png
```

`index.html` contains the weather charts and observations. `stocks.html` contains the stock tracker. `q2.html` contains the Q2 narrative, comparison table, and interactive alert grid. Q3 is presented as a written report with saved chart images; it does not require a separate D3 webpage.

## 2. Environment and dependencies

The webpages use HTML, CSS, and JavaScript. Q1 weather and Q2 use D3 version 7. Python notebooks were developed in Google Colab; the local stock server uses Python, `requests`, and timezone data.

| Component | Version record |
|---|---|
| Local Python | python 3.13.14 |
| Local requests and tzdata |
| yfinance | See `q2_data/provenance.json`, field `yfinance_version` |
| pandas, NumPy, Matplotlib |
| D3 | Major version 7; loaded from the CDN listed below |

Use the recorded versions when reproducing the environment. The installation commands below install dependencies but do not themselves pin historical versions. A version observed in a new runtime must not be described as the version used for the original analysis.

The D3 script is loaded from:

```text
https://cdn.jsdelivr.net/npm/d3@7
```

Therefore, these webpages require internet access to load D3 unless the library has been downloaded locally and the script paths changed. Their analysis data are read from local CSV files. No new GCP or Airflow deployment is needed for this implementation.

## 3. Open the saved webpages

Extract the ZIP, open a terminal in the project root, and start a static server.

**Windows:**

```powershell
py -m http.server 8000
```

**macOS/Linux:**

```bash
python3 -m http.server 8000
```

Open the appropriate local page:

```text
Q1 weather: http://localhost:8000/index.html
Q2 story:   http://localhost:8000/q2.html
```

Keep the terminal open. Stop the server with Ctrl+C. Use HTTP rather than double-clicking the HTML files, because the scripts load local CSVs through browser requests.

The static server does not implement `/api/stocks`. Use the dedicated server in Section 5 for the stock tracker. Q3 can be inspected directly in the final report and through the PNG files in `q3_asthma/`.

## 4. Q1 weather: data and processing

**Source:** Vega Seattle weather CSV.  
**Saved file:** `data/seattle-weather.csv`.  
**Coverage:** January 1, 2012 through December 31, 2015; 1,461 daily observations.  

The fields are `date`, `precipitation`, `temp_max`, `temp_min`, `wind`, and `weather`. Numeric fields are converted with `Number()`, and dates are parsed with `d3.utcParse("%Y-%m-%d")`. UTC parsing and a UTC scale preserve the calendar dates consistently; they do not imply that the source supplies precise UTC observation times.

The CSV does not declare physical units. Numeric chart labels therefore use the field name and “source units.” Histogram frequencies are numbers of days, and pie percentages use all 1,461 observations as the denominator.

Both static wind histograms use the same observations and minimum/maximum domain. Explicit interior boundaries produce exactly 10 or 20 equal-width bins. The pie computes category counts in JavaScript; the precipitation line sorts all observations by date. The interactive histogram supports 5, 10, 15, 20, or 25 bins and all four numeric fields. Changing a variable preserves the bin setting. Each redraw clears the selected SVG before recreating its contents; the static charts remain available.

To inspect the interaction, change Wind from 10 to 25 bins, then switch to Precipitation. Confirm that 25 remains selected and the chart still represents 1,461 days. The written observations are included in HTML paragraphs with internal CSS controlling font size, color, and indentation.

## 5. Q1 stock tracker: setup and evidence

### Start the API-enabled server

From the project root, run:

```powershell
py -m pip install requests tzdata
py stock_server.py
```

On macOS/Linux, replace `py` with `python3`.

Enter a valid Massive API key when the terminal prompts for it. The input is hidden. The server keeps the key in memory and sends it in the authorization header. Do not place a real key in the submitted code, screenshots, notebook outputs, or README.

Open:

```text
http://127.0.0.1:8001/stocks.html
```

The JSON endpoint is:

```text
http://127.0.0.1:8001/api/stocks
```

Use one stock-tracker browser tab during collection. Repeatedly opening the API endpoint also triggers requests. The server is intended for local inspection and binds to the loopback address.

### Acquisition and price policy

The tickers are AAPL, MSFT, and GOOGL. The server requests daily aggregates using this endpoint pattern:

```text
https://api.massive.com/v2/aggs/ticker/{ticker}/range/1/day/{start}/{end}
```

The implemented parameters are `adjusted=true`, `sort=asc`, and `limit=5000`. The end date is yesterday in `America/New_York`; the start is 30 calendar days before that end date. This excludes today's unfinished daily bar. Returned bars are ordered by provider timestamp, and the final two distinct trading sessions supply the latest close and previous-close baseline.

The data are labeled **end-of-day, split-adjusted daily closes**, not live intraday prices. Prices are in USD. Trading dates use New York time; acquisition timestamps are retained in UTC. Provider trading dates are distinct from retrieval timestamps.

```text
Price change = latest close − previous trading close
Percentage change = 100 × price change / previous trading close
```

The webpage displays green for positive changes, red for negative changes, and a neutral label for zero, together with signed values or direction labels.

### Refresh policy and saved evidence

Outgoing provider requests are spaced by at least 13 seconds. The browser schedules another cycle 90 seconds after the current cycle completes. This is not a fixed 90-second start-to-start interval. The delay and sequential request pattern limit request frequency; access remains subject to the supplied API plan.

Each cycle appends rows. Earlier records are retained when a request fails, and a complete successful cycle requires valid records for all three tickers. Repeated end-of-day prices are valid acquisition results and can appear in multiple cycles.

Use **Pause updates**, then **Download evidence JSON**, after collecting the required cycles. Save the download as `data/q1_stock_evidence.json`. Browser history is held in memory and is lost on page reload unless exported.

The exported JSON contains displayed records, acquisition attempts, provider responses, and timestamps. It allows inspection without an API key. The report shows five successful cycles and fifteen rows; the submitted JSON is the source for the exact timestamps and records. Fresh requests use a moving date window and need not reproduce the historical prices shown in the report.

## 6. Q2: stock-data acquisition and analysis

### Scope and provenance

**Provider:** Yahoo Finance through `yfinance`.  
**Tickers:** NVDA, TSLA, SPY.  
**Window:** August 21–October 2, 2026, inclusive.  
**Expected size:** 30 trading dates per ticker; 90 rows total.  
**Units:** USD for OHLC prices, shares for Volume, and percent for returns/swings.  
**Trading-date timezone:** `America/New_York`.

The exact recorded acquisition/provenance timestamp and yfinance version are stored in `q2_data/provenance.json`. Preserve that original metadata when reproducing calculations from saved data; a later analysis run is not a new retrieval of the original snapshot.

| Download setting | Value |
|---|---|
| `start` | `2026-08-21` |
| `end` | `2026-10-03`, exclusive |
| `interval` | `1d` |
| `auto_adjust` | `False` |
| `back_adjust` | `False` |
| `repair` | `False` |
| `rounding` | `False` |
| `prepost` | `False` |
| `actions` | `False` |
| `threads` | `False` |
| `progress` | `False` |
| `multi_level_index` | `False` |
| `ignore_tz` | `False` |

Original downloads are saved as `NVDA_raw.csv`, `TSLA_raw.csv`, and `SPY_raw.csv`. The analysis table retains `date`, `ticker`, `Open`, `High`, `Low`, `Close`, and `Volume`. It excludes `Adj Close` and applies no additional price adjustment. The normalized close-price index is not a dividend-adjusted total-return series.

### Reproduce from the submitted observations

Open `HW3_Q2_Stock_Analysis.ipynb`. In Colab, create a `q2_data` directory in the Files panel and upload the submitted `stock_daily.csv` into it. Run the imports, skip the provider-download cells, and initialize the saved data with:

```python
from pathlib import Path
import pandas as pd
import numpy as np

folder = Path("q2_data")
TICKERS = ["NVDA", "TSLA", "SPY"]
df = pd.read_csv(
    folder / "stock_daily.csv",
    dtype={"date": str, "ticker": str}
)
```

Run the notebook's validation, metric, workload, and calculation-output cells. This regenerates the calculated outputs without a new Yahoo Finance request. Do not run the cell that overwrites the original acquisition metadata. Copy the regenerated outputs into the local `q2_data/` directory to update the webpage.

### Fetch a new provider snapshot

Open the same notebook in Colab and run the installation/import, acquisition, validation, and analysis cells in order. The notebook installs `yfinance`, pandas, and NumPy. Keep the explicit query window above rather than replacing it with recent dates.

Validation checks the expected calendar, row counts, unique ticker/date keys, finite numeric values, positive prices, nonnegative volume, and consistent OHLC relationships. The expected date set excludes weekends and September 7 within the assigned window.

The acquisition workflow fetches each ticker separately and rejects duplicate keys. Incomplete downloads require checking settings and rerunning acquisition; the notebook does not silently interpolate or forward-fill observations. Report persistent gaps rather than manufacturing values. If overlapping downloads are combined, preserve the original attempts and retain the latest fetched record for each ticker/date key before validating the combined table.

Keep a fresh snapshot separate from the submitted snapshot. Provider corrections may change historical values, so the reported results should be reproduced from the saved observations.

### Calculations and review rule

```text
Normalized index_t = 100 × Close_t / Close_on_2026-08-21
Window return (%) = 100 × (Close_on_2026-10-02 − Close_on_2026-08-21)
                    / Close_on_2026-08-21
Daily swing (%) = 100 × (High − Low) / Open
Average daily swing = arithmetic mean of the 30 daily swings
Alert = daily swing ≥ threshold
```

The full-window index baseline is August 21. Calculations retain stored precision; rounding is for display only. Daily swing is an intraday range relative to Open, not daily return, return standard deviation, or annualized volatility.

The common thresholds are 3% and 5%. The first is a lower exploratory screen; the second is a stricter alternative for comparing coverage with workload. Neither is presented as an optimized risk limit. On a date with alerts, the proposed rule selects the largest daily swing, breaking an exact tie alphabetically by ticker. It selects at most one asset per date and logs the other alerts without separate review.

`stock_metrics.csv` contains the daily index, swing, and alert flags. `stock_summary.csv` contains the date count, first/last Close, return, average swing, and alert counts for each ticker. Its common window is August 21–October 2, 2026.
`daily_workload.csv` contains one row per date and threshold; `workload_summary.csv` aggregates those results; `alert_details.csv` records alerting assets and review selection.

### Check against the submitted results

| Ticker | Window return | Average swing | 3% alerts | 5% alerts |
|---|---:|---:|---:|---:|
| NVDA | 8.96% | 2.37% | 6 | 1 |
| TSLA | 2.13% | 3.17% | 11 | 2 |
| SPY | 0.51% | 0.67% | 0 | 0 |

| Threshold | Asset alerts | Dates with alerts | Competing-alert dates | Alerts without separate review |
|---|---:|---:|---:|---:|
| 3% | 17 | 14 | 3 | 3 |
| 5% | 3 | 3 | 0 | 0 |

In `q2.html`, changing the threshold updates the D3 grid and its workload statement. The summary table and narrative compare the full window and both thresholds. The rule is a retrospective after-close screening proposal, not a claim about intraday alert timing, predicted losses, or investment performance.

## 7. Q3: childhood asthma in NYC

### Source and scope

**Provider:** NYC Department of Health and Mental Hygiene, Environment & Health Data Portal.  
**Indicator:** Asthma emergency department visits (age 5 to 17).  
**Period:** 2023.  
**Geography:** 59 community districts across five boroughs.  
**Access date recorded in the report:** October 21, 2026. 

The portal export used for analysis is preserved as `q3_asthma/asthma_recent_original.csv`. This is the filtered 2023 community-district export, not the earlier 2014–2016 NTA file. No timezone conversion applies to its annual observation labels.

The underlying healthcare source is identified in the report as New York State SPARCS deidentified hospital discharge data. The analysis uses published aggregate records, not individual patient data.

| Source column | Analysis column | Meaning |
|---|---|---|
| `TimePeriod` | `year` | Observation year |
| `GeoID` | `district_id` | Community-district identifier |
| `Borough` | `borough` | Borough name |
| `Geography` | `district` | District name |
| `Number` | `visits` | Published number of ED visits |
| `Estimated annual rate per 10,000` | `rate` | Published estimated annual ED visits per 10,000 children aged 5–17 |

Rates are visit frequencies relative to the child population, not percentages of children with asthma. Counts are visits, not necessarily unique children. The source rates are retained rather than reconstructed from rounded counts or inferred denominators.

The analysis uses a separately published citywide benchmark of **143.7** for the same age group, year, and measure. It is not an arithmetic average of the 59 district rates.

### Reproduce the analysis and charts

Open `HW3_Q3_Childhood_Asthma.ipynb`. In Colab, create `q3_asthma` and upload the submitted `asthma_recent_original.csv`. After imports, load the saved snapshot:

```python
from pathlib import Path
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

folder = Path("q3_asthma")
recent_raw = pd.read_csv(folder / "asthma_recent_original.csv")
```

Skip the manual-download and obsolete NTA exploration cells. Run the community-district cleaning, validation, comparison, plotting, and output-saving cells in sequence. Confirm that the notebook uses `CITYWIDE_RATE = 143.7` with the documented source above.

The analysis converts year, counts, and rates to numeric values and validates 59 unique district IDs, 2023-only coverage, the community-district geography, five boroughs, finite values, and nonnegative rates/counts. It calculates rate ratios and the minimum, median, maximum, and above-benchmark district counts within each borough. Borough medians describe district estimates; they are not population-weighted borough-wide rates.

The exploratory candidate rule is `rate > 143.7` and `visits > median district visits`. The saved snapshot has a median count of 219 and yields 22 candidates. These are descriptive reference values, not clinical cutoffs or an allocation formula.

The three chart outputs are `q3_asthma_top10.png`, `q3_borough_comparison.png`, and `q3_rate_vs_visits.png`. The report integrates these with the written story. The analysis CSVs retain the cleaned observations, calculated fields, borough summary, and candidate districts.

### Checks and limitations

Brownsville has a rate of 441.8 and 627 visits. All 12 Bronx districts exceed the citywide benchmark; their median rate is 234.1. East New York and Starrett City has 763 visits at a rate of 252.3. These are checks against the submitted snapshot, not a forecast of current conditions.

This is a one-year geographic comparison. It cannot establish trends or causes, and the export does not provide uncertainty intervals or child-population denominators. Rates and counts summarize the same events in different ways, rather than supplying independent measures of disease burden. The recommendation is further local assessment before funding or intervention decisions.

## 8. Sources and acknowledgments

Source and documentation URLs:

```text
Weather CSV:
https://raw.githubusercontent.com/vega/vega/main/docs/data/seattle-weather.csv

D3:
https://d3js.org/
https://cdn.jsdelivr.net/npm/d3@7

Massive daily aggregates:
https://massive.com/docs/rest/stocks/aggregates/custom-bars

Yahoo Finance / yfinance:
https://finance.yahoo.com/
https://pypi.org/project/yfinance/

NYC Environment & Health Data Portal — Asthma:
https://a816-dohbesp.nyc.gov/IndicatorPublic/data-explorer/asthma/
```

ChatGPT assisted with code scaffolding, debugging, explanations, and drafting. The submitted data sources, acquisition settings, analysis files, and saved outputs document the work. Adapted code and other consulted materials should be acknowledged consistently with the course's academic-integrity policy.

## 9. Troubleshooting

| Symptom | Action |
|---|---|
| Blank chart or CSV 404 | Start the server in the project root; check relative paths and extracted folder nesting. |
| `d3 is not defined` | Check internet access to the CDN and that D3 loads before the page script. |
| Stock endpoint returns HTML/404 | Open the tracker through `stock_server.py` on port 8001, not the static server on 8000. |
| Massive authentication, access, or rate-limit error | Read the saved error; check the supplied key and plan access, avoid multiple polling tabs, and wait before retrying rate-limited calls. |
| Q2 validation failure | Check the explicit date window and query flags; retry missing provider observations without filling values. |
| Colab loses files | Upload the submitted snapshots again; temporary runtime files are not the submission backup. |
| New provider results differ from the report | Reproduce using the submitted snapshots; document any fresh retrieval separately. |
