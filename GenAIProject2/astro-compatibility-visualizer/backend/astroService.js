// astroService.js
// Handles astro data processing and Neo4j graph interactions.

const fetch = require('node-fetch');

/**
 * Fetches planetary positions and houses from FreeAstroAPI
 * @param {string} birthdate - YYYY-MM-DD
 * @param {string} birthtime - HH:MM (24h)
 * @param {string} location - City or "lat,lon"
 * @returns {Promise<object>} - { Sun: { sign, house }, ... }
 */
async function getBirthChart(birthdate, birthtime, location) {
  try {
    // FreeAstroAPI expects lat/lon, so we need to geocode if location is not lat,lon
    let lat, lon;
    if (/^-?\d+\.\d+,-?\d+\.\d+$/.test(location)) {
      [lat, lon] = location.split(',');
    } else {
      // Use OpenStreetMap Nominatim for free geocoding
      const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`;
      const geoRes = await fetch(geoUrl, { headers: { 'User-Agent': 'astro-compatibility-app' } });
      const geoData = await geoRes.json();
      if (!geoData[0]) throw new Error('Location not found');
      lat = geoData[0].lat;
      lon = geoData[0].lon;
    }
    // Call FreeAstroAPI
    const url = `https://freeastroapi.com/api/birthchart?date=${birthdate}&time=${birthtime}&lat=${lat}&lon=${lon}`;
    const res = await fetch(url);
    const data = await res.json();
    console.log('FreeAstroAPI response:', JSON.stringify(data));
    // Parse response to extract planet sign and house
    const planets = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
    const chart = {};
    for (const planet of planets) {
      const p = data.planets?.[planet];
      if (p) {
        chart[planet] = { sign: p.sign, house: p.house };
      }
    }
    console.log('Parsed chart:', chart);
    return chart;
  } catch (err) {
    console.error('Astro API error:', err);
    // Fallback: Sun sign only (mock)
    return {};
  }
}

module.exports = {
  getBirthChart
};
