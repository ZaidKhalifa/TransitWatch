document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('legsContainer');
  const addBtn = document.getElementById('addLegBtn');
  const template = document.getElementById('legTemplate').innerHTML;
  const form = document.querySelector('form');

  let legCount = 0;

  // NEW: Track leg data for walk time calculations
  const legData = new Map();

  // NEW: Cache all stops (loaded once on page load)
  let allStopsCache = null;

  // NEW: Check for edit mode
  const isEditMode = !!window.existingCommute;

  // NEW: Load all stops on page load for flexible selection
  loadAllStops();

  async function loadAllStops() {
    try {
      allStopsCache = await fetch('/api/stops').then(r => r.json());
    } catch (e) {
      console.error('Error loading all stops:', e);
      allStopsCache = [];
    }
  }

  addBtn.onclick = () => {
    if (legCount >= 4) return alert('Max 4 legs allowed');
    addLeg();
    updateWalkTimeCards();
  };

  function addLeg(existingLeg = null) {
    const html = template.replaceAll('INDEX', legCount);
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const leg = wrap.firstElementChild;

    leg.querySelector('.leg-number').textContent = legCount + 1;
    leg.dataset.legIndex = legCount;
    container.appendChild(leg);

    // Initialize leg data
    legData.set(legCount, {
      originStopId: null,
      destStopId: null,
      transitSystem: null,
      walkTimeAfter: null,
      userCustomized: false
    });

    wireLeg(leg, legCount, existingLeg);
    legCount++;
  }

  function wireLeg(leg, index, existingLeg = null) {
    const transit = leg.querySelector('.transitMode');

    const originInput = leg.querySelector('.origin-input');
    const originHidden = leg.querySelector('.origin-hidden');
    const originList = leg.querySelector('.origin-list');

    const destInput = leg.querySelector('.dest-input');
    const destHidden = leg.querySelector('.dest-hidden');
    const destList = leg.querySelector('.dest-list');

    // Cache for filtered stops
    let systemStops = [];   // Stops for selected transit system
    let validOrigins = [];  // Valid origins (when dest selected first)
    let validDests = [];    // Valid destinations (when origin selected first)

    // NEW: Enable inputs by default for flexible selection
    originInput.disabled = false;
    destInput.disabled = false;
    originInput.placeholder = 'Click or type to search…';
    destInput.placeholder = 'Click or type to search…';

    leg.querySelector('.leg-remove').onclick = () => {
      legData.delete(index);
      leg.remove();
      renumber();
      updateWalkTimeCards();
    };

    // =========================================================================
    // TRANSIT SYSTEM CHANGE
    // =========================================================================
    transit.onchange = async () => {
      // If transit was auto-set, don't reset
      if (transit.dataset.autoSet) {
        transit.dataset.autoSet = '';
        return;
      }

      // User manually changed transit system
      if (!transit.value) {
        // Unselected - go back to "all stops" mode
        systemStops = [];
        validOrigins = allStopsCache || [];
        validDests = allStopsCache || [];
        
        // Clear selections but keep inputs enabled
        clearOrigin();
        clearDest();
        return;
      }

      // Selected a transit system - load its stops
      systemStops = await fetch(`/api/stops/${transit.value}`).then(r => r.json());
      validOrigins = systemStops;
      validDests = systemStops;

      // Clear any existing selections
      clearOrigin();
      clearDest();

      // Update leg data
      const ld = legData.get(index);
      if (ld) ld.transitSystem = transit.value;
    };

    // =========================================================================
    // ORIGIN INPUT
    // =========================================================================
    originInput.onfocus = () => {
      if (originInput.classList.contains('locked')) return;

      // Show dropdown with available stops
      const stops = getOriginStops();
      if (stops.length > 0) {
        renderDropdown(originList, stops.slice(0, 20), selectOrigin);
      } else if (!allStopsCache) {
        originList.innerHTML = '<div class="dropdown-hint">Loading stops...</div>';
      }
    };

    originInput.oninput = () => {
      if (originInput.classList.contains('locked')) return;

      const stops = getOriginStops();
      const filtered = smartFilter(stops, originInput.value);
      renderDropdown(originList, filtered, selectOrigin);
    };

    // Click locked origin to clear
    originInput.onclick = () => {
      if (originInput.classList.contains('locked')) {
        clearOrigin();
        originInput.focus();
      }
    };

    function getOriginStops() {
      // Priority: validOrigins (filtered by dest) > systemStops > allStopsCache
      if (validOrigins.length > 0) return validOrigins;
      if (systemStops.length > 0) return systemStops;
      return allStopsCache || [];
    }

    async function selectOrigin(stop) {
      originInput.value = stop.stopName;
      originHidden.innerHTML = `<option value="${stop.stopId}" selected></option>`;
      originInput.classList.add('locked');
      originList.innerHTML = '';

      // Update leg data
      const ld = legData.get(index);
      if (ld) ld.originStopId = stop.stopId;

      // If no transit system selected, auto-detect from stop
      if (!transit.value && stop.transitSystem) {
        transit.value = stop.transitSystem;
        transit.dataset.autoSet = 'true';
        if (ld) ld.transitSystem = stop.transitSystem;
        
        // Load system stops
        systemStops = await fetch(`/api/stops/${stop.transitSystem}`).then(r => r.json());
      }

      // Load valid destinations for this origin
      try {
        const data = await fetch(`/api/destinations/${stop.stopId}`).then(r => r.json());
        validDests = data.destinations || data || [];
        
        // Auto-set transit if returned
        if (!transit.value && data.transitSystem) {
          transit.value = data.transitSystem;
          transit.dataset.autoSet = 'true';
          if (ld) ld.transitSystem = data.transitSystem;
          systemStops = await fetch(`/api/stops/${data.transitSystem}`).then(r => r.json());
        }
      } catch (e) {
        console.error('Error loading destinations:', e);
        validDests = systemStops.length > 0 ? systemStops : (allStopsCache || []);
      }

      calculateWalkTimeToPrevLeg(index);
      updateWalkTimeCards();
    }

    function clearOrigin() {
      originInput.value = '';
      originInput.classList.remove('locked');
      originHidden.innerHTML = '';
      originInput.placeholder = 'Click or type to search…';

      const ld = legData.get(index);
      if (ld) ld.originStopId = null;

      // Reset valid destinations if transit system is selected
      if (transit.value && systemStops.length > 0) {
        validDests = systemStops;
      } else {
        validDests = allStopsCache || [];
      }

      updateWalkTimeCards();
    }

    // =========================================================================
    // DESTINATION INPUT
    // =========================================================================
    destInput.onfocus = () => {
      if (destInput.classList.contains('locked')) return;

      const stops = getDestStops();
      if (stops.length > 0) {
        renderDropdown(destList, stops.slice(0, 20), selectDest);
      } else if (!allStopsCache) {
        destList.innerHTML = '<div class="dropdown-hint">Loading stops...</div>';
      }
    };

    destInput.oninput = () => {
      if (destInput.classList.contains('locked')) return;

      const stops = getDestStops();
      const filtered = smartFilter(stops, destInput.value);
      renderDropdown(destList, filtered, selectDest);
    };

    // Click locked dest to clear
    destInput.onclick = () => {
      if (destInput.classList.contains('locked')) {
        clearDest();
        destInput.focus();
      }
    };

    function getDestStops() {
      // Priority: validDests (filtered by origin) > systemStops > allStopsCache
      if (validDests.length > 0) return validDests;
      if (systemStops.length > 0) return systemStops;
      return allStopsCache || [];
    }

    async function selectDest(stop) {
      destInput.value = stop.stopName;
      destHidden.innerHTML = `<option value="${stop.stopId}" selected></option>`;
      destInput.classList.add('locked');
      destList.innerHTML = '';

      // Update leg data
      const ld = legData.get(index);
      if (ld) ld.destStopId = stop.stopId;

      // If no transit system selected, auto-detect from stop
      if (!transit.value && stop.transitSystem) {
        transit.value = stop.transitSystem;
        transit.dataset.autoSet = 'true';
        if (ld) ld.transitSystem = stop.transitSystem;
        
        // Load system stops
        systemStops = await fetch(`/api/stops/${stop.transitSystem}`).then(r => r.json());
      }

      // Load valid origins for this destination
      try {
        const data = await fetch(`/api/origins/${stop.stopId}`).then(r => r.json());
        validOrigins = data.origins || data || [];
        
        // Auto-set transit if returned
        if (!transit.value && data.transitSystem) {
          transit.value = data.transitSystem;
          transit.dataset.autoSet = 'true';
          if (ld) ld.transitSystem = data.transitSystem;
          systemStops = await fetch(`/api/stops/${data.transitSystem}`).then(r => r.json());
        }
      } catch (e) {
        console.error('Error loading origins:', e);
        validOrigins = systemStops.length > 0 ? systemStops : (allStopsCache || []);
      }

      calculateWalkTimeToNextLeg(index);
      updateWalkTimeCards();
    }

    function clearDest() {
      destInput.value = '';
      destInput.classList.remove('locked');
      destHidden.innerHTML = '';
      destInput.placeholder = 'Click or type to search…';

      const ld = legData.get(index);
      if (ld) ld.destStopId = null;

      // Reset valid origins if transit system is selected
      if (transit.value && systemStops.length > 0) {
        validOrigins = systemStops;
      } else {
        validOrigins = allStopsCache || [];
      }

      updateWalkTimeCards();
    }

    // =========================================================================
    // CLOSE DROPDOWNS ON OUTSIDE CLICK
    // =========================================================================
    document.addEventListener('click', (e) => {
      if (!leg.contains(e.target)) {
        originList.innerHTML = '';
        destList.innerHTML = '';
      }
    });

    // =========================================================================
    // EDIT MODE - PREFILL EXISTING DATA
    // =========================================================================
    if (existingLeg) {
      prefillLeg(existingLeg);
    }

    async function prefillLeg(legInfo) {
      // Set transit system first
      transit.value = legInfo.transitMode;
      transit.dataset.autoSet = 'true';
      
      // Load system stops
      systemStops = await fetch(`/api/stops/${legInfo.transitMode}`).then(r => r.json());
      validOrigins = systemStops;
      validDests = systemStops;

      // Update leg data
      const ld = legData.get(index);
      if (ld) ld.transitSystem = legInfo.transitMode;

      // Select origin
      const originStop = systemStops.find(s => s.stopId === legInfo.originStopId) || {
        stopId: legInfo.originStopId,
        stopName: legInfo.originStopName,
        transitSystem: legInfo.transitMode
      };
      await selectOrigin(originStop);

      // Small delay to let destinations load
      await new Promise(r => setTimeout(r, 100));

      // Select destination
      const destStop = (validDests.length > 0 ? validDests : systemStops).find(s => s.stopId === legInfo.destinationStopId) || {
        stopId: legInfo.destinationStopId,
        stopName: legInfo.destinationStopName,
        transitSystem: legInfo.transitMode
      };
      await selectDest(destStop);

      // Restore walk time if exists
      if (legInfo.preferences?.walkingTimeAfterMinutes != null) {
        if (ld) {
          ld.walkTimeAfter = legInfo.preferences.walkingTimeAfterMinutes;
          ld.userCustomized = legInfo.preferences.walkingTimeUserCustomized || false;
        }
      }
    }
  }

  // ===========================================================================
  // DROPDOWN RENDERING
  // ===========================================================================
  function renderDropdown(container, items, onSelect) {
    container.innerHTML = '';
    if (!items?.length) {
      container.innerHTML = '<div class="dropdown-empty">No stops found</div>';
      return;
    }

    const seen = new Set();

    items.forEach(item => {
      if (seen.has(item.stopId)) return;
      seen.add(item.stopId);

      const div = document.createElement('div');
      div.className = 'dropdown-item';
      
      // Show transit system badge if searching all stops
      if (item.transitSystem) {
        div.innerHTML = `<span class="stop-name">${item.stopName}</span><span class="stop-system">${item.transitSystem}</span>`;
      } else {
        div.textContent = item.stopName;
      }
      
      div.onclick = (e) => {
        e.stopPropagation();
        onSelect(item);
      };

      container.appendChild(div);
    });
  }

  function renumber() {
    document.querySelectorAll('.leg-card').forEach((l, i) => {
      l.querySelector('.leg-number').textContent = i + 1;
    });
    legCount = document.querySelectorAll('.leg-card').length;
    updateWalkTimeCards();
  }

  // ===========================================================================
  // WALK TIME CALCULATIONS
  // ===========================================================================
  async function calculateWalkTimeToPrevLeg(currentIndex) {
    if (currentIndex === 0) return;

    const currentLd = legData.get(currentIndex);
    const prevLd = legData.get(currentIndex - 1);

    if (!currentLd?.originStopId || !prevLd?.destStopId) return;
    if (prevLd.userCustomized) return;

    try {
      const response = await fetch(`/api/walk-time?from=${prevLd.destStopId}&to=${currentLd.originStopId}`);
      const data = await response.json();
      if (data.walkTimeMinutes != null) {
        prevLd.walkTimeAfter = data.walkTimeMinutes;
        updateWalkTimeCards();
      }
    } catch (e) {
      console.error('Error calculating walk time:', e);
    }
  }

  async function calculateWalkTimeToNextLeg(currentIndex) {
    const nextLd = legData.get(currentIndex + 1);
    const currentLd = legData.get(currentIndex);

    if (!nextLd?.originStopId || !currentLd?.destStopId) return;
    if (currentLd.userCustomized) return;

    try {
      const response = await fetch(`/api/walk-time?from=${currentLd.destStopId}&to=${nextLd.originStopId}`);
      const data = await response.json();
      if (data.walkTimeMinutes != null) {
        currentLd.walkTimeAfter = data.walkTimeMinutes;
        updateWalkTimeCards();
      }
    } catch (e) {
      console.error('Error calculating walk time:', e);
    }
  }

  // ===========================================================================
  // WALK TIME CARDS UI
  // ===========================================================================
  function updateWalkTimeCards() {
    // Remove existing connection cards
    document.querySelectorAll('.connection-card').forEach(c => c.remove());

    const legCards = document.querySelectorAll('.leg-card');

    legCards.forEach((legCard, visualIndex) => {
      const legIndex = parseInt(legCard.dataset.legIndex);
      const ld = legData.get(legIndex);

      // Only show card if this leg has dest AND next leg exists with origin
      const nextLegCard = legCards[visualIndex + 1];
      if (!nextLegCard || !ld?.destStopId) return;

      const nextLegIndex = parseInt(nextLegCard.dataset.legIndex);
      const nextLd = legData.get(nextLegIndex);
      if (!nextLd?.originStopId) return;

      // Create connection card
      const card = document.createElement('div');
      card.className = 'connection-card';
      card.dataset.legIndex = legIndex;

      const walkTime = ld.walkTimeAfter;
      const isLong = walkTime && walkTime > 10;
      const displayTime = walkTime != null ? `${walkTime} min walk` : 'Calculating...';

      card.innerHTML = `
        <div class="connection-content">
          <span class="walk-icon">🚶</span>
          <span class="walk-time-display">${displayTime}</span>
          <button type="button" class="edit-walk-btn" title="Edit walk time">✏️</button>
          <div class="walk-edit-group hidden">
            <input type="number" class="walk-input" min="1" max="60" value="${walkTime || 5}">
            <span>min</span>
            <button type="button" class="save-walk-btn">Save</button>
            <button type="button" class="cancel-walk-btn">Cancel</button>
          </div>
        </div>
        ${isLong ? '<div class="walk-warning">⚠️ Long connection (>10 min) - are you sure?</div>' : ''}
      `;

      wireWalkTimeCard(card, ld);
      legCard.after(card);
    });

    updateWalkTimeHiddenInputs();
  }

  function wireWalkTimeCard(card, ld) {
    const editBtn = card.querySelector('.edit-walk-btn');
    const editGroup = card.querySelector('.walk-edit-group');
    const walkDisplay = card.querySelector('.walk-time-display');
    const walkInput = card.querySelector('.walk-input');
    const saveBtn = card.querySelector('.save-walk-btn');
    const cancelBtn = card.querySelector('.cancel-walk-btn');

    editBtn.onclick = () => {
      editGroup.classList.remove('hidden');
      editBtn.classList.add('hidden');
      walkDisplay.classList.add('hidden');
      walkInput.focus();
    };

    cancelBtn.onclick = () => {
      editGroup.classList.add('hidden');
      editBtn.classList.remove('hidden');
      walkDisplay.classList.remove('hidden');
      walkInput.value = ld.walkTimeAfter || 5;
    };

    saveBtn.onclick = () => {
      const newTime = parseInt(walkInput.value);
      if (newTime >= 1 && newTime <= 60) {
        ld.walkTimeAfter = newTime;
        ld.userCustomized = true;
        updateWalkTimeCards();
      }
    };
  }

  function updateWalkTimeHiddenInputs() {
    document.querySelectorAll('.walk-time-hidden').forEach(el => el.remove());

    legData.forEach((ld, index) => {
      if (ld.walkTimeAfter != null) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = `legs[${index}][walkTimeAfter]`;
        input.value = ld.walkTimeAfter;
        input.className = 'walk-time-hidden';
        form.appendChild(input);

        const customizedInput = document.createElement('input');
        customizedInput.type = 'hidden';
        customizedInput.name = `legs[${index}][walkTimeUserCustomized]`;
        customizedInput.value = ld.userCustomized ? 'true' : 'false';
        customizedInput.className = 'walk-time-hidden';
        form.appendChild(customizedInput);
      }
    });
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================
  if (isEditMode && window.existingCommute.legs) {
    const nameInput = document.querySelector('input[name="name"]');
    if (nameInput) nameInput.value = window.existingCommute.name || '';

    for (const leg of window.existingCommute.legs) {
      addLeg(leg);
    }
    updateWalkTimeCards();
  } else {
    addLeg();
  }
});

/* 🔍 SMART FILTER */
function smartFilter(items, query) {
  if (!query) return items.slice(0, 20);

  const q = query.toLowerCase();
  const map = new Map();

  for (const item of items) {
    const name = item.stopName.toLowerCase();
    if (name.startsWith(q) || name.includes(q)) {
      map.set(item.stopId, item);
    }
  }

  return Array.from(map.values()).slice(0, 20);
}