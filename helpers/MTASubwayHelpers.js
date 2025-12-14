import * as apiCalls from '../api/mta/subway/APICalls.js';
import { stopsCollection, routesCollection } from '../config/mongoCollections.js';
import { StatusError } from './helpers.js';
// Valid MTA GTFS-RT feed groups
const SUBWAY_GROUPS = ['gtfs', 'ace', 'bdfm', 'g', 'jz', 'nqrw', 'l', '7', 'si'];

// Map route IDs to their GTFS-RT feed group
// IMPORTANT: 1/2/3/4/5/6 use the base 'gtfs' feed, NOT '123' or '456'
const ROUTE_TO_GROUP = {
  // Number lines use base gtfs feed
  '1': 'gtfs', '2': 'gtfs', '3': 'gtfs',
  '4': 'gtfs', '5': 'gtfs', '6': 'gtfs', '6X': 'gtfs',
  // Letter lines use their specific feeds
  A: 'ace', C: 'ace', E: 'ace',
  B: 'bdfm', D: 'bdfm', F: 'bdfm', M: 'bdfm', 'FX': 'bdfm',
  G: 'g',
  J: 'jz', Z: 'jz',
  N: 'nqrw', Q: 'nqrw', R: 'nqrw', W: 'nqrw',
  '7': '7', '7X': '7',
  L: 'l',
  SI: 'si', SIR: 'si'
};

/**
 * Safely convert a protobuf Long or number to JavaScript number (epoch seconds)
 * Returns null if conversion fails or value is invalid
 */
function safeToEpochSeconds(value) {
  if (value == null) return null;
  
  let num;
  
  // Handle protobuf Long objects
  if (typeof value === 'object') {
    // Long objects have low/high properties
    if (value.low !== undefined && value.high !== undefined) {
      // Manual Long to number conversion for safety
      // For timestamps, high should be 0 or small (we're < 2^32 until year 2106)
      num = (value.high >>> 0) * 4294967296 + (value.low >>> 0);
    } else if (typeof value.toNumber === 'function') {
      num = value.toNumber();
    } else if (typeof value.toString === 'function') {
      num = parseInt(value.toString(), 10);
    } else {
      num = Number(value);
    }
  } else {
    num = Number(value);
  }
  
  // Validate: timestamps should be reasonable (year 2000 to 2100)
  // 946684800 = Jan 1, 2000
  // 4102444800 = Jan 1, 2100
  if (isNaN(num) || num < 946684800 || num > 4102444800) {
    return null;
  }
  
  return num;
}

/**
 * ============================================================================
 * FUNCTIONS FOR DASHBOARD - REAL-TIME TRIP LOOKUPS
 * ============================================================================
 */

// MTA_SUBWAY_TRIP_CACHE: tripKey -> { group, tripUpdate, cachedAt }
const MTA_SUBWAY_TRIP_CACHE = new Map();
const TRIP_CACHE_TTL_MS = 2 * 60 * 1000; //2min

function makeTripKey(trip) {
  const tripId = trip?.tripId || 'na';
  const routeId = trip?.routeId || 'na';
  const startDate = trip?.startDate || 'na';
  return `${startDate}:${routeId}:${tripId}`;
}

function cacheTripUpdate(group, tripUpdate) {
  const key = makeTripKey(tripUpdate.trip);
  MTA_SUBWAY_TRIP_CACHE.set(key, { group, tripUpdate, cachedAt: Date.now() });
  return key;
}

function getCachedTripUpdate(tripKey) {
  const hit = MTA_SUBWAY_TRIP_CACHE.get(tripKey);
  if (!hit) return null;
  if (Date.now() - hit.cachedAt > TRIP_CACHE_TTL_MS) {
    MTA_SUBWAY_TRIP_CACHE.delete(tripKey);
    return null;
  }
  return hit;
}


/**
 * Gets available trips for a pre-validated leg.
 */
export const getAvailableTrips = async (leg, minDepartureTime = null) => {
    const allAvailableTrips = [];
    // Extract the actual stop code (remove MTA_SUBWAY_ prefix)
    const originStopId = leg.originStopId.replace(/^MTA_SUBWAY_/, '');
    const destinationStopId = leg.destinationStopId.replace(/^MTA_SUBWAY_/, '');

    // Build list of feed groups to check based on leg's routes
    const groups = []; 
    for (const r of leg.routes) {
        const routeId = r.routeId;
        const group = ROUTE_TO_GROUP[routeId];
        if (group && !groups.includes(group)) {
            groups.push(group);
        }
    }
    
    // If no groups found from routes, check all feeds as fallback
    if (groups.length === 0) {
        console.warn('MTA Subway: No feed groups found for routes, checking all feeds');
        groups.push(...SUBWAY_GROUPS);
    }

    const nowEpochSec = Math.floor(Date.now() / 1000);
    const minEpochSec = minDepartureTime 
        ? (minDepartureTime instanceof Date 
            ? Math.floor(minDepartureTime.getTime() / 1000)
            : Math.floor(new Date(minDepartureTime).getTime() / 1000))
        : nowEpochSec;

    for (const group of groups) {
        let feed;
        try {
            feed = await apiCalls.getMtaSubwayRealtime(group);
        } catch (e) {
            console.error(`MTA Subway: Failed to fetch feed for group=${group}:`, e.message);
            continue;
        }
        
        const tripUpdates = feed?.tripUpdates || [];
        
        for (const tu of tripUpdates) {
            const trip = tu.trip;
            if (!trip) continue;
            
            const stus = tu.stopTimeUpdate || [];
            if (!Array.isArray(stus) || stus.length === 0) continue;
            
            // Check if both origin and destination exist and in correct order
            const oIdx = stus.findIndex(x => x.stopId === originStopId);
            const dIdx = stus.findIndex(x => x.stopId === destinationStopId);
            if (oIdx === -1 || dIdx === -1) continue;
            if (dIdx <= oIdx) continue;

            // Get departure time from origin stop
            const originStu = stus[oIdx];
            
            // Try arrival time first, then departure time
            let whenSec = safeToEpochSeconds(originStu.arrival?.time);
            if (whenSec === null) {
                whenSec = safeToEpochSeconds(originStu.departure?.time);
            }
            
            // Skip if no valid time found
            if (whenSec === null) {
                continue;
            }
            
            // Skip if in the past (compare in seconds)
            if (whenSec < minEpochSec) continue;

            // Cache the trip update
            const tripKey = cacheTripUpdate(group, tu);

            allAvailableTrips.push({
                routeId: trip.routeId,
                routeName: trip.routeId,
                direction: originStopId.slice(-1), // 'N' or 'S'
                departureTime: whenSec * 1000,  // Convert to milliseconds for JS Date
                tripId: tripKey,
                scheduledDepartureTime: whenSec * 1000  // Convert to milliseconds
            });
        }
    }
    
    // Sort by departure time (earliest first)
    allAvailableTrips.sort((a, b) => a.scheduledDepartureTime - b.scheduledDepartureTime);
    
    return allAvailableTrips;
};

/**
 * Gets detailed timing information for a specific trip.
 */
export const getTripDetails = async (leg, minDepartureTime, selectedTripId = null) => {
    let tripKey;
    let routeId, routeName, direction;
    
    if (selectedTripId) {
        tripKey = selectedTripId;
    } else {
        // Auto-select earliest available trip
        const availableTrips = await getAvailableTrips(leg, minDepartureTime);
        
        if (availableTrips.length === 0) {
            throw new StatusError(
                `No trips available for leg from ${leg.originStopName} to ${leg.destinationStopName} after ${minDepartureTime.toLocaleTimeString()}`,
                404
            );
        }
      
        const earliestTrip = availableTrips[0];
        tripKey = earliestTrip.tripId;
        routeId = earliestTrip.routeId;
        routeName = earliestTrip.routeName;
        direction = earliestTrip.direction;
    }
    
    // Fetch from cache
    let cached = getCachedTripUpdate(tripKey);
    if (!cached) {
        throw new StatusError(`Trip cache miss for key=${tripKey}`, 404);
    }

    const tu = cached.tripUpdate;
    const stus = tu.stopTimeUpdate || [];
    const originStopId = leg.originStopId;
    const destinationStopId = leg.destinationStopId;

    const oIdx = stus.findIndex(x => x.stopId === originStopId.replace(/^MTA_SUBWAY_/, ''));
    const dIdx = stus.findIndex(x => x.stopId === destinationStopId.replace(/^MTA_SUBWAY_/, ''));

    if (oIdx === -1 || dIdx === -1 || dIdx <= oIdx) {
        throw new StatusError(`Trip direction invalid for this leg`, 404);
    }

    const originStu = stus[oIdx];
    const destStu = stus[dIdx];

    // Get departure from origin and arrival at destination
    let depSec = safeToEpochSeconds(originStu.departure?.time);
    if (depSec === null) {
        depSec = safeToEpochSeconds(originStu.arrival?.time);
    }
    
    let arrSec = safeToEpochSeconds(destStu.arrival?.time);
    if (arrSec === null) {
        arrSec = safeToEpochSeconds(destStu.departure?.time);
    }

    // Calculate duration
    const durationMinutes = (depSec && arrSec) ? Math.round((arrSec - depSec) / 60) : null;

    // Fetch stop names from stops collection
    const stopsCol = await stopsCollection();
    const originStop = await stopsCol.findOne({ stopId: originStopId });
    const destinationStop = await stopsCol.findOne({ stopId: destinationStopId });

    return {
        tripId: tripKey,
        routeId: routeId || tu.trip?.routeId,
        routeName: routeName || tu.trip?.routeId,
        direction: direction || originStopId.replace(/^MTA_SUBWAY_/, '').slice(-1),
        originStopId: leg.originStopId,
        originStopName: originStop?.stopName,
        destinationStopId: leg.destinationStopId,
        destinationStopName: destinationStop?.stopName,
        departureTime: depSec ? depSec * 1000 : null,  // Convert to milliseconds
        arrivalTime: arrSec ? arrSec * 1000 : null,    // Convert to milliseconds
        duration: durationMinutes
    };
};