
document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('compatibility-form');
  const summaryCard = document.getElementById('compatibility-summary');
  const loveCard = document.getElementById('romantic-compatibility');
  const friendshipCard = document.getElementById('friendship-compatibility');
  const workCard = document.getElementById('work-compatibility');
  const chartPerson1 = document.getElementById('chartPerson1');
  const chartPerson2 = document.getElementById('chartPerson2');

  // Helper: Render a birth chart as a list of spans
  function renderBirthChartList(container, chartData) {
    container.innerHTML = '';
    if (!chartData || Object.keys(chartData).length === 0) {
      container.innerHTML = '<span>Birth chart not available</span>';
      return;
    }
    Object.entries(chartData).forEach(([planet, info]) => {
      const span = document.createElement('span');
      span.textContent = `${planet}: ${info.sign} (House ${info.house})`;
      container.appendChild(span);
    });
  }

  // Render empty lists on load
  renderBirthChartList(chartPerson1, {});
  renderBirthChartList(chartPerson2, {});

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const person1 = {
      name: document.getElementById('person1-name').value,
      birthdate: document.getElementById('person1-birthdate').value,
      birthtime: document.getElementById('person1-birthtime').value,
      location: document.getElementById('person1-location').value
    };
    const person2 = {
      name: document.getElementById('person2-name').value,
      birthdate: document.getElementById('person2-birthdate').value,
      birthtime: document.getElementById('person2-birthtime').value,
      location: document.getElementById('person2-location').value
    };
    summaryCard.querySelector('div').textContent = 'Loading...';
    loveCard.querySelector('div').textContent = 'Loading...';
    friendshipCard.querySelector('div').textContent = 'Loading...';
    workCard.querySelector('div').textContent = 'Loading...';
    // Show loading lists
    renderBirthChartList(chartPerson1, {});
    renderBirthChartList(chartPerson2, {});
    try {
      const response = await fetch('/api/compatibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person1, person2 })
      });
      const data = await response.json();
      alert('API response: ' + JSON.stringify(data));
      summaryCard.querySelector('div').textContent = data.summary || 'No summary available.';
      loveCard.querySelector('div').textContent = data.romantic || 'No romantic compatibility available.';
      friendshipCard.querySelector('div').textContent = data.friendship || 'No friendship compatibility available.';
      workCard.querySelector('div').textContent = data.work || 'No work compatibility available.';
      // Render birth chart lists if present
      if (data.person1Chart) {
        renderBirthChartList(chartPerson1, data.person1Chart);
      }
      if (data.person2Chart) {
        renderBirthChartList(chartPerson2, data.person2Chart);
      }
    } catch (err) {
      alert('Error: ' + err);
      summaryCard.querySelector('div').textContent = 'Error loading summary.';
      loveCard.querySelector('div').textContent = 'Error loading romantic compatibility.';
      friendshipCard.querySelector('div').textContent = 'Error loading friendship compatibility.';
      workCard.querySelector('div').textContent = 'Error loading work compatibility.';
      // Show empty lists on error
      renderBirthChartList(chartPerson1, {});
      renderBirthChartList(chartPerson2, {});
    }
  });
});
