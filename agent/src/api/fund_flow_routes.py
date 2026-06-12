"""East Money sector fund flow HTTP routes.

Mounted by ``agent/api_server.py`` via ``register_fund_flow_routes(app)``.
Provides JSON endpoints for the frontend visualization.

Routes:
  - GET /api/fund-flow         — fund flow data (latest or by date)
  - GET /api/fund-flow/dates   — list available dates
  - GET /api/fund-flow/view    — HTML visualization page
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse

from eastmoney_fund_flow import get_available_dates, load_fund_flow

_HTML_PATH = Path(__file__).resolve().parent.parent.parent / "eastmoney_fund_flow.html"


def register_fund_flow_routes(app: FastAPI) -> None:
    """Mount the fund flow routes onto ``app``."""

    @app.get("/api/fund-flow")
    async def get_fund_flow(
        date: str = Query("", description="Date in YYYY-MM-DD format, empty for latest"),
    ):
        """Return industry sector fund flow data (latest or by date)."""
        return load_fund_flow(date)

    @app.get("/api/fund-flow/dates")
    async def get_fund_flow_dates():
        """Return list of dates with available fund flow data."""
        return {"dates": get_available_dates()}

    @app.get("/api/fund-flow/view", response_class=HTMLResponse)
    async def get_fund_flow_view(
        date: str = Query("", description="Date in YYYY-MM-DD format"),
    ):
        """Serve the fund flow visualization HTML page with preloaded data."""
        if not _HTML_PATH.exists():
            raise HTTPException(status_code=404, detail="Fund flow HTML page not found")
        html = _HTML_PATH.read_text(encoding="utf-8")
        data = load_fund_flow(date)
        data_json = json.dumps(data, ensure_ascii=False)
        html = html.replace(
            '<script>',
            f'<script>\nwindow.__FUND_FLOW_DATA__ = {data_json};\n',
            1,
        )
        return HTMLResponse(html)
