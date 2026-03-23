
// server.js
// Entry point for the Express backend server. Sets up routes and middleware.

require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const astroService = require('./astroService');
const compatibilityService = require('./compatibilityService');
const ragService = require('./ragService');
const judgeService = require('./judgeService');
const memoryService = require('./memoryService');

// Ensure express.json() is enabled before routes
app.use(express.json());

// API endpoint: Generate compatibility (new contract)
// POST /api/compatibility
app.post('/api/compatibility', async (req, res) => {
  try {
    console.log('POST /api/compatibility body:', req.body);
    let { person1, person2 } = req.body;
    // Sanitize: always use name, ignore pronouns
    person1 = {
      name: person1.name || '',
      birthdate: person1.birthdate,
      birthtime: person1.birthtime,
      location: person1.location
    };
    person2 = {
      name: person2.name || '',
      birthdate: person2.birthdate,
      birthtime: person2.birthtime,
      location: person2.location
    };
    if (!person1.name || !person2.name) {
      return res.status(200).json({
        summary: 'Error generating summary',
        romantic: 'Error generating romantic compatibility',
        friendship: 'Error generating friendship compatibility',
        work: 'Error generating work compatibility'
      });
    }
    // Build default aspects if not provided
    const planets = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
    const aspects = [];
    for (let i = 0; i < planets.length; i++) {
      for (let j = 0; j < planets.length; j++) {
        aspects.push(`${planets[i]}-${planets[j]}`);
      }
    }
    let result;
    try {
      result = await ragService.generateCompatibilitySummary(person1, person2, aspects);
      console.log('OpenAI/fallback result:', result);
    } catch (error) {
      console.error('OpenAI API error:', error);
      result = {
        summary: 'Error generating summary',
        romantic: 'Error generating romantic compatibility',
        friendship: 'Error generating friendship compatibility',
        work: 'Error generating work compatibility'
      };
    }
    // --- Real birth chart data using FreeAstroAPI ---
    let person1Chart = {};
    let person2Chart = {};
    try {
      person1Chart = await astroService.getBirthChart(person1.birthdate, person1.birthtime, person1.location);
    } catch (err) {
      console.error('Person 1 chart error:', err);
    }
    try {
      person2Chart = await astroService.getBirthChart(person2.birthdate, person2.birthtime, person2.location);
    } catch (err) {
      console.error('Person 2 chart error:', err);
    }
    // Fallback: Sun sign only if API fails
    if (!person1Chart || Object.keys(person1Chart).length === 0) {
      person1Chart = { Sun: { sign: person1.birthdate ? 'Unknown' : '', house: null } };
    }
    if (!person2Chart || Object.keys(person2Chart).length === 0) {
      person2Chart = { Sun: { sign: person2.birthdate ? 'Unknown' : '', house: null } };
    }
    // Log the final object being returned
    console.log('Final response object:', { ...result, person1Chart, person2Chart });
    return res.status(200).json({
      summary: result.summary || 'Error generating summary',
      romantic: result.romantic || 'Error generating romantic compatibility',
      friendship: result.friendship || 'Error generating friendship compatibility',
      work: result.work || 'Error generating work compatibility',
      person1Chart,
      person2Chart
    });
  } catch (error) {
    console.error('Compatibility error:', error);
    return res.status(200).json({
      summary: 'Error generating summary',
      romantic: 'Error generating romantic compatibility',
      friendship: 'Error generating friendship compatibility',
      work: 'Error generating work compatibility'
    });
  }
});

app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Root route serves index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});


// Example route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API endpoint: Get aspect explanation
// GET /api/aspect/:aspectName
app.get('/api/aspect/:aspectName', (req, res) => {
  const aspect = req.params.aspectName;
  const info = ragService.getAspectExplanation(aspect);
  if (info) {
    res.json(info);
  } else {
    res.status(404).json({ error: 'Aspect not found' });
  }
});

// API endpoint: Generate compatibility summary
// POST /api/compatibility-summary
app.post('/api/compatibility-summary', async (req, res) => {
  const { person1, person2, aspects } = req.body;
  if (!person1 || !person2 || !Array.isArray(aspects)) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  const summary = await ragService.generateCompatibilitySummary(person1, person2, aspects);
  res.json({ summary });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
