// script.js — Beginner-friendly frontend script.
// This script reads the form fields, provides a simple built-in US city
// autocomplete, sends a POST request to `/horoscope`, and renders
// the returned JSON into the results area.

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

document.addEventListener('DOMContentLoaded', () => {
	const form = document.getElementById('horoscopeForm');
	const resultArea = document.getElementById('resultArea');
	const locationInput = document.getElementById('birth_location');
	const locationList = document.getElementById('location-list');
	const chartList = document.getElementById('chartList');
	const moonIcon = document.getElementById('moonIcon');
	const moonValue = document.getElementById('moonValue');
	const moonTitle = document.getElementById('moonTitle');

	if (!form || !resultArea) return;

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

	fetch('/moon', { headers: { 'Accept': 'application/json' } })
		.then((res) => res.json())
		.then((data) => updateMoonPhase(data && data.astronomy))
		.catch(() => updateMoonPhase(null));

	if (locationInput && locationList) {
		locationInput.addEventListener('input', (e) => {
			const q = locationInput.value.trim().toLowerCase();
			if (!q) {
				locationList.innerHTML = '';
				return;
			}
			const matches = US_CITIES_FALLBACK.filter((s) => s.toLowerCase().includes(q)).slice(0, 6);
			locationList.innerHTML = '';
			for (const s of matches) {
				const opt = document.createElement('option');
				opt.value = s;
				locationList.appendChild(opt);
			}
		});
	}

	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		const name = document.getElementById('name') ? document.getElementById('name').value.trim() : '';
		const birthDate = document.getElementById('birthday') ? document.getElementById('birthday').value : '';
		const birthTime = document.getElementById('birth_time') ? document.getElementById('birth_time').value : '';
		const birthLocation = document.getElementById('birth_location') ? document.getElementById('birth_location').value.trim() : '';
		const tone = document.getElementById('tone') ? document.getElementById('tone').value : 'funny';
		if (!birthDate) {
			resultArea.textContent = 'Please enter your birth date.';
			return;
		}
		const submitBtn = form.querySelector('button[type=submit]');
		const oldBtnText = submitBtn ? submitBtn.textContent : null;
		if (submitBtn) {
			submitBtn.disabled = true;
			submitBtn.textContent = 'Loading...';
		}
		try {
			const resp = await fetch('/horoscope', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name,
					birthday: birthDate,
					birth_time: birthTime,
					birth_location: birthLocation,
					tone
				})
			});
			const data = await resp.json();
			if (resp.ok && data) {
				resultArea.textContent = data.horoscope || 'No horoscope found.';
				const houseTitles = {
					1: 'Self', 2: 'Resources', 3: 'Communication', 4: 'Home', 5: 'Creativity',
					6: 'Health', 7: 'Partnerships', 8: 'Transformation', 9: 'Beliefs',
					10: 'Career', 11: 'Community', 12: 'Spirituality'
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
				if (data && data.astronomy) {
					updateMoonPhase(data.astronomy);
				}
			} else {
				resultArea.textContent = (data && data.error) ? data.error : 'Something went wrong';
			}
		} catch (err) {
			console.error('Error posting to /generate-horoscope:', err);
			resultArea.textContent = 'Something went wrong';
		} finally {
			if (submitBtn) {
				submitBtn.disabled = false;
				submitBtn.textContent = oldBtnText || 'Generate Horoscope';
			}
		}
	});
});