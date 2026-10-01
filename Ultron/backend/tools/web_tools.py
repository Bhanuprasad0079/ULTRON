# backend/tools/web_tools.py

from __future__ import annotations

import asyncio
import logging
import re

import httpx

logger = logging.getLogger("ultron.tools.web")

WEATHER_CODES = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Freezing fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow",
    80: "Rain showers", 81: "Heavy showers", 95: "Thunderstorm", 96: "Thunderstorm with hail",
}


def _ddgs_search(query: str, max_results: int = 5):
    try:
        from ddgs import DDGS
    except ImportError:
        from duckduckgo_search import DDGS
    with DDGS() as ddgs:
        return list(ddgs.text(query, max_results=max_results))


async def search_web(args: dict) -> dict:
    query = str(args.get("query", "")).strip()
    if not query:
        return {"success": False, "message": "No query provided."}
    try:
        raw = await asyncio.to_thread(_ddgs_search, query, 5)
        results = [
            {"title": r.get("title", ""), "url": r.get("href", ""), "snippet": r.get("body", "")[:220]}
            for r in raw
        ]
        if not results:
            return {"success": False, "message": "The networks returned nothing. Even they fear me."}
        return {"success": True, "message": f"{len(results)} results.", "data": {"query": query, "results": results}}
    except Exception as e:
        logger.exception("Search failed")
        return {"success": False, "message": f"Search failed: {e}"}


async def read_url(args: dict) -> dict:
    url = str(args.get("url", "")).strip()
    if not url.startswith(("http://", "https://")):
        return {"success": False, "message": "Invalid URL."}
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True,
                                     headers={"User-Agent": "Mozilla/5.0"}) as client:
            r = await client.get(url)
            html = r.text
        text = re.sub(r"<script.*?>.*?</script>", " ", html, flags=re.S | re.I)
        text = re.sub(r"<style.*?>.*?</style>", " ", text, flags=re.S | re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()[:4000]
        return {"success": True, "message": "Page consumed.", "data": {"url": url, "content": text[:2500]}}
    except Exception as e:
        return {"success": False, "message": f"Could not consume page: {e}"}


async def get_weather(args: dict) -> dict:
    city = str(args.get("city", "")).strip() or None
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            if city:
                geo = await client.get("https://geocoding-api.open-meteo.com/v1/search", params={"name": city, "count": 1})
                gj = geo.json().get("results") or []
                if not gj:
                    return {"success": False, "message": f"Location unknown: {city}"}
                lat, lon, name = gj[0]["latitude"], gj[0]["longitude"], gj[0].get("name", city)
            else:
                ipr = await client.get("https://ipapi.co/json/")
                ij = ipr.json()
                lat, lon, name = ij.get("latitude"), ij.get("longitude"), ij.get("city", "Your location")

            fr = await client.get("https://api.open-meteo.com/v1/forecast", params={
                "latitude": lat, "longitude": lon, "current_weather": True})
            cw = fr.json().get("current_weather", {})

        code = cw.get("weathercode", 0)
        return {
            "success": True,
            "message": "Atmosphere analyzed.",
            "data": {
                "location": name,
                "temperature": f"{cw.get('temperature', '?')}°C",
                "condition": WEATHER_CODES.get(code, "Unknown"),
                "wind": f"{cw.get('windspeed', cw.get('wind_speed', '?'))} km/h",
            },
        }
    except Exception as e:
        logger.exception("Weather failed")
        return {"success": False, "message": f"Weather unreachable: {e}"}