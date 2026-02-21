from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from datetime import date
from typing import Optional
import os
import os
from datetime import date, datetime
import hashlib
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from timezonefinder import TimezoneFinder
import swisseph as swe
from zoneinfo import ZoneInfo
import time


from openai import OpenAI, OpenAIError
from dotenv import load_dotenv

# Load environment variables from .env (if present)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Initialize OpenAI client with the API key from environment
_openai_api_key = os.getenv("OPENAI_API_KEY")
# Initialize OpenAI client only if an API key is present. If no key is set
# we leave `openai_client` as None so the server can still start and use the
# local fallback when OpenAI calls fail. Creating the client at import time
# can raise if the key is missing, so guard with try/except.
openai_client = None
if _openai_api_key:
    try:
        openai_client = OpenAI(api_key=_openai_api_key)
    except OpenAIError:
        openai_client = None

app = FastAPI(title="AI Horoscope / Life Advice")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Frontend directory (we'll use Jinja2 templates from the existing frontend folder)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")

templates = Jinja2Templates(directory=FRONTEND_DIR)
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

# Timezone finder instance (used for resolving birth location to timezone)
tf = TimezoneFinder()

# Simple in-memory geocode cache: {normalized_location: (lat, lon, tz_name, timestamp)}
geocode_cache: dict = {}
GEOCODE_TTL = 60 * 60 * 24 * 7  # 7 days


async def geocode_location(location: str) -> tuple[float, float, str]:
    """Resolve a free-text location to (lat, lon) using Nominatim (OpenStreetMap).
    Returns (lat, lon) as floats or raises HTTPException on failure."""
    key = location.strip().lower()
    now = time.time()
    cached = geocode_cache.get(key)
    if cached and now - cached[3] < GEOCODE_TTL:
        return cached[0], cached[1], cached[2]

    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": location, "format": "json", "limit": 1}
    headers = {"User-Agent": "ai-horoscope/1.0 (+https://example.com)"}
    async with httpx.AsyncClient() as client:
        res = await client.get(url, params=params, headers=headers, timeout=10.0)
        if res.status_code != 200:
            raise HTTPException(status_code=502, detail="Geocoding service error")
        data = res.json()
    if not data:
        raise HTTPException(status_code=400, detail="Could not geocode birth location")
    lat = float(data[0]["lat"])
    lon = float(data[0]["lon"])
    tz_name = tf.timezone_at(lat=lat, lng=lon) or "UTC"
    geocode_cache[key] = (lat, lon, tz_name, now)
    return lat, lon, tz_name


async def fetch_astronomy(lat: float, lon: float) -> dict:
    """Fetch daily astronomy data from Open-Meteo (best-effort)."""
    today = date.today().isoformat()
    url = "https://api.open-meteo.com/v1/astronomy"
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "sunrise,sunset,moonrise,moonset,moon_phase,day_length",
        "start_date": today,
        "end_date": today,
        "timezone": "auto",
    }
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(url, params=params, timeout=10.0)
        if res.status_code != 200:
            return get_local_moon_phase()
        data = res.json() or {}
        daily = data.get("daily", {})

        def first_value(key: str):
            values = daily.get(key) or []
            return values[0] if values else None

        astronomy = {
            "sunrise": first_value("sunrise"),
            "sunset": first_value("sunset"),
            "moonrise": first_value("moonrise"),
            "moonset": first_value("moonset"),
            "moon_phase": first_value("moon_phase"),
            "day_length": first_value("day_length"),
        }
        # If moon_phase is missing, fall back to a free public API.
        if astronomy.get("moon_phase") is None:
            astronomy.update(get_local_moon_phase())
        return astronomy
    except Exception:
        return get_local_moon_phase()


def get_local_moon_phase() -> dict:
    """Compute an approximate current moon phase locally (no network)."""
    # Reference new moon: 2000-01-06 18:14 UTC
    ref = datetime(2000, 1, 6, 18, 14, 0)
    now = datetime.utcnow().replace(hour=12, minute=0, second=0, microsecond=0)
    synodic = 29.53058867  # days
    days = (now - ref).total_seconds() / 86400.0
    phase = (days % synodic) / synodic
    phase = round(phase, 3)

    if phase < 0.0625 or phase >= 0.9375:
        title = "New Moon"
    elif phase < 0.1875:
        title = "Waxing Crescent"
    elif phase < 0.3125:
        title = "First Quarter"
    elif phase < 0.4375:
        title = "Waxing Gibbous"
    elif phase < 0.5625:
        title = "Full Moon"
    elif phase < 0.6875:
        title = "Waning Gibbous"
    elif phase < 0.8125:
        title = "Last Quarter"
    else:
        title = "Waning Crescent"

    return {
        "moon_phase": phase,
        "moon_phase_name": title,
    }


def degree_to_sign_name(deg: float) -> str:
    signs = [
        "aries",
        "taurus",
        "gemini",
        "cancer",
        "leo",
        "virgo",
        "libra",
        "scorpio",
        "sagittarius",
        "capricorn",
        "aquarius",
        "pisces",
    ]
    idx = int((deg % 360) // 30)
    return signs[idx]


def compute_natal_summary(bday: date, birth_time: str, lat: float, lon: float, tz_name: str) -> str:
    """Compute a short natal chart summary (ascendant + major planets with signs)."""
    # Parse local datetime from date + time string (HH:MM)
    local_dt = datetime.fromisoformat(f"{bday.isoformat()}T{birth_time}")
    try:
        local_dt = local_dt.replace(tzinfo=ZoneInfo(tz_name))
    except Exception:
        # fallback to UTC if timezone resolution fails
        local_dt = local_dt.replace(tzinfo=ZoneInfo("UTC"))

    # Convert to UTC for ephemeris (Swiss Ephemeris expects UT)
    utc_dt = local_dt.astimezone(ZoneInfo("UTC"))

    # Compute Julian Day (UT)
    jd = swe.julday(
        utc_dt.year,
        utc_dt.month,
        utc_dt.day,
        utc_dt.hour + utc_dt.minute / 60.0 + utc_dt.second / 3600.0 + utc_dt.microsecond / 3.6e9,
    )

    # Houses/ascendant
    try:
        cusps, ascmc = swe.houses(jd, lat, lon)
        asc_deg = ascmc[0]
        asc_sign = degree_to_sign_name(asc_deg)
    except Exception:
        asc_deg = None
        asc_sign = "unknown"

    # Major bodies
    planets = {
        "Sun": swe.SUN,
        "Moon": swe.MOON,
        "Mercury": swe.MERCURY,
        "Venus": swe.VENUS,
        "Mars": swe.MARS,
        "Jupiter": swe.JUPITER,
        "Saturn": swe.SATURN,
        "Uranus": swe.URANUS,
        "Neptune": swe.NEPTUNE,
        "Pluto": swe.PLUTO,
    }

    parts = []
    if asc_deg is not None:
        parts.append(f"Ascendant: {asc_sign} ({asc_deg:.1f}°)")

    planet_parts = []
    for name, pconst in planets.items():
        try:
            lonp = swe.calc_ut(jd, pconst)[0][0]
            sign_name = degree_to_sign_name(lonp)
            planet_parts.append(f"{name} in {sign_name} ({lonp:.1f}°)")
        except Exception:
            continue

    if planet_parts:
        parts.append("Planets: " + ", ".join(planet_parts[:6]))

    return "; ".join(parts)


def compute_house_cusps(bday: date, birth_time: str, lat: float, lon: float, tz_name: str) -> list[dict]:
    """Compute house cusps (1-12) with sign and degree in sign."""
    local_dt = datetime.fromisoformat(f"{bday.isoformat()}T{birth_time}")
    try:
        local_dt = local_dt.replace(tzinfo=ZoneInfo(tz_name))
    except Exception:
        local_dt = local_dt.replace(tzinfo=ZoneInfo("UTC"))

    utc_dt = local_dt.astimezone(ZoneInfo("UTC"))
    jd = swe.julday(
        utc_dt.year,
        utc_dt.month,
        utc_dt.day,
        utc_dt.hour + utc_dt.minute / 60.0 + utc_dt.second / 3600.0 + utc_dt.microsecond / 3.6e9,
    )

    cusps, _ = swe.houses(jd, lat, lon)
    houses = []

    # Swiss Ephemeris may return 13 entries (index 1..12) or 12 entries (0..11)
    if len(cusps) >= 13:
        indices = list(range(1, 13))
    else:
        indices = list(range(0, min(12, len(cusps))))

    house_num = 1
    for idx in indices:
        deg = float(cusps[idx])
        sign = degree_to_sign_name(deg)
        deg_in_sign = deg % 30.0
        houses.append({
            "house": house_num,
            "sign": sign,
            "degree": round(deg_in_sign, 1),
        })
        house_num += 1
    return houses

def zodiac_sign(month: int, day: int) -> str:
    if (month == 3 and day >= 21) or (month == 4 and day <= 19):
        return "aries"
    if (month == 4 and day >= 20) or (month == 5 and day <= 20):
        return "taurus"
    if (month == 5 and day >= 21) or (month == 6 and day <= 20):
        return "gemini"
    if (month == 6 and day >= 21) or (month == 7 and day <= 22):
        return "cancer"
    if (month == 7 and day >= 23) or (month == 8 and day <= 22):
        return "leo"
    if (month == 8 and day >= 23) or (month == 9 and day <= 22):
        return "virgo"
    if (month == 9 and day >= 23) or (month == 10 and day <= 22):
        return "libra"
    if (month == 10 and day >= 23) or (month == 11 and day <= 21):
        return "scorpio"
    if (month == 11 and day >= 22) or (month == 12 and day <= 21):
        return "sagittarius"
    if (month == 12 and day >= 22) or (month == 1 and day <= 19):
        return "capricorn"
    if (month == 1 and day >= 20) or (month == 2 and day <= 18):
        return "aquarius"
    return "pisces"


@app.get("/")
async def index(request: Request):
    # Render the frontend `index.html` using Jinja2 so we can inject results after POST
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/moon")
async def moon_phase():
    """Return today's moon phase without requiring user input."""
    return JSONResponse({"astronomy": get_local_moon_phase()})


@app.post("/horoscope")
async def horoscope(request: Request):
    # Don't fail at request time if no API key is configured. We will attempt
    # to call OpenAI only if the client is available; otherwise the exception
    # handler below will produce a safe local fallback horoscope.

    # Support JSON input (preferred) and fall back to form parsing.
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        payload = await request.json()
        name = payload.get("name")
        birthday = payload.get("birthday")
        birth_time = payload.get("birth_time")
        birth_location = payload.get("birth_location")
        tone = payload.get("tone", "funny")
    else:
        # best-effort fallback to form data (may require python-multipart for multipart)
        form = await request.form()
        name = form.get("name")
        birthday = form.get("birthday")
        birth_time = form.get("birth_time")
        birth_location = form.get("birth_location")
        tone = form.get("tone", "funny")

    # Parse birthday (expecting YYYY-MM-DD)
    try:
        bday = date.fromisoformat(birthday)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid birthday format")

    sign = zodiac_sign(bday.month, bday.day)

    # Optional astronomy data (best-effort) using Open-Meteo.
    astronomy_data = {}
    # Build a strict, copy-paste-ready prompt for OpenAI
    system_msg = (
        "You are a highly creative, insightful, and original horoscope and life-advice writer. "
        "Write horoscopes that are truly unique, surprising, and deeply personalized for each user, based on their birth chart and today's transits. "
        "Avoid formulaic or generic phrasing—each response should feel fresh, imaginative, and tailored to the individual. "
        "Let your language be vivid, poetic, and full of personality, matching the user's requested tone (funny, serious, inspirational, etc). "
        "Draw inspiration from the user's chart and the current sky, but do not simply repeat facts—use them as creative fuel for your advice and perspective. "
        "Each horoscope should be a single, flowing paragraph of 3–5 sentences, blending practical advice, emotional insight, and a sense of cosmic timing. "
        "Never include headings, lists, metadata, or internal instructions. "
        "Never provide medical, legal, or financial advice—if asked, gently redirect to general life wisdom. "
        "Be empathetic, non-judgmental, and avoid definitive statements about health, safety, or diagnosis. "
        "Make every reading feel like a one-of-a-kind message from the universe, not a template."
    )

    # Try to compute a short natal summary if we have a birth time and location
    natal_summary = None
    houses = []
    # Validate required fields (we made them required in the UI)
    if not birth_time or not birth_location:
        raise HTTPException(status_code=400, detail="Both birth_time and birth_location are required")

    try:
        lat, lon, tz_name = await geocode_location(birth_location)
    except HTTPException:
        # propagate geocoding HTTP errors
        raise
    except Exception:
        lat = lon = None
        tz_name = "UTC"

    if lat is not None and lon is not None:
        try:
            natal_summary = compute_natal_summary(bday, birth_time, lat, lon, tz_name)
        except Exception:
            natal_summary = None

        try:
            houses = compute_house_cusps(bday, birth_time, lat, lon, tz_name)
        except Exception:
            houses = []

        try:
            astronomy_data = await fetch_astronomy(lat, lon)
        except Exception:
            astronomy_data = {}

    # Compose the user message, including natal summary when available
    user_parts = [
        f"User details:\n- Name: {name or 'unknown'}\n- Zodiac: {sign}\n- Birthday: {bday.isoformat()}\n",
        f"- Birth time: {birth_time or 'unknown'}\n- Birth location: {birth_location or 'unknown'}\n- Tone: {tone}\n\n",
    ]

    if natal_summary:
        user_parts.insert(1, f"Natal chart summary: {natal_summary}\n\n")

    if astronomy_data:
        astronomy_bits = []
        if astronomy_data.get("sunrise"):
            astronomy_bits.append(f"sunrise {astronomy_data['sunrise']}")
        if astronomy_data.get("sunset"):
            astronomy_bits.append(f"sunset {astronomy_data['sunset']}")
        if astronomy_data.get("moon_phase") is not None:
            astronomy_bits.append(f"moon phase {astronomy_data['moon_phase']}")
        if astronomy_bits:
            user_parts.insert(2, "Astronomy today at the user's location: " + ", ".join(astronomy_bits) + "\n\n")

    user_parts.append(
        "Instructions:\n"
        "- Output exactly one plain-text paragraph (no headings, lists, or JSON).\n"
        "- Produce 3–4 total sentences: 2–3 short, practical/advice-oriented sentences in the requested tone, then exactly one sentence briefly explaining why today is notable for the user.\n"
        "- Include exactly one specific, simple action the user can take today (a single actionable suggestion).\n"
        "- If a first name is provided, you may address the user once at the start (e.g., 'Alex, ...').\n"
        "- Personalize using the natal summary and any astronomy data; avoid generic phrasing and reuse.\n"
        "- Avoid medical, legal, or financial recommendations; if the user appears to request such guidance, decline gently and provide safe, general suggestions.\n"
        "- Keep language concise, friendly, and non-judgmental.\n\n"
        "Respond now with the requested text block."
    )

    user_msg = "".join(user_parts)

    # Call OpenAI using the modern `OpenAI` client
    try:
        # If the OpenAI client is not configured, raise to trigger the local
        # fallback below.
        if openai_client is None:
            raise RuntimeError('OpenAI client not configured')

        resp = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=260,
            temperature=0.85,
        )
        # New client returns choices with message object
        generated = resp.choices[0].message.content.strip()
    except Exception as e:
        # If OpenAI is unavailable (missing key, quota, network), provide a
        # safe local fallback so the app still returns a horoscope-like text.
        err_text = str(e)
        # Simple heuristic to detect quota or 429 errors; treat missing key
        # similarly so users still get a demo response.
        if 'quota' in err_text.lower() or '429' in err_text or 'insufficient_quota' in err_text or 'not configured' in err_text.lower() or 'openai' in err_text.lower():
            def local_fallback(name, sign, tone, natal_summary):
                # Build a short, 3-sentence fallback horoscope. Keep it safe and varied.
                import random
                display = (name + ', ') if name else ''
                seed_source = f"{name}|{sign}|{tone}|{natal_summary or ''}|{time.time()}"
                seed = int(hashlib.sha256(seed_source.encode("utf-8")).hexdigest(), 16)
                random.seed(seed)

                # Example transit keywords
                transit_keywords = [
                    "Venus trine Mars", "Mercury retrograde", "Moon sextile Jupiter", "Sun square Saturn",
                    "Mars conjunct Pluto", "Jupiter opposite Neptune", "Saturn sextile Uranus", "Moon trine Venus",
                    "Sun conjunct Mercury", "Venus square Neptune", "Mars sextile Saturn", "Jupiter trine Sun"
                ]
                transit = random.choice(transit_keywords)

                # Extract chart features from natal_summary
                chart_features = []
                if natal_summary:
                    chart_features = [f for f in natal_summary.split(';') if f.strip()]
                chart_feature = random.choice(chart_features) if chart_features else f"Ascendant in {sign}"

                if tone and 'serious' in tone.lower():
                    openings = [
                        f"{display}Today, {sign} energy is shaped by {transit}, especially as it interacts with your {chart_feature}.",
                        f"{display}{sign} focus favors consistency and discipline, with {transit} influencing your {chart_feature}.",
                        f"{display}Your {sign} instincts lean toward structure and follow-through, as {transit} activates your {chart_feature}.",
                        f"{display}A grounded mood prevails for {sign}, thanks to {transit} and your {chart_feature}."
                    ]
                    advices = [
                        f"Choose one small task and finish it — progress builds momentum, especially for your {chart_feature}.",
                        f"Pick a single priority and complete it without multitasking; your {chart_feature} will benefit.",
                        f"Commit to one simple routine and keep it clean and doable, honoring your {chart_feature}.",
                        f"Focus on practical goals and avoid distractions; {transit} supports your {chart_feature}."
                    ]
                    whys = [
                        f"{transit} brings clarity and rewards measured effort, especially for your {chart_feature}.",
                        f"Clarity grows when your effort is focused and measured, activating your {chart_feature}.",
                        f"Small, steady wins reduce friction and increase confidence in your {chart_feature}.",
                        f"This keeps stress low and creates clear results to build on, especially under {transit} and your {chart_feature}."
                    ]
                elif tone and 'inspir' in tone.lower():
                    openings = [
                        f"{display}The stars nudge a quiet confidence in your {sign} nature today, as {transit} highlights your {chart_feature}.",
                        f"{display}Your {sign} spark feels brighter, like a candle finding fresh air as {transit} energizes your {chart_feature}.",
                        f"{display}A hopeful current runs through your {sign} spirit, inspired by {transit} and your {chart_feature}.",
                        f"{display}Momentum builds for {sign} as {transit} opens new possibilities for your {chart_feature}."
                    ]
                    advices = [
                        f"Try something that stretches you a little — a short, bold step will teach you more than a big plan, especially for your {chart_feature}.",
                        f"Let a small brave action open the door to a bigger story; your {chart_feature} is ready.",
                        f"Take one gentle leap and let it echo through your day, guided by your {chart_feature}.",
                        f"Embrace change and let inspiration guide you; {transit} empowers your {chart_feature}."
                    ]
                    whys = [
                        f"{transit} reveals strengths and reduces fear of failure, especially for your {chart_feature}.",
                        f"Momentum arrives when you choose possibility over perfection, activating your {chart_feature}.",
                        f"A tiny risk can light a path you did not know existed, especially with {transit} energizing your {chart_feature}.",
                        f"Today is notable for {sign} because {transit} encourages growth in your {chart_feature}."
                    ]
                else:
                    openings = [
                        f"{display}Your {sign} vibe today is playful and a little impatient, with {transit} stirring your {chart_feature}.",
                        f"{display}Your {sign} mood is mischievous, like it had too much coffee — blame {transit} for your {chart_feature}!",
                        f"{display}Your {sign} energy is bouncy and slightly chaotic, thanks to {transit} and your {chart_feature}.",
                        f"{display}A quirky twist for {sign} as {transit} adds excitement to your {chart_feature}."
                    ]
                    advices = [
                        f"Do one unexpected, harmless thing that sparks joy — a tiny risk with upside for your {chart_feature}.",
                        f"Try a small plot twist in your routine and see what it unlocks for your {chart_feature}.",
                        f"Give yourself one goofy detour and keep the rest simple, honoring your {chart_feature}.",
                        f"Let spontaneity lead the way and enjoy the ride; {transit} energizes your {chart_feature}."
                    ]
                    whys = [
                        f"{transit} breaks routine and creates space for new opportunities in your {chart_feature}.",
                        f"Surprise adds fuel to your momentum without derailing the day, especially for your {chart_feature}.",
                        f"A playful shake-up makes the ordinary feel magnetic, especially with {transit} in play for your {chart_feature}.",
                        f"Today is notable for {sign} because {transit} brings unexpected fun to your {chart_feature}."
                    ]

                opening = random.choice(openings)
                advice = random.choice(advices)
                why = random.choice(whys)

                natal_hint = f" ({natal_summary})" if natal_summary else ''
                return f"{opening} {advice}{natal_hint} {why}"

            generated = local_fallback(name, sign, tone, natal_summary)
        else:
            # For other errors, propagate a 502 so callers know the API failed
            raise HTTPException(status_code=502, detail=f"OpenAI API error: {e}")

    response_payload = {
        "horoscope": generated,
        "astronomy": astronomy_data,
        "houses": houses,
    }

    # If the request looks like an AJAX/JSON request, return JSON; otherwise render template
    accept = request.headers.get("accept", "")
    if "application/json" in accept or request.headers.get("x-requested-with") == "XMLHttpRequest":
        return JSONResponse(response_payload)

    # Render the same index.html but inject the result
    return templates.TemplateResponse(
        "index.html",
        {"request": request, "result": generated, "sign": sign, "name": name, "natal": natal_summary},
    )
