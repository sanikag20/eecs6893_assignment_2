import getpass
import json
import math
import threading
import time

from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import requests


TICKERS = ["AAPL", "MSFT", "GOOGL"]
NEW_YORK = ZoneInfo("America/New_York")

API_KEY = ""

# Keep all outgoing API requests at least 13 seconds apart.
REQUEST_GAP_SECONDS = 13
request_lock = threading.Lock()
last_request_started = 0.0


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def fetch_stock(ticker, start_date, end_date):
    global last_request_started

    url = (
        f"https://api.massive.com/v2/aggs/ticker/{ticker}"
        f"/range/1/day/{start_date}/{end_date}"
    )

    params = {
        "adjusted": "true",
        "sort": "asc",
        "limit": 5000
    }

    # The key is sent in a header, rather than placed in the URL.
    headers = {
        "Authorization": f"Bearer {API_KEY}"
    }

    # This lock also protects the rate limit if multiple browser
    # requests arrive close together.
    with request_lock:
        elapsed = time.monotonic() - last_request_started
        remaining_wait = REQUEST_GAP_SECONDS - elapsed

        if remaining_wait > 0:
            time.sleep(remaining_wait)

        last_request_started = time.monotonic()

        response = requests.get(
            url,
            params=params,
            headers=headers,
            timeout=20
        )

    retrieved_at = utc_now()

    try:
        payload = response.json()
    except ValueError:
        raise RuntimeError(
            f"HTTP {response.status_code}: provider returned non-JSON data."
        )

    if not response.ok:
        message = (
            payload.get("message")
            or payload.get("error")
            or "Request failed."
        )

        raise RuntimeError(
            f"HTTP {response.status_code}: {message}"
        )

    # A 30-day request should fit in one response at this limit.
    if payload.get("next_url"):
        raise RuntimeError(
            "The provider returned a paginated response. "
            "Review pagination before selecting the latest bars."
        )

    # Deduplicate by provider timestamp, then sort chronologically.
    unique_bars = {
        bar["t"]: bar
        for bar in payload.get("results", [])
    }

    bars = sorted(
        unique_bars.values(),
        key=lambda bar: bar["t"]
    )

    if len(bars) < 2:
        message = payload.get("message") or payload.get("error") or ""

        raise RuntimeError(
            f"Need at least two daily bars; received {len(bars)}. "
            f"{message}"
        )

    previous_bar, latest_bar = bars[-2:]

    previous_close = float(previous_bar["c"])
    latest_price = float(latest_bar["c"])

    if not all(
        math.isfinite(price) and price > 0
        for price in [previous_close, latest_price]
    ):
        raise RuntimeError("The returned closing prices are invalid.")

    previous_time = datetime.fromtimestamp(
        previous_bar["t"] / 1000,
        tz=timezone.utc
    )

    latest_time = datetime.fromtimestamp(
        latest_bar["t"] / 1000,
        tz=timezone.utc
    )

    previous_date = previous_time.astimezone(NEW_YORK).date()
    latest_date = latest_time.astimezone(NEW_YORK).date()

    if previous_date >= latest_date:
        raise RuntimeError("Need two distinct trading dates.")

    change = latest_price - previous_close

    # Preserve representative provider data for later evidence export.
    provider_response = {
        field: payload[field]
        for field in [
            "ticker",
            "status",
            "request_id",
            "adjusted",
            "queryCount",
            "resultsCount",
            "results"
        ]
        if field in payload
    }

    return {
        "ticker": ticker,
        "currency": "USD",
        "latest_price": latest_price,
        "latest_date": latest_date.isoformat(),
        "previous_close": previous_close,
        "previous_close_date": previous_date.isoformat(),
        "change": change,
        "percent_change": 100 * change / previous_close,
        "provider_bar_start_utc": latest_time.isoformat(),
        "retrieved_at_utc": retrieved_at,
        "provider_status": payload.get("status"),
        "source": {
            "endpoint": url,
            "parameters": params,
            "provider_response": provider_response
        }
    }


def get_snapshot():
    # Use completed calendar days in New York.
    end_date = datetime.now(NEW_YORK).date() - timedelta(days=1)
    start_date = end_date - timedelta(days=30)

    stocks = []
    errors = []

    for ticker in TICKERS:
        try:
            record = fetch_stock(ticker, start_date, end_date)
            stocks.append(record)

        except Exception as error:
            # Ensure the key cannot appear in a returned error message.
            message = str(error).replace(API_KEY, "[redacted]")

            errors.append({
                "ticker": ticker,
                "message": message
            })

    return {
        "ok": len(stocks) == len(TICKERS),
        "mode": "End-of-day daily closes; split-adjusted",
        "requested_from": start_date.isoformat(),
        "requested_through": end_date.isoformat(),
        "completed_at_utc": utc_now(),
        "stocks": stocks,
        "errors": errors
    }


class StockHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/stocks":
            snapshot = get_snapshot()
            body = json.dumps(snapshot, indent=2).encode("utf-8")

            self.send_response(200)
            self.send_header(
                "Content-Type",
                "application/json; charset=utf-8"
            )
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()

            self.wfile.write(body)
            return

        # Serve index.html, q1.js, CSV files, and other project files.
        super().do_GET()


if __name__ == "__main__":
    API_KEY = getpass.getpass("Enter your Massive API key: ").strip()

    if not API_KEY:
        raise SystemExit("An API key is required.")

    project_folder = Path(__file__).resolve().parent

    handler = partial(
        StockHandler,
        directory=str(project_folder)
    )

    server = ThreadingHTTPServer(
        ("127.0.0.1", 8001),
        handler
    )

    print("Project: http://127.0.0.1:8001/")
    print("Stock data: http://127.0.0.1:8001/api/stocks")
    print("Press Ctrl+C to stop the server.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()