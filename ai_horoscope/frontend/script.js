// script.js — Beginner-friendly frontend script.
// This script reads the form fields, provides a simple built-in US city
// autocomplete, sends a POST request to `/horoscope`, and renders
// the returned JSON into the results area.

// Small built-in list of US cities for a lightweight autocomplete.
// You can expand this list as needed; using a local list keeps things
// fast and avoids external API calls.
const US_CITIES_FALLBACK = [
  'New York, NY',
  'Los Angeles, CA',
  'Chicago, IL',
  'Houston, TX',
  'Phoenix, AZ',
  'Philadelphia, PA',
  'San Antonio, TX',
  'San Diego, CA',
  'Dallas, TX',
  'San Jose, CA',
  'Groton, CT',
  'Hartford, CT',
  'New Haven, CT'
];

// Wait until the DOM is loaded before accessing elements
document.addEventListener('DOMContentLoaded', () => {
  // Grab references to form elements we will use
  const form = document.getElementById('horoscopeForm');
  const resultArea = document.getElementById('resultArea');
  const locationInput = document.getElementById('birth_location');
  const locationList = document.getElementById('location-list');
  const chartList = document.getElementById('chartList');
  const moonIcon = document.getElementById('moonIcon');
  const moonValue = document.getElementById('moonValue');
  const moonTitle = document.getElementById('moonTitle');

  if (!form || !resultArea) return; // Safety check

  // Update the moon phase panel from an astronomy payload
  const updateMoonPhase = (astronomy) => {
    if (!moonIcon || !moonValue || !moonTitle) return;
    if (!astronomy) {
      moonValue.textContent = 'Phase: --';
      moonTitle.textContent = 'Unavailable';
      return;
    }

    const phase = astronomy.moon_phase;
    if (phase !== null && phase !== undefined) {
      const phaseNum = Number(phase);
      const title = astronomy.moon_phase_name || (() => {
        if (phaseNum < 0.0625 || phaseNum >= 0.9375) return 'New Moon';
        if (phaseNum < 0.1875) return 'Waxing Crescent';
        if (phaseNum < 0.3125) return 'First Quarter';
        if (phaseNum < 0.4375) return 'Waxing Gibbous';
        if (phaseNum < 0.5625) return 'Full Moon';
        if (phaseNum < 0.6875) return 'Waning Gibbous';
        if (phaseNum < 0.8125) return 'Last Quarter';
        return 'Waning Crescent';
      })();

      const offset = Math.round((phaseNum - 0.5) * 2 * 22);
      moonIcon.style.setProperty('--moon-offset', `${offset}px`);
      moonValue.textContent = `Phase: ${phaseNum.toFixed(2)}`;
      moonTitle.textContent = title;
    } else {
      moonValue.textContent = 'Phase: --';
      moonTitle.textContent = astronomy.moon_phase_name || 'Unavailable';
    }
  };

  // Load today's moon phase on page load (before form submission)
  fetch('/moon', { headers: { 'Accept': 'application/json' } })
    .then((res) => res.json())
    .then((data) => updateMoonPhase(data && data.astronomy))
    .catch(() => updateMoonPhase(null));

  // Autocomplete: as the user types in the location input, filter the
  // small built-in list and populate the `<datalist>` with matching items.
  if (locationInput && locationList) {
    locationInput.addEventListener('input', (e) => {
      const q = locationInput.value.trim().toLowerCase();
      if (!q) {
        locationList.innerHTML = '';
        return;
      }

      // Filter the built-in list for matching substrings, limit to 6
      const matches = US_CITIES_FALLBACK.filter((s) => s.toLowerCase().includes(q)).slice(0, 6);
      locationList.innerHTML = '';
      for (const s of matches) {
        const opt = document.createElement('option');
        opt.value = s; // Selecting an option will fill the input with this value
        locationList.appendChild(opt);
      }
    });
  }

  // Handle form submission: read inputs and POST JSON to `/horoscope`
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); // Prevent normal form submit (page reload)

    // Read form values. The keys below will match the server's expected keys.
    const name = document.getElementById('name') ? document.getElementById('name').value.trim() : '';
    const birthDate = document.getElementById('birthday') ? document.getElementById('birthday').value : '';
    const birthTime = document.getElementById('birth_time') ? document.getElementById('birth_time').value : '';
    const birthLocation = document.getElementById('birth_location') ? document.getElementById('birth_location').value.trim() : '';
    const tone = document.getElementById('tone') ? document.getElementById('tone').value : 'funny';

    // Simple validation: require a birth date
    if (!birthDate) {
      resultArea.textContent = 'Please enter your birth date.';
      return;
    }

    // Show a loading state while waiting for the server
    const submitBtn = form.querySelector('button[type=submit]');
    const oldBtnText = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Generating...';
    }
    resultArea.textContent = 'Generating...';

    // Build the payload matching server expectations
    const payload = { name, birthDate, birthTime, birthLocation, tone };

    try {
      // Send the request to the FastAPI backend at `/horoscope`.
      // The Python backend expects keys: `name`, `birthday`, `birth_time`, `birth_location`.
        const res = await fetch('/horoscope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          // Map our frontend names to the backend keys the FastAPI expects
          body: JSON.stringify({
            name: payload.name,
            birthday: payload.birthDate,
            birth_time: payload.birthTime || payload.birth_time,
            birth_location: payload.birthLocation || payload.birth_location,
          }),
      });

      // Parse JSON. The server will return { horoscope: '...' } on success.
      const data = await res.json();

      const horoscopeText = (data && data.horoscope);
      if (horoscopeText) {
        // Sanitize simple HTML characters to avoid injection
        const safe = String(horoscopeText).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const displayName = name || 'Your horoscope';
        let astronomyHtml = '';
        if (data && data.astronomy) {
          const a = data.astronomy;
          const bits = [];
          if (a.sunrise) bits.push(`sunrise ${a.sunrise}`);
          if (a.sunset) bits.push(`sunset ${a.sunset}`);
          if (a.moonrise) bits.push(`moonrise ${a.moonrise}`);
          if (a.moonset) bits.push(`moonset ${a.moonset}`);
          if (a.moon_phase !== null && a.moon_phase !== undefined) bits.push(`moon phase ${a.moon_phase}`);
          if (bits.length) {
            astronomyHtml = `<p class="astro-summary">Astronomy: ${bits.join(' · ')}</p>`;
          }
        }
        resultArea.innerHTML = `<strong>${displayName}</strong><p>${safe.replace(/\n/g, '<br>')}</p>${astronomyHtml}`;

        // Render zodiac houses on the right panel if available
        if (chartList) {
          const houseTitles = {
            1: 'Rising',
            2: 'Possessions',
            3: 'Communication',
            4: 'Home',
            5: 'Creativity',
            6: 'Health',
            7: 'Partnerships',
            8: 'Transformation',
            9: 'Wisdom',
            10: 'Career',
            11: 'Community',
            12: 'Subconscious',
          };
          const houses = (data && data.houses) ? data.houses : [];
          if (houses.length === 12) {
            chartList.innerHTML = '';
            for (const h of houses) {
              const li = document.createElement('li');
              const sign = h.sign ? h.sign.charAt(0).toUpperCase() + h.sign.slice(1) : '--';
              const deg = (h.degree !== undefined && h.degree !== null) ? `${h.degree}°` : '--';
              const title = houseTitles[h.house] ? houseTitles[h.house] : '';
              li.textContent = `House ${h.house} (${title}): ${sign} ${deg}`.trim();
              chartList.appendChild(li);
            }
          }
        }

        // Render moon phase replica and label
        if (data && data.astronomy) {
          updateMoonPhase(data.astronomy);
        }
      } else {
        // Show a friendly error message — either server-provided or default
        resultArea.textContent = (data && data.error) ? data.error : 'Something went wrong';
      }
    } catch (err) {
      // Network or parsing error — show a simple message for beginners
      console.error('Error posting to /generate-horoscope:', err);
      resultArea.textContent = 'Something went wrong';
    } finally {
      // Restore the button state
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = oldBtnText || 'Generate Horoscope';
      }
    }
  });
});
