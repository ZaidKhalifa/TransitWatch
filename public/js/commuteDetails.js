/**
 * TransitWatch Commute Details Page
 * Single commute view with live tracking and reports feed
 */

(function() {
  'use strict';

  
  // CONSTANTS
  
  const MODE_EMOJIS = {
    'NJT_BUS': '🚌',
    'NJT_RAIL': '🚆',
    'MTA_BUS': '🚌',
    'MTA_SUBWAY': '🚇',
    'PATH': '🚇'
  };

  const MODE_LABELS = {
    'NJT_BUS': 'NJT Bus',
    'NJT_RAIL': 'NJT Rail',
    'MTA_BUS': 'MTA Bus',
    'MTA_SUBWAY': 'MTA Subway',
    'PATH': 'PATH'
  };

  const MODE_COLORS = {
    'NJT_BUS': 'njt',
    'NJT_RAIL': 'njt',
    'MTA_BUS': 'mta',
    'MTA_SUBWAY': 'mta',
    'PATH': 'path'
  };

  const POLL_INTERVAL = 30000; // 30 seconds
  const WALK_TIME_MAX = 120;

  
  // STATE
  
  const state = {
    commute: window.commuteData,
    commuteId: window.commuteId,
    stopIds: window.stopIds,
    legStates: [],
    lastCalculateResult: null,
    feasibility: null,
    isCalculating: false,
    pollIntervalId: null,
    reports: [],
    showUnpopular: false
  };

  
  // UTILITY FUNCTIONS
  
  function formatTime(dateInput) {
    if (!dateInput) return '--:--';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '--:--';
    
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minutesStr} ${ampm}`;
  }

  function getRelativeTime(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';
    
    const now = new Date();
    const diffMs = date - now;
    const diffMins = Math.round(diffMs / 60000);
    
    if (diffMins < -1) return `${Math.abs(diffMins)} min ago`;
    if (diffMins <= 0) return 'Now';
    if (diffMins === 1) return 'in 1 min';
    return `in ${diffMins} min`;
  }

  function hasTimePassed(departureTime) {
    if (!departureTime) return false;
    const depTime = new Date(departureTime);
    return depTime < new Date();
  }

  function formatTimeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  
  // INITIALIZATION
  
  function init() {
    if (!state.commute) {
      document.getElementById('legsContainer').innerHTML = '<p class="error">Failed to load commute data</p>';
      document.getElementById('reportsFeed').innerHTML = '<p class="error">No commute data</p>';
      return;
    }

    if (!state.commute.legs || !Array.isArray(state.commute.legs)) {
      document.getElementById('legsContainer').innerHTML = '<p class="error">Invalid commute data - no legs found</p>';
      return;
    }

    try {
      // Set title
      document.getElementById('commuteTitle').textContent = state.commute.name || 'Commute Details';

      // Initialize leg states
      state.legStates = state.commute.legs.map(() => ({
        status: 'active',
        selectedTripId: null,
        selectedRouteInfo: null,
        customWalkTime: null,
        availableTrips: [],
        displayedTripId: null,
        displayedDepartureTime: null
      }));

      // Render initial UI (shows legs with --:-- times)
      renderLegs();
      
      // Start polling for real-time data
      calculateAndRender();
      state.pollIntervalId = setInterval(calculateAndRender, POLL_INTERVAL);

      // Load reports (will show placeholder if API doesn't exist yet)
      loadReports();

      // Setup event listeners
      setupEventListeners();
      
    } catch (err) {
      document.getElementById('legsContainer').innerHTML = `<p class="error">Error: ${err.message}</p>`;
    }
  }

  
  // LEG RENDERING
  
  function renderLegs() {
    const container = document.getElementById('legsContainer');
    if (!container) {
      return;
    }
    
    container.innerHTML = '';

    if (!state.commute.legs || state.commute.legs.length === 0) {
      container.innerHTML = '<p class="error">No legs in this commute</p>';
      return;
    }

    state.commute.legs.forEach((leg, index) => {
      // Render leg card
      const legCard = createLegCard(leg, index);
      container.appendChild(legCard);

      // Render walk time card (except after last leg)
      if (index < state.commute.legs.length - 1) {
        const walkCard = createWalkTimeCard(leg, index);
        container.appendChild(walkCard);
      }
    });
  }

  function createLegCard(leg, index) {
    const legState = state.legStates[index];
    const modeEmoji = MODE_EMOJIS[leg.transitMode] || '🚍';
    const modeLabel = MODE_LABELS[leg.transitMode] || leg.transitMode;
    const modeColor = MODE_COLORS[leg.transitMode] || 'default';

    // Get trip info from last calculate result
    let departureTime = '--:--';
    let arrivalTime = '--:--';
    let relativeTime = '';
    let selectedRoute = '';
    let tripOptions = [];
    let hasDeparted = false;

    if (state.lastCalculateResult && state.lastCalculateResult.legs) {
      const legDetail = state.lastCalculateResult.legs.find(l => l.legOrder === index);
      if (legDetail && !legDetail.error && !legDetail.unsupported) {
        departureTime = formatTime(legDetail.departureTime);
        arrivalTime = formatTime(legDetail.arrivalTime);
        relativeTime = getRelativeTime(legDetail.departureTime);
        hasDeparted = hasTimePassed(legDetail.departureTime);
        selectedRoute = legDetail.direction || legDetail.routeId || '';
      }
    }

    // Get available trips for dropdown
    if (legState.availableTrips && legState.availableTrips.length > 0) {
      tripOptions = legState.availableTrips;
      
      // If user manually selected a trip, find it and show its route info
      if (legState.selectedTripId) {
        const selectedTrip = tripOptions.find(t => t.tripId === legState.selectedTripId);
        if (selectedTrip) {
          selectedRoute = selectedTrip.direction || selectedTrip.routeId || selectedRoute;
        }
      }
    }

    // Build routes display
    const routesDisplay = leg.routes && leg.routes.length > 0
      ? leg.routes.map(r => r.routeId).join(', ')
      : '';

    const card = document.createElement('div');
    card.className = `leg-card-vertical ${modeColor} ${legState.status}${hasDeparted ? ' departed' : ''}`;
    card.dataset.legIndex = index;

    // Determine status display
    let statusText = legState.status;
    let statusClass = legState.status;
    if (hasDeparted && legState.status === 'active') {
      statusText = 'departed';
      statusClass = 'departed';
    }

    card.innerHTML = `
      <div class="leg-header-vertical">
        <div class="leg-mode">
          <span class="mode-emoji">${modeEmoji}</span>
          <span class="mode-label">${modeLabel}</span>
          ${selectedRoute ? `<span class="leg-selected-route">${selectedRoute}</span>` : ''}
        </div>
        <div class="leg-status-badge ${statusClass}">${statusText}</div>
      </div>

      <div class="leg-stops-vertical">
        <div class="stop-row origin">
          <span class="stop-marker">●</span>
          <div class="stop-info">
            <span class="stop-name">${leg.originStopName}</span>
            <span class="stop-time">${departureTime} <small>${relativeTime}</small></span>
          </div>
        </div>
        <div class="stop-connector"></div>
        <div class="stop-row destination">
          <span class="stop-marker">◉</span>
          <div class="stop-info">
            <span class="stop-name">${leg.destinationStopName}</span>
            <span class="stop-time">${arrivalTime}</span>
          </div>
        </div>
      </div>

      ${routesDisplay ? `
        <div class="leg-routes">
          <span class="routes-label">Possible routes:</span>
          <span class="routes-list">${routesDisplay}</span>
        </div>
      ` : ''}

      ${tripOptions.length > 0 ? `
        <div class="leg-trip-selector">
          <label>Select Trip:</label>
          <select class="trip-dropdown" data-leg-index="${index}">
            <option value="">Auto (earliest)</option>
            ${tripOptions.slice(0, 10).map(trip => `
              <option value="${trip.tripId}" 
                      data-route-id="${trip.routeId || ''}"
                      data-route-name="${trip.routeName || ''}"
                      data-direction="${trip.direction || ''}"
                      ${legState.selectedTripId === trip.tripId ? 'selected' : ''}>
                ${formatTime(trip.scheduledDepartureTime)} - ${trip.direction || trip.routeId || 'Route'}
              </option>
            `).join('')}
          </select>
        </div>
      ` : ''}

      <div class="leg-actions-vertical">
        <button class="btn btn-small leg-taken-btn ${legState.status === 'taken' ? 'active' : ''}" data-leg-index="${index}">
          ${legState.status === 'taken' ? '✓ Taken' : 'Mark Taken'}
        </button>
      </div>
    `;

    return card;
  }

  function createWalkTimeCard(leg, index) {
    // Walk time after leg N is stored in legStates[N].customWalkTime
    // and sent as customWalkTimes[N+1] to the API
    const fromLegIndex = index;
    const toLegIndex = index + 1;
    
    // Get walk time: prefer custom value, then API response, then stored preference
    let walkTime = 5; // default
    
    // Check if user set a custom value
    if (state.legStates[fromLegIndex]?.customWalkTime != null) {
      walkTime = state.legStates[fromLegIndex].customWalkTime;
    }
    // Otherwise check API response
    else if (state.lastCalculateResult?.walkTimes) {
      const walkInfo = state.lastCalculateResult.walkTimes.find(w => w.legIndex === toLegIndex);
      if (walkInfo) {
        walkTime = walkInfo.minutes;
      }
    }
    // Otherwise use stored preference
    else if (leg.preferences?.walkingTimeAfterMinutes != null) {
      walkTime = leg.preferences.walkingTimeAfterMinutes;
    }

    const card = document.createElement('div');
    card.className = 'walk-time-card-vertical';
    card.dataset.legIndex = fromLegIndex; // Store FROM leg index

    card.innerHTML = `
      <div class="walk-icon">🚶</div>
      <div class="walk-info">
        <span class="walk-duration">${walkTime} min walk</span>
        <button class="btn btn-tiny edit-walk-btn" data-leg-index="${fromLegIndex}">Edit</button>
      </div>
      <div class="walk-edit-group hidden">
        <input type="number" class="walk-input" value="${walkTime}" min="1" max="${WALK_TIME_MAX}">
        <span>min</span>
        <button class="btn btn-tiny save-walk-btn" data-leg-index="${fromLegIndex}">Save</button>
        <button class="btn btn-tiny cancel-walk-btn" data-leg-index="${fromLegIndex}">Cancel</button>
      </div>
    `;

    return card;
  }

  
  // CALCULATE & UPDATE
  
  async function calculateAndRender() {
    if (state.isCalculating) return;
    state.isCalculating = true;

    try {
      // Build selectedTrips array - API expects { tripId, routeInfo } objects or null
      const selectedTrips = [];
      for (let i = 0; i < state.legStates.length; i++) {
        const ls = state.legStates[i];
        if (ls.selectedTripId) {
          // Look up route info from available trips
          const trip = ls.availableTrips?.find(t => t.tripId === ls.selectedTripId);
          selectedTrips[i] = {
            tripId: ls.selectedTripId,
            routeInfo: {
              routeId: trip?.routeId || ls.selectedRouteInfo?.routeId || '',
              routeName: trip?.routeName || ls.selectedRouteInfo?.routeName || '',
              direction: trip?.direction || ls.selectedRouteInfo?.direction || ''
            }
          };
        } else {
          selectedTrips[i] = null;
        }
      }
      
      // Build customWalkTimes array
      // Walk time after leg N is stored in legStates[N].customWalkTime
      // API expects: customWalkTimes[legOrder + 1] = walk time after leg at legOrder
      // So customWalkTimes[1] = walk time after leg 0 = legStates[0].customWalkTime
      const customWalkTimes = [];
      for (let i = 0; i < state.legStates.length; i++) {
        if (state.legStates[i].customWalkTime != null) {
          customWalkTimes[i + 1] = state.legStates[i].customWalkTime;
        }
      }

      const response = await fetch(`/api/commute/${state.commuteId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          beginningLegOrder: 0,
          selectedTrips,
          customWalkTimes
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Calculate failed');
      }

      const result = await response.json();
      state.lastCalculateResult = result;

      // Update journey summary
      updateJourneySummary(result);

      // Fetch leg options for dropdowns, then render
      await fetchLegOptions();

      // Update feasibility
      updateFeasibility();

    } catch (err) {
      // Show error to user
      const summary = document.getElementById('journeySummary');
      if (summary) {
        summary.innerHTML = `<div class="summary-error">⚠️ ${err.message || 'Failed to load times'}</div>`;
      }
      // Still render what we have
      renderLegs();
    } finally {
      state.isCalculating = false;
    }
  }

  function updateJourneySummary(result) {
    const summary = document.getElementById('journeySummary');
    if (!result || !result.legs || result.legs.length === 0) return;

    const firstLeg = result.legs[0];
    const lastLeg = result.legs[result.legs.length - 1];
    const departTime = formatTime(firstLeg.departureTime);
    const arriveTime = formatTime(lastLeg.arrivalTime);

    // Calculate total duration
    let totalDuration = 0;
    result.legs.forEach(leg => {
      if (leg.duration) totalDuration += leg.duration;
    });

    summary.innerHTML = `
      <div class="summary-times">
        <span class="summary-depart">Depart: ${departTime}</span>
        <span class="summary-arrive">Arrive: ${arriveTime}</span>
        <span class="summary-duration">(${totalDuration} min)</span>
      </div>
    `;
  }

  async function fetchLegOptions() {
    // We need to fetch options for each leg with the correct minTime
    // minTime for leg N = arrival time of leg N-1 + walk time after leg N-1
    
    for (let i = 0; i < state.commute.legs.length; i++) {
      try {
        let minTime = new Date(); // default to now for first leg
        
        // For subsequent legs, use previous leg's arrival + walk time
        if (i > 0 && state.lastCalculateResult?.legs) {
          const prevLegDetail = state.lastCalculateResult.legs.find(l => l.legOrder === i - 1);
          if (prevLegDetail?.arrivalTime) {
            minTime = new Date(prevLegDetail.arrivalTime);
            
            // Add walk time
            const walkInfo = state.lastCalculateResult.walkTimes?.find(w => w.legIndex === i);
            if (walkInfo) {
              minTime.setMinutes(minTime.getMinutes() + walkInfo.minutes);
            }
          }
        }
        
        const response = await fetch(`/api/commute/${state.commuteId}/leg-options/${i}?minTime=${minTime.toISOString()}`);
        if (response.ok) {
          const data = await response.json();
          state.legStates[i].availableTrips = data.trips || [];
        }
      } catch (err) {
        // Silently fail - trips dropdown just won't show
      }
    }
    
    // Re-render to show updated dropdowns
    renderLegs();
  }

  async function updateFeasibility() {
    const banner = document.getElementById('feasibilityBanner');
    const scoreEl = document.getElementById('feasibilityScore');
    const messageEl = document.getElementById('feasibilityMessage');

    try {
      const response = await fetch(`/api/commute/${state.commuteId}/feasibility`);
      if (!response.ok) throw new Error('Failed to fetch feasibility');
      
      const data = await response.json();
      const { score, level, message } = data;

      banner.className = `feasibility-banner ${level}`;
      scoreEl.textContent = `${score}/10`;
      messageEl.textContent = message;
    } catch (err) {
      console.error('Feasibility fetch error:', err);
      banner.className = 'feasibility-banner';
      scoreEl.textContent = '--';
      messageEl.textContent = 'Unable to load';
    }
  }

  
  // REPORTS FEED
  
  async function loadReports() {
    const feed = document.getElementById('reportsFeed');
    const unpopularBtn = document.getElementById('loadUnpopularBtn');
    const noReportsMsg = document.getElementById('noReportsMessage');

    // Hide the unpopular button for now
    unpopularBtn.style.display = 'none';

    try {
      // Fetch reports for stops in this commute
      const stopIdsParam = encodeURIComponent(JSON.stringify(state.stopIds));
      const response = await fetch(`/api/reports/by-stops?stopIds=${stopIdsParam}&popular=${!state.showUnpopular}`);
      
      if (response.status === 404 || !response.ok) {
        // API doesn't exist yet or error - show no reports message
        feed.innerHTML = '';
        noReportsMsg.textContent = 'No reports for any stops in this commute.';
        noReportsMsg.style.display = 'block';
        return;
      }

      const data = await response.json();
      state.reports = data.reports || [];

      if (state.reports.length === 0) {
        feed.innerHTML = '';
        noReportsMsg.textContent = 'No reports for any stops in this commute.';
        noReportsMsg.style.display = 'block';
        return;
      }

      noReportsMsg.style.display = 'none';
      unpopularBtn.style.display = state.showUnpopular ? 'none' : 'block';
      
      renderReports();

    } catch (err) {
      // Error fetching - show no reports message
      feed.innerHTML = '';
      noReportsMsg.textContent = 'No reports for any stops in this commute.';
      noReportsMsg.style.display = 'block';
    }
  }

  function renderReports() {
    const feed = document.getElementById('reportsFeed');
    feed.innerHTML = '';

    state.reports.forEach(report => {
      const reportCard = createReportCard(report);
      feed.appendChild(reportCard);
    });
  }

  function createReportCard(report) {
    const card = document.createElement('div');
    card.className = `report-card ${report.status}`;
    card.dataset.reportId = report._id;

    const stopsText = report.stops.map(s => s.stopName).join(', ');
    const issueIcons = {
      'elevator': '🛗',
      'escalator': '📶',
      'bathroom': '🚻',
      'turnstile': '🚧',
      'other': '⚠️'
    };
    const icon = issueIcons[report.issueType] || '⚠️';

    // Check if current user has voted
    const userVote = report.userVote || 0; // 1 = upvoted, -1 = downvoted, 0 = none

    card.innerHTML = `
      <div class="report-header">
        <span class="report-icon">${icon}</span>
        <span class="report-type">${report.issueType}</span>
        <span class="report-severity severity-${report.severity > 7 ? 'high' : report.severity > 4 ? 'medium' : 'low'}">
          Severity: ${report.severity}/10
        </span>
      </div>
      <div class="report-stops">
        <small>📍 ${stopsText}</small>
      </div>
      <p class="report-description">${report.description}</p>
      <div class="report-footer">
        <div class="report-votes">
          <button class="vote-btn upvote ${userVote === 1 ? 'active' : ''}" data-report-id="${report._id}" data-vote="1">
            👍 ${report.upvotes || 0}
          </button>
          <button class="vote-btn downvote ${userVote === -1 ? 'active' : ''}" data-report-id="${report._id}" data-vote="-1">
            👎 ${report.downvotes || 0}
          </button>
          <span class="net-votes">(${report.netVotes >= 0 ? '+' : ''}${report.netVotes || 0})</span>
        </div>
        <div class="report-meta">
          <span class="report-author">by ${report.username}</span>
          <span class="report-time">${formatTimeAgo(report.createdAt)}</span>
        </div>
      </div>
    `;

    return card;
  }

  async function handleVote(reportId, vote) {
    try {
      const response = await fetch(`/api/reports/${reportId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote }) // 1 or -1
      });

      if (!response.ok) {
        const err = await response.json();
        alert(err.error || 'Failed to vote');
        return;
      }

      // Reload reports to show updated counts
      await loadReports();

    } catch (err) {
      console.error('Vote error:', err);
      alert('Failed to vote');
    }
  }

  
  // EVENT LISTENERS
  
  function setupEventListeners() {
    const container = document.getElementById('legsContainer');
    const feed = document.getElementById('reportsFeed');

    // Trip dropdown change
    container.addEventListener('change', (e) => {
      if (e.target.classList.contains('trip-dropdown')) {
        const legIndex = parseInt(e.target.dataset.legIndex);
        const selectedOption = e.target.options[e.target.selectedIndex];
        
        if (e.target.value) {
          // User selected a specific trip
          state.legStates[legIndex].selectedTripId = e.target.value;
          state.legStates[legIndex].selectedRouteInfo = {
            routeId: selectedOption.dataset.routeId || '',
            routeName: selectedOption.dataset.routeName || '',
            direction: selectedOption.dataset.direction || ''
          };
        } else {
          // Auto (earliest) selected
          state.legStates[legIndex].selectedTripId = null;
          state.legStates[legIndex].selectedRouteInfo = null;
        }
        calculateAndRender();
      }
    });

    // Mark as taken button
    container.addEventListener('click', (e) => {
      if (e.target.classList.contains('leg-taken-btn')) {
        const legIndex = parseInt(e.target.dataset.legIndex);
        const legState = state.legStates[legIndex];
        legState.status = legState.status === 'taken' ? 'active' : 'taken';
        renderLegs();
      }

      // Edit walk time
      if (e.target.classList.contains('edit-walk-btn')) {
        const card = e.target.closest('.walk-time-card-vertical');
        card.querySelector('.walk-info').classList.add('hidden');
        card.querySelector('.walk-edit-group').classList.remove('hidden');
      }

      // Save walk time
      if (e.target.classList.contains('save-walk-btn')) {
        const legIndex = parseInt(e.target.dataset.legIndex);
        const card = e.target.closest('.walk-time-card-vertical');
        const input = card.querySelector('.walk-input');
        const newTime = parseInt(input.value);
        
        if (newTime >= 1 && newTime <= WALK_TIME_MAX) {
          state.legStates[legIndex].customWalkTime = newTime;
          calculateAndRender();
        }
        
        card.querySelector('.walk-info').classList.remove('hidden');
        card.querySelector('.walk-edit-group').classList.add('hidden');
      }

      // Cancel walk time edit
      if (e.target.classList.contains('cancel-walk-btn')) {
        const card = e.target.closest('.walk-time-card-vertical');
        card.querySelector('.walk-info').classList.remove('hidden');
        card.querySelector('.walk-edit-group').classList.add('hidden');
      }
    });

    // Vote buttons
    feed.addEventListener('click', (e) => {
      if (e.target.classList.contains('vote-btn')) {
        const reportId = e.target.dataset.reportId;
        const vote = parseInt(e.target.dataset.vote);
        handleVote(reportId, vote);
      }
    });

    // Load unpopular reports
    document.getElementById('loadUnpopularBtn').addEventListener('click', () => {
      state.showUnpopular = true;
      loadReports();
    });

    // Delete commute
    document.getElementById('deleteCommuteBtn').addEventListener('click', () => {
      document.getElementById('deleteModal').style.display = 'flex';
    });

    document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
      document.getElementById('deleteModal').style.display = 'none';
    });

    document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
      try {
        const response = await fetch(`/api/commute/${state.commuteId}`, {
          method: 'DELETE'
        });
        if (response.ok) {
          window.location.href = '/dashboard';
        } else {
          alert('Failed to delete commute');
        }
      } catch (err) {
        alert('Failed to delete commute');
      }
    });
  }

  
  // START
  
  document.addEventListener('DOMContentLoaded', init);

})();