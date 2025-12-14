document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('legsContainer');
  const addBtn = document.getElementById('addLegBtn');
  const template = document.getElementById('legTemplate').innerHTML;

  let legCount = 0;

  addBtn.onclick = () => {
    if (legCount >= 4) return alert('Max 4 legs allowed');
    addLeg();
  };

  function addLeg() {
    const html = template.replaceAll('INDEX', legCount);
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const leg = wrap.firstElementChild;

    leg.querySelector('.leg-number').textContent = legCount + 1;
    container.appendChild(leg);

    wireLeg(leg, legCount);
    legCount++;
  }

  function wireLeg(leg, index) {
    const transit = leg.querySelector('.transitMode');

    const originInput = leg.querySelector('.origin-input');
    const originHidden = leg.querySelector('.origin-hidden');
    const originList = leg.querySelector('.origin-list');

    const destInput = leg.querySelector('.dest-input');
    const destHidden = leg.querySelector('.dest-hidden');
    const destList = leg.querySelector('.dest-list');

    leg.querySelector('.leg-remove').onclick = () => {
      leg.remove();
      renumber();
    };

    transit.onchange = async () => {
      resetAll();

      if (!transit.value) return;

      originInput.disabled = false;
      originInput.placeholder = 'Type origin…';

      const stops = await fetch(`/api/stops/${transit.value}`).then(r => r.json());

      originInput.oninput = () => {
        renderDropdown(
          originList,
          smartFilter(stops, originInput.value),
          stop => {
            originInput.value = stop.stopName;
            originHidden.innerHTML = `<option value="${stop.stopId}" selected></option>`;
            originInput.disabled = true;
            originList.innerHTML = '';
            loadDestinations(stop.stopId);
          }
        );
      };
    };

    async function loadDestinations(originId) {
      destInput.disabled = false;
      destInput.placeholder = 'Type destination…';

      const data = await fetch(`/api/destinations/${originId}`).then(r => r.json());
      const dests = data.destinations || [];

      destInput.oninput = () => {
        renderDropdown(
          destList,
          smartFilter(dests, destInput.value),
          stop => {
            destInput.value = stop.stopName;
            destHidden.innerHTML = `<option value="${stop.stopId}" selected></option>`;
            destInput.disabled = true;
            destList.innerHTML = '';
          }
        );
      };
    }

    function resetAll() {
      originInput.value = '';
      destInput.value = '';
      originHidden.innerHTML = '';
      destHidden.innerHTML = '';
      originInput.disabled = true;
      destInput.disabled = true;
      originList.innerHTML = '';
      destList.innerHTML = '';
    }

   
  }

  function renderDropdown(container, items, onSelect) {
    container.innerHTML = '';
    if (!items?.length) return;

    const seen = new Set();

    items.forEach(item => {
      if (seen.has(item.stopId)) return;
      seen.add(item.stopId);

      const div = document.createElement('div');
      div.className = 'dropdown-item';
      div.textContent = item.stopName;
      div.onclick = () => onSelect(item);

      container.appendChild(div);
    });
  }

  function renumber() {
    document.querySelectorAll('.leg-card').forEach((l, i) => {
      l.querySelector('.leg-number').textContent = i + 1;
    });
    legCount = document.querySelectorAll('.leg-card').length;
  }

  addLeg();
});

/* 🔍 SMART FILTER */
function smartFilter(items, query) {
  if (!query) return [];

  const q = query.toLowerCase();
  const map = new Map(); // stopId → stop

  for (const item of items) {
    const name = item.stopName.toLowerCase();
    if (name.startsWith(q) || name.includes(q)) {
      map.set(item.stopId, item); // overwrite duplicates
    }
  }

  return Array.from(map.values()).slice(0, 15);
}

