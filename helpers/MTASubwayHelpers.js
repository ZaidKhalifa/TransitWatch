import * as apiCalls from '../api/mta/subway/APICalls.js';
import { stopsCollection, routesCollection } from '../config/mongoCollections.js';
import { StatusError } from './helpers.js';
// const SUBWAY_GROUPS = ['ace', 'bdfm', 'nqrw', '123', '456', '7', 'l'];
const SUBWAY_GROUPS = ['gtfs', 'ace', 'bdfm', 'g', 'jz', 'nqrw', 'l','7', 'si'];
const ROUTE_TO_GROUP = {
  A: 'ace', C: 'ace', E: 'ace',
  B: 'bdfm', D: 'bdfm', F: 'bdfm', M: 'bdfm',
  G: 'g',
  J: 'jz', Z: 'jz',
  N: 'nqrw', Q: 'nqrw', R: 'nqrw', W: 'nqrw',
  '1': '123', '2': '123', '3': '123',
  '4': '456', '5': '456', '6': '456',
  '7': '7',
  L: 'l',
  SI: 'si'
};
/**
 * ============================================================================
 * FUNCTIONS FOR DASHBOARD - REAL-TIME TRIP LOOKUPS
 * ============================================================================
 * 
 * NOTE: No validation needed here! The leg was already validated when the 
 * commute was created, so we just fetch real-time trip data.
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
 * Uses the stored routes array to filter trips from API calls.
 * 
 * @param {Object} leg - Leg object from savedCommutes containing:
 *   - originStopId: string
 *   - routes: Array of {routeId, routeName, directions: [{directionName, ...}]}
 * @param {Date|string|null} minDepartureTime - Minimum departure time as Date object or ISO string
 * 
 * @returns {Promise<Array>} Array of trip options:
 * [{
 *   routeId: '125',
 *   routeName: 'Jersey City - Journal Square - New York',
 *   direction: '125 NEW YORK',
 *   departureTime: '7:30 AM',
 *   tripId: '19629805',
 *   scheduledDepartureTime: '6/22/2023 7:30:00 AM' //Not required if not possible
 * }]
 * 
 * Returns empty array if no trips available (e.g., middle of night)
 */
// it returns departureTime: when as sec
export const getAvailableTrips = async (leg, minDepartureTime = null) => {
    const allAvailableTrips = [];
    // Extract the actual stop code (remove MTA_SUBWAY_ prefix)
    // Database: "MTA_SUBWAY_D25N" -> API expects: "D25N"
    const originStopId = leg.originStopId.replace(/^MTA_SUBWAY_/, '');  //'R14N'
    const destinationStopId = leg.destinationStopId.replace(/^MTA_SUBWAY_/, '');

    // const groups = SUBWAY_GROUPS; 
    const groups = []; 

    for (const r of leg.routes) {
    const routeId = r.routeId;              //  'W'
    const group = ROUTE_TO_GROUP[routeId];  // 'nqrw'

    if (group) {
        if (!groups.includes(group)) {
        groups.push(group);
        }
    }
    }
        
    for (const group of groups) {
        let feed;
        try {
            feed = await apiCalls.getMtaSubwayRealtime(group);
        } catch (e) {
            continue;
        }
        const tripUpdates = feed?.tripUpdates || [];
        for (const tu of tripUpdates) {
            const trip = tu.trip;
            if (!trip) continue;
            //check if both origin and destination exist in tripUpdate 
            //also check their order
            const stus = tu.stopTimeUpdate || [];
            if (!Array.isArray(stus) || stus.length === 0) continue;            
            const oIdx = stus.findIndex(x => x.stopId === originStopId);
            const dIdx = stus.findIndex(x => x.stopId === destinationStopId);
            if (oIdx === -1 || dIdx === -1) continue;
            if (dIdx <= oIdx) continue;

            //time filter
            const stu = stus[oIdx];
            const arrivalTime = stu.arrival?.time ?? null;
            const departureTime = stu.departure?.time ?? null;
            const when = arrivalTime ?? departureTime;
            if (!when) continue;
            const whenSec = when?.toNumber ? when.toNumber() : Number(when);
            if (minDepartureTime) {
                const minEpoch = (minDepartureTime instanceof Date)
                ? Math.floor(minDepartureTime.getTime() / 1000)
                : Math.floor(new Date(minDepartureTime).getTime() / 1000);
                if (whenSec < minEpoch) continue;
            }

            //caching+create tripKey
            const tripKey = cacheTripUpdate(group, tu);

            allAvailableTrips.push({
                routeId: trip.routeId,                 // 'A', '6'
                routeName: trip.routeId,               
                direction: originStopId.slice(-1),     // 'N'/'S'
                departureTime: whenSec,                   
                tripId: tripKey,                       // tripKey, not tripId
                scheduledDepartureTime: whenSec           
            });
            }            
    }
    
    // Sort by departure time (earliest first)
    allAvailableTrips.sort((a, b) => {
        const timeA = a.scheduledDepartureTime?.toNumber
            ? a.scheduledDepartureTime.toNumber()
            : Number(a.scheduledDepartureTime);

        const timeB = b.scheduledDepartureTime?.toNumber
            ? b.scheduledDepartureTime.toNumber()
            : Number(b.scheduledDepartureTime);

        return timeA - timeB;
    });
    
    return allAvailableTrips;
};

/**
 * Gets detailed timing information for a specific trip OR auto-selects earliest available trip.
 * 
 * USE CASES:
 * - First leg: User selects trip from dropdown -> pass tripId
 * - Subsequent legs: Auto-select earliest after walk time -> pass only minDepartureTime
 * 
 * @param {Object} leg - Leg object from savedCommutes
 * @param {Date} minDepartureTime - Minimum departure time (current time for first leg, 
 *                                  arrival + walk time for subsequent legs)
 * @param {string|null} selectedTripId - Trip ID if user selected (first leg only)
 *                                      - in this case, tripKey acts as a tripId
 * 
 * @returns {Promise<Object>} Timing details:
 * {
 *   tripId: '19629805',
 *   routeId: '125',
 *   originStopId: 'NJTB_20883',
 *   originStopName: 'JOURNAL SQUARE TRANSPORTATION CENTER',
 *   destinationStopId: 'NJTB_26229',
 *   destinationStopName: 'PORT AUTHORITY BUS TERMINAL',
 *   departureTime: '6/22/2023 7:30:00 AM',
 *   arrivalTime: '6/22/2023 8:15:00 AM',
 *   duration: 45
 * }
 * 
 * @throws {StatusError} 404 if trip not found or no trips available
 */
export const getTripDetails = async (leg, minDepartureTime, selectedTripId = null) => {
    let tripId, schedDepTime, routeId, routeName, direction;
    let tripKey;
    if (selectedTripId) {
        // User selected a specific trip (first leg)
        tripKey = selectedTripId;
        // // We might not have schedDepTime, getTripStops can handle that
        // schedDepTime = null;
    } else {
        // Auto-select earliest available trip
        const availableTrips = await getAvailableTrips(leg, minDepartureTime);
        
        if (availableTrips.length === 0) {
            throw new StatusError(
                `No trips available for leg from ${leg.originStopName} to ${leg.destinationStopName} after ${minDepartureTime.toLocaleTimeString()}`,
                404
            );
        }
      
        // Use earliest trip
        const earliestTrip = availableTrips[0];
        tripKey = earliestTrip.tripId;
        schedDepTime = earliestTrip.scheduledDepartureTime;
        routeId = earliestTrip.routeId;
        routeName = earliestTrip.routeName;
        direction = earliestTrip.direction;
    }
    // 1) fetch tripUpdate from cache 
    let cached = getCachedTripUpdate(tripKey);

    if (!cached) throw new StatusError(`Trip cache miss for key=${tripKey}`, 404);

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

    const departureTime = originStu.departure?.time ?? null;
    const arrivalTime = destStu.arrival?.time ?? null;
    const depSec = departureTime?.toNumber ? departureTime.toNumber() : Number(departureTime);
    const arrSec = arrivalTime?.toNumber ? arrivalTime.toNumber() : Number(arrivalTime);

    // Calculate duration
    const durationMinutes = Math.round((arrSec - depSec) / (60));

    //fetch stop names from stops collection
    const stopsCol = await stopsCollection();   
    const originStop = await stopsCol.findOne({
        stopId:originStopId
    });   
    const destinationStop = await stopsCol.findOne({
        stopId:destinationStopId
    });


    return {
        tripId: tripKey,
        routeId: routeId, // Will be undefined if selectedTripId was provided - caller will set it
        routeName: routeName, // Will be undefined if selectedTripId was provided - caller will set it
        direction: direction, // Will be undefined if selectedTripId was provided - caller will set it
        originStopId: leg.originStopId, // Use database format with prefix
        originStopName: originStop?.stopName,
        destinationStopId: leg.destinationStopId, // Use database format with prefix
        destinationStopName: destinationStop?.stopName,
        departureTime: depSec,
        arrivalTime: arrSec,
        duration: durationMinutes
    };
};

