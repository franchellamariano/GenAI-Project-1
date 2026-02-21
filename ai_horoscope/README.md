# Tiny AI Horoscope

A minimal FastAPI backend + static frontend that fetches daily horoscopes from the free Aztro API and uses OpenAI to rephrase them in a chosen tone.

Prerequisites
- Python 3.10+
- An OpenAI API key in the environment variable `OPENAI_API_KEY`

Quick start

```bash
cd ai_horoscope
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Start dev server (serves frontend and backend)
uvicorn backend.main:app --reload --port 8000
```

Open http://127.0.0.1:8000/ in your browser to use the simple frontend.

Notes
- Set `OPENAI_API_KEY` in your shell before running, e.g. `export OPENAI_API_KEY=sk-...`.
- The backend mounts the `frontend` directory as static files; the form POSTs to `/horoscope`.
