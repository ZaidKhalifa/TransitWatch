/**
 * TransitWatch Dashboard client code
 * Handles real-time commute tracking, trip selection, and UI updates
 */

(function() {
    'use strict';
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
    const WALK_TIME_MIN = 0;
    const WALK_TIME_MAX = 120;

    // States

    // Global state for all commutes
    const state = {
        commutes: [],           // Raw commute data from API
        commuteStates: {},      // Per-commute UI state (keys are commuteId)
        pollIntervalId: null,   // Polling timer ID
        isLoading: true
    };

    /**
     * Initialize state for a commute
     * @param {Object} commute - Commute object from API
     */
    function initCommuteState(commute) {
        const commuteId = commute._id;
        state.commuteStates[commuteId] = {
            legStates: commute.legs.map((leg, index) => ({
                status: 'active',           // 'active' | 'prompt' | 'in-transit' | 'taken'
                selectedTripId: null,       // null = auto-select
                selectedRouteInfo: null,    // { routeId, routeName, direction }
                customWalkTime: null,       // null = use value from db
                availableTrips: [],         // Trips from leg-options API
                displayedTripId: null,      // Currently displayed trip (for prompt detection)
                displayedDepartureTime: null // ISO string of displayed departure
            })),
            lastCalculateResult: null,      // Cached calculate response
            feasibility: null,              // {score, level, message}
            isCalculating: false,
            error: null
        };
    }

    /**
     * Format time as "10:02 AM"
     * @param {string|Date} dateInput - ISO string or Date object
     * @returns {string} Formatted time
     */
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

    /**
     * Calculate "in X min" relative time
     * @param {string|Date} dateInput - ISO string or Date object
     * @returns {string} Relative time string
     */
    function getRelativeTime(dateInput) {
        if (!dateInput) return '';
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return '';
        
        const now = new Date();
        const diffMs = date - now;
        const diffMins = Math.round(diffMs / 60000);
        
        if (diffMins < 0) return 'departed';
        if (diffMins === 0) return 'now';
        if (diffMins === 1) return 'in 1 min';
        if (diffMins < 60) return `in ${diffMins} min`;
        
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        if (mins === 0) return `in ${hours} hr`;
        return `in ${hours} hr ${mins} min`;
    }

    /**
     * Check if a departure time has passed (with 1 minute grace)
     * @param {string|Date} departureTime - Departure time
     * @returns {boolean} True if time has passed
     */
    function hasTimePassed(departureTime) {
        if (!departureTime) return false;
        const depTime = new Date(departureTime);
        const now = new Date();
        // Time has passed if we're at least 1 minute past departure
        return (now - depTime) >= 60000;
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Truncate stop name for display
     * @param {string} name - Stop name
     * @param {number} maxLen - Maximum length
     * @returns {string} Truncated name
     */
    function truncateStopName(name, maxLen = 25) {
        if (!name) return '';
        if (name.length <= maxLen) return name;
        return name.substring(0, maxLen - 3) + '...';
    }

    /**
     * Fetch all commutes for the current user
     * @returns {Promise<Array>} Array of commute objects
     */
    async function fetchCommutes() {
        const response = await fetch('/api/commutes');
        if (!response.ok) {
            throw new Error('Failed to fetch commutes');
        }
        return response.json();
    }

    /**
     * Fetch available trip options for a specific leg
     * @param {string} commuteId - Commute ID
     * @param {number} legOrder - Leg index
     * @param {string|null} minTime - Minimum departure time (ISO string)
     * @returns {Promise<Object>} Leg options response
     */
    async function fetchLegOptions(commuteId, legOrder, minTime = null) {
        let url = `/api/commute/${commuteId}/leg-options/${legOrder}`;
        if (minTime) {
            url += `?minTime=${encodeURIComponent(minTime)}`;
        }
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch leg options');
        }
        return response.json();
    }

    /**
     * Calculate commute timing
     * @param {string} commuteId - Commute ID
     * @param {Object} options - Calculate options
     * @returns {Promise<Object>} Calculate response
     */
    async function calculateCommute(commuteId, options) {
        const response = await fetch(`/api/commute/${commuteId}/calculate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });
        if (!response.ok) {
            throw new Error('Failed to calculate commute');
        }
        return response.json();
    }

    /**
     * Fetch feasibility score for a commute
     * @param {string} commuteId - Commute ID
     * @returns {Promise<Object>} Feasibility response { score, level, message }
     */
    async function fetchFeasibility(commuteId) {
        const response = await fetch(`/api/commute/${commuteId}/feasibility`);
        if (!response.ok) {
            throw new Error('Failed to fetch feasibility');
        }
        return response.json();
    };

    // DOM elements

    const loadingEl = document.getElementById('dashboard-loading');
    const emptyEl = document.getElementById('dashboard-empty');
    const containerEl = document.getElementById('commutes-container');
    const errorEl = document.getElementById('dashboard-error');
    const errorMessageEl = document.getElementById('dashboard-error-message');

    function showLoading() {
        loadingEl.style.display = 'block';
        emptyEl.style.display = 'none';
        containerEl.style.display = 'none';
        errorEl.style.display = 'none';
    }

    function showEmpty() {
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
        containerEl.style.display = 'none';
        errorEl.style.display = 'none';
    }

    function showCommutes() {
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'none';
        containerEl.style.display = 'block';
        errorEl.style.display = 'none';
    }

    function showError(message) {
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'none';
        containerEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorMessageEl.textContent = message;
    }

    /**
     * Render a single leg card
     * @param {Object} leg - Leg data from commute
     * @param {Object} legDetail - Leg detail from calculate response (or null)
     * @param {Object} legState - Leg UI state
     * @param {number} legIndex - Leg index
     * @param {string} commuteId - Parent commute ID
     * @returns {string} HTML string
     */
    function renderLegCard(leg, legDetail, legState, legIndex, commuteId) {
        const mode = leg.transitMode;
        const emoji = MODE_EMOJIS[mode] || '🚏';
        const label = MODE_LABELS[mode] || mode;
        const colorClass = MODE_COLORS[mode] || 'default';
        
        const isTaken = legState.status === 'taken' || legState.status === 'in-transit';
        const isPrompt = legState.status === 'prompt';
        const hasError = legDetail && (legDetail.error || legDetail.unavailable || legDetail.unsupported);
        
        // Determine what times to display
        let departureTime = '--:--';
        let arrivalTime = '--:--';
        let relativeTime = '';
        let direction = '';
        
        if (legDetail && !hasError) {
            departureTime = formatTime(legDetail.departureTime);
            arrivalTime = formatTime(legDetail.arrivalTime);
            relativeTime = getRelativeTime(legDetail.departureTime);
            direction = legDetail.direction || '';
        }
        
        // Build dropdown options HTML - only show if user can actually select
        let dropdownHtml = '';
        if (!isTaken && legState.availableTrips && legState.availableTrips.length > 0) {
            const options = legState.availableTrips.map(trip => {
                const selected = (legState.selectedTripId === trip.tripId) || 
                                 (!legState.selectedTripId && trip.tripId === legState.availableTrips[0].tripId);
                return `<option value="${escapeHtml(trip.tripId)}" 
                                data-route-id="${escapeHtml(trip.routeId)}"
                                data-route-name="${escapeHtml(trip.routeName)}"
                                data-direction="${escapeHtml(trip.direction)}"
                                ${selected ? 'selected' : ''}>
                            ${formatTime(trip.scheduledDepartureTime)}
                        </option>`;
            }).join('');
            dropdownHtml = `
                <select class="leg-trip-select" data-commute-id="${commuteId}" data-leg-index="${legIndex}">
                    ${options}
                </select>
            `;
        } else if (hasError) {
            dropdownHtml = `
                <select class="leg-trip-select" disabled>
                    <option>Unavailable</option>
                </select>
            `;
        }
        // Otherwise: no dropdown - times shown above are from calculate result

        // Overlay content for taken/prompt states
        let overlayHtml = '';
        if (isPrompt) {
            overlayHtml = `
                <div class="leg-overlay leg-overlay-prompt">
                    <p>Have you taken this ${label.toLowerCase()}?</p>
                    <div class="prompt-buttons">
                        <button class="btn btn-small btn-primary prompt-yes" 
                                data-commute-id="${commuteId}" data-leg-index="${legIndex}">Yes</button>
                        <button class="btn btn-small btn-secondary prompt-no" 
                                data-commute-id="${commuteId}" data-leg-index="${legIndex}">No</button>
                    </div>
                </div>
            `;
        } else if (isTaken) {
            const statusText = legState.status === 'in-transit' ? 'In Transit' : 'Completed';
            overlayHtml = `
                <div class="leg-overlay leg-overlay-taken">
                    <span class="taken-badge">${statusText}</span>
                </div>
            `;
        }

        // Error message if applicable
        let errorHtml = '';
        if (hasError) {
            errorHtml = `<div class="leg-error">${escapeHtml(legDetail.error)}</div>`;
        }

        return `
            <div class="leg-card ${isTaken ? 'leg-taken' : ''} ${hasError ? 'leg-error-state' : ''}" 
                 data-leg-index="${legIndex}" 
                 data-status="${legState.status}"
                 data-mode="${mode}">
                ${overlayHtml}
                
                <div class="leg-header">
                    <label class="leg-checkbox-label">
                        <input type="checkbox" class="leg-taken-checkbox" 
                               data-commute-id="${commuteId}" 
                               data-leg-index="${legIndex}"
                               ${isTaken ? 'checked' : ''}>
                    </label>
                    <span class="leg-mode leg-mode-${colorClass}">${emoji} ${label}</span>
                    <span class="leg-route">${escapeHtml(direction)}</span>
                </div>
                
                <div class="leg-times">
                    <div class="leg-departure">
                        <span class="leg-time">${departureTime}</span>
                        <span class="leg-stop-name" title="${escapeHtml(leg.originStopName)}">
                            ${escapeHtml(truncateStopName(leg.originStopName))}
                        </span>
                    </div>
                    <span class="leg-arrow">→</span>
                    <div class="leg-arrival">
                        <span class="leg-time">${arrivalTime}</span>
                        <span class="leg-stop-name" title="${escapeHtml(leg.destinationStopName)}">
                            ${escapeHtml(truncateStopName(leg.destinationStopName))}
                        </span>
                    </div>
                </div>
                
                ${errorHtml}
                
                <div class="leg-controls">
                    ${dropdownHtml}
                    <span class="leg-relative-time">${relativeTime}</span>
                </div>
            </div>
        `;
    }

    /**
     * Render walk time connector between legs
     * @param {Object} walkTimeInfo - Walk time info from calculate response
     * @param {number} toLegIndex - Index of the leg this walk leads TO
     * @param {string} commuteId - Parent commute ID
     * @param {Object} commuteState - Commute UI state
     * @returns {string} HTML string
     */
    function renderWalkConnector(walkTimeInfo, toLegIndex, commuteId, commuteState) {
        const legState = commuteState.legStates[toLegIndex];
        const minutes = walkTimeInfo ? walkTimeInfo.minutes : 5;
        const isCustom = walkTimeInfo && walkTimeInfo.source === 'custom';
        
        return `
            <div class="walk-connector" data-to-leg-index="${toLegIndex}">
                <span class="walk-icon">🚶</span>
                <span class="walk-time ${isCustom ? 'walk-time-custom' : ''}" 
                      data-commute-id="${commuteId}"
                      data-leg-index="${toLegIndex}">${minutes} min</span>
                <button class="walk-edit-btn" 
                        data-commute-id="${commuteId}" 
                        data-leg-index="${toLegIndex}"
                        title="Edit walk time">✏️</button>
            </div>
        `;
    }

    /**
     * Render a complete commute card
     * @param {Object} commute - Commute object from API
     * @returns {string} HTML string
     */
    function renderCommuteCard(commute) {
        const commuteId = commute._id;
        const commuteState = state.commuteStates[commuteId];
        const calcResult = commuteState.lastCalculateResult;
        const feasibility = commuteState.feasibility;
        
        // Build feasibility indicator HTML
        let feasibilityHtml = '';
        if (feasibility) {
            const emoji = feasibility.level === 'good' ? '🟢' : 
                          feasibility.level === 'moderate' ? '🟡' : '🔴';
            feasibilityHtml = `
                <div class="feasibility-indicator feasibility-${feasibility.level}" 
                     title="${escapeHtml(feasibility.message)}">
                    <span class="feasibility-emoji">${emoji}</span>
                    <span class="feasibility-score">${feasibility.score}/10</span>
                </div>
            `;
        }
        
        // Build legs HTML
        let legsHtml = '';
        for (let i = 0; i < commute.legs.length; i++) {
            const leg = commute.legs[i];
            const legDetail = calcResult && calcResult.legs ? calcResult.legs.find(l => l.legOrder === i) : null;
            const legState = commuteState.legStates[i];
            
            // Add walk connector before leg (except first leg)
            if (i > 0 && calcResult && calcResult.walkTimes) {
                const walkInfo = calcResult.walkTimes.find(w => w.legIndex === i);
                legsHtml += renderWalkConnector(walkInfo, i, commuteId, commuteState);
            }
            
            legsHtml += renderLegCard(leg, legDetail, legState, i, commuteId);
        }
        
        // Summary info
        let summaryHtml = '';
        if (calcResult && calcResult.success) {
            summaryHtml = `
                <div class="commute-summary">
                    <span class="summary-total">Total: ${calcResult.totalDuration} min</span>
                    <span class="summary-depart">Depart: ${formatTime(calcResult.departureTime)}</span>
                    <span class="summary-arrive">Arrive: ${formatTime(calcResult.arrivalTime)}</span>
                </div>
            `;
        } else if (calcResult && calcResult.error) {
            summaryHtml = `
                <div class="commute-summary commute-summary-error">
                    <span class="summary-error">⚠️ ${escapeHtml(calcResult.error)}</span>
                </div>
            `;
        } else if (commuteState.isCalculating) {
            summaryHtml = `
                <div class="commute-summary">
                    <span class="summary-loading">Calculating...</span>
                </div>
            `;
        }

        return `
            <div class="commute-card" data-commute-id="${commuteId}">
                <div class="commute-card-header">
                    <div class="commute-header-left">
                        <h3 class="commute-name">${escapeHtml(commute.name)}</h3>
                        <div class="commute-meta">
                            <span class="commute-leg-count">${commute.legs.length} leg${commute.legs.length > 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    ${feasibilityHtml}
                </div>
                
                <div class="commute-legs-container">
                    ${legsHtml}
                </div>
                
                ${summaryHtml}
                
                <div class="commute-card-footer">
                    <button class="btn btn-small btn-secondary btn-more-details" 
                            data-commute-id="${commuteId}">More Details</button>
                </div>
            </div>
        `;
    }

    // Render all commutes
    function renderAllCommutes() {
        if (state.commutes.length === 0) {
            showEmpty();
            return;
        }
        
        containerEl.innerHTML = state.commutes.map(renderCommuteCard).join('');
        showCommutes();
        attachEventListeners();
    }

    /**
     * Re-render a single commute card (for updates)
     * @param {string} commuteId - Commute ID to re-render
     */
    function rerenderCommute(commuteId) {
        const commute = state.commutes.find(c => c._id === commuteId);
        if (!commute) return;
        
        const existingCard = containerEl.querySelector(`.commute-card[data-commute-id="${commuteId}"]`);
        if (!existingCard) return;
        
        const newHtml = renderCommuteCard(commute);
        const temp = document.createElement('div');
        temp.innerHTML = newHtml;
        const newCard = temp.firstElementChild;
        
        existingCard.replaceWith(newCard);
        attachEventListenersForCommute(commuteId);
    }

    // Event handlers

    /**
     * Handle trip dropdown change
     * @param {Event} event - Change event
     */
    async function handleTripSelect(event) {
        const select = event.target;
        const commuteId = select.dataset.commuteId;
        const legIndex = parseInt(select.dataset.legIndex);
        const selectedOption = select.options[select.selectedIndex];
        
        const tripId = select.value;
        const routeInfo = {
            routeId: selectedOption.dataset.routeId,
            routeName: selectedOption.dataset.routeName,
            direction: selectedOption.dataset.direction
        };
        
        // Update state
        const commuteState = state.commuteStates[commuteId];
        commuteState.legStates[legIndex].selectedTripId = tripId;
        commuteState.legStates[legIndex].selectedRouteInfo = routeInfo;
        
        // Recalculate
        await calculateAndUpdate(commuteId);
    }

    /**
     * Handle leg checkbox change (mark as taken)
     * @param {Event} event - Change event
     */
    async function handleCheckboxChange(event) {
        const checkbox = event.target;
        const commuteId = checkbox.dataset.commuteId;
        const legIndex = parseInt(checkbox.dataset.legIndex);
        const isChecked = checkbox.checked;
        
        const commuteState = state.commuteStates[commuteId];
        
        if (isChecked) {
            // Mark this leg and all previous legs as taken
            for (let i = 0; i <= legIndex; i++) {
                commuteState.legStates[i].status = 'taken';
            }
        } else {
            // Uncheck not supported - user should refresh
            // But just in case, reset to active
            commuteState.legStates[legIndex].status = 'active';
        }
        
        // Recalculate from next leg
        await calculateAndUpdate(commuteId);
    }

    /**
     * Handle "Yes" button on taken prompt
     * @param {Event} event - Click event
     */
    async function handlePromptYes(event) {
        const button = event.target;
        const commuteId = button.dataset.commuteId;
        const legIndex = parseInt(button.dataset.legIndex);
        
        const commuteState = state.commuteStates[commuteId];
        const legState = commuteState.legStates[legIndex];
        
        // Mark as in-transit (user confirmed they're on this trip)
        legState.status = 'in-transit';
        
        // Mark all previous legs as taken
        for (let i = 0; i < legIndex; i++) {
            commuteState.legStates[i].status = 'taken';
        }
        
        // Recalculate - next leg will use this trip's arrival time + walk
        await calculateAndUpdate(commuteId);
    }

    /**
     * Handle "No" button on taken prompt
     * @param {Event} event - Click event
     */
    async function handlePromptNo(event) {
        const button = event.target;
        const commuteId = button.dataset.commuteId;
        const legIndex = parseInt(button.dataset.legIndex);
        
        const commuteState = state.commuteStates[commuteId];
        const legState = commuteState.legStates[legIndex];
        
        // Reset to active, clear selection so it auto-selects next available
        legState.status = 'active';
        legState.selectedTripId = null;
        legState.selectedRouteInfo = null;
        
        // Recalculate
        await calculateAndUpdate(commuteId);
    }

    /**
     * Handle walk time edit button click
     * @param {Event} event - Click event
     */
    function handleWalkEditClick(event) {
        const button = event.target;
        const commuteId = button.dataset.commuteId;
        const legIndex = parseInt(button.dataset.legIndex);
        
        const connector = button.closest('.walk-connector');
        const walkTimeSpan = connector.querySelector('.walk-time');
        const currentValue = parseInt(walkTimeSpan.textContent) || 5;
        
        // Replace with input
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'walk-time-input';
        input.value = currentValue;
        input.min = WALK_TIME_MIN;
        input.max = WALK_TIME_MAX;
        input.dataset.commuteId = commuteId;
        input.dataset.legIndex = legIndex;
        
        walkTimeSpan.replaceWith(input);
        input.focus();
        input.select();
        
        // Handle blur and enter
        input.addEventListener('blur', handleWalkTimeBlur);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            } else if (e.key === 'Escape') {
                // Cancel - restore original value
                const span = document.createElement('span');
                span.className = 'walk-time';
                span.textContent = `${currentValue} min`;
                span.dataset.commuteId = commuteId;
                span.dataset.legIndex = legIndex;
                input.replaceWith(span);
            }
        });
    }

    /**
     * Handle walk time input blur
     * @param {Event} event - Blur event
     */
    async function handleWalkTimeBlur(event) {
        const input = event.target;
        const commuteId = input.dataset.commuteId;
        const legIndex = parseInt(input.dataset.legIndex);
        
        let newValue = parseInt(input.value);
        
        // Validate
        if (isNaN(newValue) || newValue < WALK_TIME_MIN) {
            newValue = null; // Will use database value
        } else if (newValue > WALK_TIME_MAX) {
            newValue = WALK_TIME_MAX;
        }
        
        // Update state
        const commuteState = state.commuteStates[commuteId];
        commuteState.legStates[legIndex].customWalkTime = newValue;
        
        // Replace input with span
        const span = document.createElement('span');
        span.className = 'walk-time' + (newValue !== null ? ' walk-time-custom' : '');
        span.textContent = `${newValue !== null ? newValue : '?'} min`;
        span.dataset.commuteId = commuteId;
        span.dataset.legIndex = legIndex;
        input.replaceWith(span);
        
        // Recalculate
        await calculateAndUpdate(commuteId);
    }

    /**
     * Handle more details button click
     * @param {Event} event - Click event
     */
    function handleMoreDetails(event) {
        const button = event.target;
        const commuteId = button.dataset.commuteId;
        // For now, just alert - will implement later
        alert('More details page coming soon!');
        // TODO: Navigate to /dashboard/commute/${commuteId}/details
    }

    /**
     * Attach event listeners for all commutes
     */
    function attachEventListeners() {
        state.commutes.forEach(commute => {
            attachEventListenersForCommute(commute._id);
        });
    }

    /**
     * Attach event listeners for a specific commute
     * @param {string} commuteId - Commute ID
     */
    function attachEventListenersForCommute(commuteId) {
        const card = containerEl.querySelector(`.commute-card[data-commute-id="${commuteId}"]`);
        if (!card) return;
        
        // Trip dropdowns
        card.querySelectorAll('.leg-trip-select').forEach(select => {
            select.removeEventListener('change', handleTripSelect);
            select.addEventListener('change', handleTripSelect);
        });
        
        // Checkboxes
        card.querySelectorAll('.leg-taken-checkbox').forEach(checkbox => {
            checkbox.removeEventListener('change', handleCheckboxChange);
            checkbox.addEventListener('change', handleCheckboxChange);
        });
        
        // Prompt buttons
        card.querySelectorAll('.prompt-yes').forEach(btn => {
            btn.removeEventListener('click', handlePromptYes);
            btn.addEventListener('click', handlePromptYes);
        });
        card.querySelectorAll('.prompt-no').forEach(btn => {
            btn.removeEventListener('click', handlePromptNo);
            btn.addEventListener('click', handlePromptNo);
        });
        
        // Walk edit buttons
        card.querySelectorAll('.walk-edit-btn').forEach(btn => {
            btn.removeEventListener('click', handleWalkEditClick);
            btn.addEventListener('click', handleWalkEditClick);
        });
        
        // More details button
        const moreBtn = card.querySelector('.btn-more-details');
        if (moreBtn) {
            moreBtn.removeEventListener('click', handleMoreDetails);
            moreBtn.addEventListener('click', handleMoreDetails);
        }
    }

    // Calculation and update logic

    /**
     * Build calculate options from commute state
     * @param {string} commuteId - Commute ID
     * @returns {Object} Calculate options
     */
    function buildCalculateOptions(commuteId) {
        const commute = state.commutes.find(c => c._id === commuteId);
        const commuteState = state.commuteStates[commuteId];
        
        // Find first non-taken leg
        let beginningLegOrder = 0;
        let startTime = null;
        
        for (let i = 0; i < commuteState.legStates.length; i++) {
            const legState = commuteState.legStates[i];
            if (legState.status === 'taken') {
                beginningLegOrder = i + 1;
            } else if (legState.status === 'in-transit') {
                // This leg is in-transit - next leg should start from its arrival + walk
                beginningLegOrder = i + 1;
                
                // Get the arrival time from the last calculate result
                if (commuteState.lastCalculateResult && commuteState.lastCalculateResult.legs) {
                    const inTransitLegDetail = commuteState.lastCalculateResult.legs.find(l => l.legOrder === i);
                    if (inTransitLegDetail && inTransitLegDetail.arrivalTime) {
                        const arrivalDate = new Date(inTransitLegDetail.arrivalTime);
                        // Add walk time
                        const nextLeg = commute.legs[i + 1];
                        const walkTime = commuteState.legStates[i + 1]?.customWalkTime ?? 
                                        nextLeg?.preferences?.walkingTimeAfterMinutes ??
                                        commute.legs[i + 1]?.preferences?.walkingTimeAfterMinutes ?? 5;
                        arrivalDate.setMinutes(arrivalDate.getMinutes() + walkTime);
                        startTime = arrivalDate.toISOString();
                    }
                }
                break;
            } else {
                break;
            }
        }
        
        // If all legs are taken, nothing to calculate
        if (beginningLegOrder >= commute.legs.length) {
            return null;
        }
        
        // Build selectedTrips array
        const selectedTrips = [];
        for (let i = 0; i < commute.legs.length; i++) {
            const legState = commuteState.legStates[i];
            if (legState.selectedTripId && legState.selectedRouteInfo) {
                selectedTrips[i] = {
                    tripId: legState.selectedTripId,
                    routeInfo: legState.selectedRouteInfo
                };
            } else {
                selectedTrips[i] = null;
            }
        }
        
        // Build customWalkTimes array
        const customWalkTimes = [];
        for (let i = 0; i < commute.legs.length; i++) {
            customWalkTimes[i] = commuteState.legStates[i].customWalkTime;
        }
        
        return {
            beginningLegOrder,
            selectedTrips,
            customWalkTimes,
            startTime
        };
    }

    /**
     * Calculate and update a single commute
     * @param {string} commuteId - Commute ID
     */
    async function calculateAndUpdate(commuteId) {
        const commuteState = state.commuteStates[commuteId];
        const commute = state.commutes.find(c => c._id === commuteId);
        
        commuteState.isCalculating = true;
        commuteState.error = null;
        
        try {
            const options = buildCalculateOptions(commuteId);
            
            if (options === null) {
                // All legs taken
                commuteState.lastCalculateResult = { success: true, allTaken: true };
                rerenderCommute(commuteId);
                return;
            }
            
            // Fetch leg options for the first active leg (for dropdown)
            const firstActiveLegIndex = options.beginningLegOrder;
            if (firstActiveLegIndex < commute.legs.length) {
                try {
                    const legOptionsResult = await fetchLegOptions(
                        commuteId, 
                        firstActiveLegIndex,
                        options.startTime
                    );
                    
                    if (legOptionsResult.available && legOptionsResult.trips) {
                        commuteState.legStates[firstActiveLegIndex].availableTrips = legOptionsResult.trips;
                    } else {
                        commuteState.legStates[firstActiveLegIndex].availableTrips = [];
                    }
                } catch (e) {
                    console.error('Failed to fetch leg options:', e);
                    commuteState.legStates[firstActiveLegIndex].availableTrips = [];
                }
            }
            
            // Calculate
            const result = await calculateCommute(commuteId, options);
            commuteState.lastCalculateResult = result;
            
            // Update displayed trip info for prompt detection
            if (result.success && result.legs) {
                result.legs.forEach(legDetail => {
                    const legState = commuteState.legStates[legDetail.legOrder];
                    if (legState && legState.status === 'active') {
                        legState.displayedTripId = legDetail.tripId;
                        legState.displayedDepartureTime = legDetail.departureTime;
                    }
                });
            }
            
        } catch (error) {
            console.error('Calculate error:', error);
            commuteState.error = error.message;
            commuteState.lastCalculateResult = { success: false, error: error.message };
        } finally {
            commuteState.isCalculating = false;
            rerenderCommute(commuteId);
        }
    }

    /**
     * Check if any legs need "have you taken?" prompt
     * Called during polling
     */
    function checkForPrompts() {
        const now = new Date();
        
        state.commutes.forEach(commute => {
            const commuteState = state.commuteStates[commute._id];
            
            commuteState.legStates.forEach((legState, index) => {
                if (legState.status === 'active' && legState.displayedDepartureTime) {
                    if (hasTimePassed(legState.displayedDepartureTime)) {
                        // Time has passed - show prompt
                        legState.status = 'prompt';
                    }
                }
            });
        });
    }

    /**
     * Handle prompt timeout - assume user took the trip
     */
    function handlePromptTimeouts() {
        state.commutes.forEach(commute => {
            const commuteState = state.commuteStates[commute._id];
            let needsUpdate = false;
            
            commuteState.legStates.forEach((legState, index) => {
                if (legState.status === 'prompt') {
                    // After 2 poll cycles (1 minute), assume they took it
                    // For now, just leave as prompt until user responds
                    // Could add timestamp tracking here
                }
            });
        });
    }

    // Polling

    /**
     * Poll all commutes
     */
    async function pollAllCommutes() {
        // First check for prompts based on current state
        checkForPrompts();
        
        // Re-render to show any new prompts
        state.commutes.forEach(commute => {
            rerenderCommute(commute._id);
        });
        
        // Then recalculate each commute
        for (const commute of state.commutes) {
            const commuteState = state.commuteStates[commute._id];
            
            // Skip if any leg is in prompt state - wait for user response
            const hasPrompt = commuteState.legStates.some(ls => ls.status === 'prompt');
            if (hasPrompt) continue;
            
            await calculateAndUpdate(commute._id);
        }
    }

    /**
     * Start polling
     */
    function startPolling() {
        if (state.pollIntervalId) {
            clearInterval(state.pollIntervalId);
        }
        state.pollIntervalId = setInterval(pollAllCommutes, POLL_INTERVAL);
    }

    /**
     * Stop polling
     */
    function stopPolling() {
        if (state.pollIntervalId) {
            clearInterval(state.pollIntervalId);
            state.pollIntervalId = null;
        }
    }

    // Init

    /**
     * Initialize dashboard
     */
    async function init() {
        showLoading();
        
        try {
            // Fetch all commutes
            const commutes = await fetchCommutes();
            state.commutes = commutes;
            
            if (commutes.length === 0) {
                showEmpty();
                return;
            }
            
            // Initialize state for each commute
            commutes.forEach(initCommuteState);
            
            // Render initial UI
            renderAllCommutes();
            
            // Fetch feasibility scores for all commutes (fire and forget - doesn't block)
            for (const commute of commutes) {
                fetchFeasibility(commute._id)
                    .then(feasibility => {
                        state.commuteStates[commute._id].feasibility = feasibility;
                        rerenderCommute(commute._id);
                    })
                    .catch(err => {
                        console.error('Failed to fetch feasibility for', commute._id, err);
                    });
            }
            
            // Calculate all commutes
            for (const commute of commutes) {
                await calculateAndUpdate(commute._id);
            }
            
            // Start polling
            startPolling();
            
        } catch (error) {
            console.error('Dashboard init error:', error);
            showError(error.message || 'Failed to load dashboard');
        }
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Stop polling when page is hidden
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopPolling();
        } else {
            pollAllCommutes();
            startPolling();
        }
    });

})();