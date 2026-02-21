// server.js
// Beginner-friendly Express server for Tiny Horoscope / Life Advice App
// This file is intentionally heavily commented to explain each step.
// Requirements:
//  - Node.js (18+) or install a fetch polyfill like `node-fetch`
//  - npm install express dotenv cors

/* -------------------------------------------------------------------------- */
/* 1) Load environment variables                                                  */
/* -------------------------------------------------------------------------- */
// We use `dotenv` to load variables from a local `.env` file (for development).
// Put your OpenAI API key in a `.env` file as: OPENAI_API_KEY=sk-...
require('dotenv').config();

/* -------------------------------------------------------------------------- */
/* 2) Import dependencies                                                        */
/* -------------------------------------------------------------------------- */
const express = require('express'); // web framework
const cors = require('cors'); // middleware to enable CORS (Cross-Origin Resource Sharing)

// Note: modern Node versions provide a global `fetch`. If your Node doesn't,
// install node-fetch and uncomment the next line:
// const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

/* -------------------------------------------------------------------------- */
/* 3) Create the Express application                                             */
/* -------------------------------------------------------------------------- */
const app = express();

/* -------------------------------------------------------------------------- */
/* 4) Middleware: parse JSON, enable CORS, serve static files                    */
/* -------------------------------------------------------------------------- */
// Allow JSON bodies in requests (we expect the frontend to send JSON)
app.use(express.json());

// Allow URL-encoded form bodies too (optional; safe to include)
app.use(express.urlencoded({ extended: true }));

// Enable CORS for all origins. In production restrict to your domain.
app.use(cors());

// Serve static frontend files. By default this project keeps the frontend
// in `ai_horoscope/frontend` (not `public`), so serve that directory so you
// don't need to move files.
app.use(express.static('ai_horoscope/frontend'));

/* -------------------------------------------------------------------------- */
/* 5) Helper: build prompt for OpenAI                                           */
/* -------------------------------------------------------------------------- */
/**
 * Build a clear prompt that tells the model to act like a witty astrologer
 * and produce a compact horoscope with 2-4 sentences including one practical
 * life-advice suggestion. We pass both a short system instruction and a
 * user message containing the user details so the model has context.
 */
function buildPrompt({ name, birthDate, birthTime, birthLocation, tone }) {
  // Make sure we always provide a tone (defaults to funny)
  tone = tone || 'funny';

  // Clear system instruction guiding style and safety.
  const system = [
    'You are a professional, witty astrologer who writes short, personalized horoscopes and single-sentence life suggestions.',
    'Be creative but do not invent sensitive facts (medical, legal, or financial advice).',
  ].join(' ');

  // Compose the user-facing instruction with strict output rules so responses are
  // consistent and safe for production use.
  const user = [
    `User details:`,
    `- Name: ${name || 'unknown'}`,
    `- Birth date: ${birthDate || 'unknown'}`,
    `- Birth time: ${birthTime || 'unknown'}`,
    `- Birth location: ${birthLocation || 'unknown'}`,
    `- Tone: ${tone || 'funny'}`,
    '',
    'Instructions:',
    '1) Produce a single short paragraph of exactly 2 to 4 concise sentences.',
    '2) Use the requested tone: funny OR sarcastic OR poetic (choose only one).',
    '3) Make the text feel personalized — reference a simple personality/destiny vibe (e.g., "bold streak", "quiet intuition", "restless curiosity").',
    '4) End with one short, actionable life suggestion (one sentence) — practical and safe.',
    '5) Do not include lists, headings, metadata, or any sensitive instructions; avoid medical/legal/financial claims.',
    '6) Output only plain text (no JSON, no markup).',
    '',
    'Keep language friendly and copy-paste ready. Now generate the horoscope.'
  ].join('\n');

  return { system, user };
}

/* -------------------------------------------------------------------------- */
/* 6) POST /generate-horoscope endpoint                                         */
/* -------------------------------------------------------------------------- */
// This endpoint accepts a JSON body with: name, birthDate, birthTime, birthLocation
// It calls OpenAI and returns JSON: { horoscope: "text" }
app.post('/generate-horoscope', async (req, res) => {
  try {
    // Read incoming JSON body
    // We expect the frontend to send `name`, `birthDate`, `birthTime`, `birthLocation`.
    const { name, birthDate, birthTime, birthLocation, tone } = req.body || {};

    // Basic validation: birthDate is required for a horoscope
    if (!birthDate) {
      return res.status(400).json({ error: 'birthDate is required (format YYYY-MM-DD)' });
    }

    // Get OpenAI API key from environment
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      // 500 because it's a server configuration problem
      return res.status(500).json({ error: 'OPENAI_API_KEY not set on the server' });
    }

    // Build the model prompt
    const { system, user } = buildPrompt({ name, birthDate, birthTime, birthLocation, tone });

    // Prepare the chat completion payload (Chat API)
    const payload = {
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      max_tokens: 200,
      temperature: 0.8,
    };

    // Call OpenAI's Chat Completions endpoint
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    // If the OpenAI API returned a non-OK status, we still return JSON but
    // give a generic error message so the frontend can display a friendly
    // message. We log the detailed error server-side for debugging.
    if (!response.ok) {
      const text = await response.text();
      console.error('OpenAI API error:', text);
      // Always return JSON. The frontend will check for `error`.
      return res.json({ error: 'Something went wrong' });
    }

    const data = await response.json();

    // Extract the generated text. The Chat API usually returns messages
    // under choices[0].message.content (or legacy `text`). Guard carefully.
    const generated = (data?.choices?.[0]?.message?.content) || data?.choices?.[0]?.text || '';

    // Always return a JSON object. On success it's { horoscope: '...' }.
    return res.json({ horoscope: (generated || '').trim() });
  } catch (err) {
    // Log the error on the server for debugging and return a generic message to the client
    console.error('Server error in /generate-horoscope:', err);
    // Return JSON with a friendly error message. The frontend will show this
    // to users as "Something went wrong" without exposing internal details.
    return res.json({ error: 'Something went wrong' });
  }
});

/* -------------------------------------------------------------------------- */
/* 7) Start the server                                                            */
/* -------------------------------------------------------------------------- */
// Use PORT from environment (e.g., from .env) or default to 3000
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Tiny Horoscope server running: http://localhost:${PORT}`);
  console.log('Serving static files from ./public');
});

/* -------------------------------------------------------------------------- */
/* Notes for beginners:
 - Create a `.env` file with OPENAI_API_KEY=sk-... and optionally PORT=3000
 - Install dependencies: `npm install express dotenv cors`
 - Run the server: `node server.js` (or `npx nodemon server.js` for auto-reload)
 - Place your frontend files (index.html, script.js, style.css) in a `public/` folder
 - The frontend can POST JSON to `/generate-horoscope` and will receive `{ horoscope: '...' }`
*/
