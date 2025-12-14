import * as apiCalls from '../api/mta/bus/APICalls.js';
import { stopsCollection, routesCollection } from '../config/mongoCollections.js';
import { StatusError } from './helpers.js';
const tripCache = new Map();
const TRIP_CACHE_TTL_MS = 60 * 1000; 
function setTripCache(tripId, payload) {
  tripCache.set(tripId, { ...payload, _cachedAt: Date.now() });
}
function getTripCache(tripId) {
  const v = tripCache.get(tripId);
  if (!v) return null;
  if (Date.now() - v._cachedAt > TRIP_CACHE_TTL_MS) {
    tripCache.delete(tripId);
    return null;
  }
  return v;
}

/**
 * ============================================================================
 * FUNCTIONS FOR DASHBOARD - REAL-TIME TRIP LOOKUPS
 * ============================================================================
 * 
 * NOTE: No validation needed here! The leg was already validated when the 
 * commute was created, so we just fetch real-time trip data.
 */

/**
 * Gets available trips for a pre-validated leg.
 * Uses the stored routes array to filter trips from API calls.
 * 
 * @param {Object} leg - Leg object from savedCommutes containing:
 *   - originStopId: string
 *   - routes: Array of {routeId, routeName, valid: [{directionName, ...}]}
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
// routeId fully qualified for siri: "MTA NYCT_B63"

// function journeyGoesToDestination(mvj, destinationStopId) {
//   // destinationStopId: "MTA_801042" 
//   const onward = mvj?.OnwardCalls?.OnwardCall || [];
//   for (const c of onward) {
//     if (c?.StopPointRef === destinationStopId) return true;
//   }

//   // sometimes DestinationRef is the same as destination
//   if (mvj?.DestinationRef === destinationStopId) return true;

//   return false;
// }
export const getAvailableTrips = async (leg, minDepartureTime = null) => {
    const allAvailableTrips = [];
    
    // Extract the actual stop code (remove NJTB_ prefix)
    // Database: "NJTB_20883" -> API expects: "20883"
    const stopCode = leg.originStopId.replace(/^MTA_BUS_/, '');
    // destinationStopId "MTA_801042"  
    const destStopId = leg.destinationStopId.replace(/^MTA_BUS_/, 'MTA_');  
    // Loop through all stored routes for this leg
    for (const route of leg.routes) {
        try {
            // Call API to get trips for this route at origin stop
            const raw = await apiCalls.callStopMonitoring(`MTA_${stopCode}`, route.routeId);
            const delivery = raw?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0];
            const visits = delivery?.MonitoredStopVisit || [];

            for (const v of visits) {
                const mvj = v?.MonitoredVehicleJourney || {};
                const framed = mvj?.FramedVehicleJourneyRef || {};
                const tripId = framed?.DatedVehicleJourneyRef || null;

                const when =
                mvj?.MonitoredCall?.ExpectedArrivalTime ||
                mvj?.MonitoredCall?.AimedArrivalTime ||
                mvj?.MonitoredCall?.ExpectedDepartureTime ||
                mvj?.MonitoredCall?.AimedDepartureTime ||
                null;

                if (!tripId || !when) continue;
                // minDepartureTime 
                if (minDepartureTime) {
                const tripTime = new Date(when);
                const minTime = minDepartureTime instanceof Date ? minDepartureTime : new Date(minDepartureTime);
                if (tripTime < minTime) continue;
                }
                //check direction
                // if (!journeyGoesToDestination(mvj, destStopId)) continue;
                const onward = mvj?.OnwardCalls?.OnwardCall || [];
                let destCall = null;
                for (const c of onward) {
                    if (c?.StopPointRef === destStopId) { destCall = c; break; }
                }
                const originTime =
                    mvj?.MonitoredCall?.ExpectedArrivalTime ||
                    mvj?.MonitoredCall?.AimedArrivalTime ||
                    mvj?.MonitoredCall?.ExpectedDepartureTime ||
                    mvj?.MonitoredCall?.AimedDepartureTime ||
                    null;
                const destTime =
                    destCall?.ExpectedArrivalTime ||
                    destCall?.AimedArrivalTime ||
                    destCall?.ExpectedDepartureTime ||
                    destCall?.AimedDepartureTime ||
                    null;
                if (!destCall && mvj?.DestinationRef !== destStopId) continue;


                setTripCache(tripId, {
                    routeId: route.routeId,
                    routeName: route.routeName,
                    direction: mvj?.DestinationName || '',
                    originStopId: leg.originStopId,
                    destinationStopId: leg.destinationStopId,
                    originTime,
                    destTime,
                    originStopName: leg.originStopName || '',
                    destinationStopName: destCall?.StopPointName || leg.destinationStopName || ''
                });
                allAvailableTrips.push({
                    routeId: route.routeId,
                    routeName: route.routeName,
                    direction: mvj?.DestinationName || '',
                    departureTime: when,
                    tripId,
                    scheduledDepartureTime: when
                });
                

            }
        } catch (error) {
            console.error(`Error fetching trips for route ${route.routeId}:`, error);
            // Continue to next route instead of failing entirely
        }
    }
    
    // Sort by departure time (earliest first)
    allAvailableTrips.sort((a, b) => {
        const timeA = new Date(a.scheduledDepartureTime);
        const timeB = new Date(b.scheduledDepartureTime);
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
 * @param {string|null} selectedTripId - Trip ID if user selected
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
    
    if (selectedTripId) {
        // User selected a specific trip (first leg)
        tripId = selectedTripId;
        // We might not have schedDepTime, getTripStops can handle that
        schedDepTime = null;
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
        tripId = earliestTrip.tripId;
        schedDepTime = earliestTrip.scheduledDepartureTime;
        routeId = earliestTrip.routeId;
        routeName = earliestTrip.routeName;
        direction = earliestTrip.direction;
    }
    const cached = getTripCache(tripId);
    if (cached && cached.originTime && cached.destTime) {
        const departureTime = new Date(cached.originTime);
        const arrivalTime = new Date(cached.destTime);
        const durationMinutes = Math.round((arrivalTime - departureTime) / (1000 * 60));

        return {
            tripId: tripId,
            routeId: routeId,
            routeName: routeName,
            direction: direction,
            originStopId: leg.originStopId,
            originStopName: cached.originStopName || leg.originStopName || '',
            destinationStopId: leg.destinationStopId,
            destinationStopName: cached.destinationStopName || leg.destinationStopName || '',
            departureTime: cached.originTime,
            arrivalTime: cached.destTime,
            duration: durationMinutes
        };
    }
    throw new StatusError(`Trip details not available (cache miss) for tripId=${tripId}`, 404);


};

