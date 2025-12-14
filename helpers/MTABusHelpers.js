import * as apiCalls from '../api/mta/bus/APICalls.js';
import { stopsCollection, routesCollection } from '../config/mongoCollections.js';
import { StatusError } from './helpers.js';

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

function journeyGoesToDestination(mvj, destinationStopId) {
  // destinationStopId: "MTA_801042" 
  const onward = mvj?.OnwardCalls?.OnwardCall || [];
  for (const c of onward) {
    if (c?.StopPointRef === destinationStopId) return true;
  }

  // sometimes DestinationRef is the same as destination
  if (mvj?.DestinationRef === destinationStopId) return true;

  return false;
}
export const getAvailableTrips = async (leg, minDepartureTime = null) => {
    const allAvailableTrips = [];
    
    // Extract the actual stop code (remove NJTB_ prefix)
    // Database: "NJTB_20883" -> API expects: "20883"
    const stopCode = leg.originStopId.replace(/^MTA_SUBWAY_/, '');
    // destinationStopId 예: "MTA_801042"  (DB stopId랑 포맷 맞춰야 함)
    const destStopId = leg.destinationStopId.replace(/^MTA_SUBWAY_/, 'MTA_');  
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
                if (!journeyGoesToDestination(mvj, destStopId)) continue;
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
// export const getTripDetails = async (leg, minDepartureTime, selectedTripId = null) => {
//     let tripId, schedDepTime, routeId, routeName, direction;
    
//     if (selectedTripId) {
//         // User selected a specific trip (first leg)
//         tripId = selectedTripId;
//         // We might not have schedDepTime, getTripStops can handle that
//         schedDepTime = null;
//     } else {
//         // Auto-select earliest available trip
//         const availableTrips = await getAvailableTrips(leg, minDepartureTime);
        
//         if (availableTrips.length === 0) {
//             throw new StatusError(
//                 `No trips available for leg from ${leg.originStopName} to ${leg.destinationStopName} after ${minDepartureTime.toLocaleTimeString()}`,
//                 404
//             );
//         }
        
//         // Use earliest trip
//         const earliestTrip = availableTrips[0];
//         tripId = earliestTrip.tripId;
//         schedDepTime = earliestTrip.scheduledDepartureTime;
//         routeId = earliestTrip.routeId;
//         routeName = earliestTrip.routeName;
//         direction = earliestTrip.direction;
//     }
    
//     // Get stop details for this trip
//     const tripStops = await apiCalls.getTripStops(tripId, schedDepTime || '');
    
//     // API returns stopIds without prefix (e.g., "20883")
//     // Database has stopIds with prefix (e.g., "NJTB_20883")
//     // So we need to strip the prefix for comparison
//     const originStopCode = leg.originStopId.replace(/^NJTB_/, '');
//     const destinationStopCode = leg.destinationStopId.replace(/^NJTB_/, '');
    
//     const originStop = tripStops.find(stop => stop.StopID === originStopCode);
//     const destinationStop = tripStops.find(stop => stop.StopID === destinationStopCode);
    
//     if (!originStop) {
//         throw new StatusError(
//             `Origin stop ${leg.originStopId} not found in trip ${tripId}`,
//             404
//         );
//     }
//     if (!destinationStop) {
//         throw new StatusError(
//             `Destination stop ${leg.destinationStopId} not found in trip ${tripId}`,
//             404
//         );
//     }
    
//     // Calculate duration
//     const departureTime = new Date(originStop.ApproxTime);
//     const arrivalTime = new Date(destinationStop.ApproxTime);
//     const durationMinutes = Math.round((arrivalTime - departureTime) / (1000 * 60));
    
//     return {
//         tripId: tripId,
//         routeId: routeId, // Will be undefined if selectedTripId was provided - caller will set it
//         routeName: routeName, // Will be undefined if selectedTripId was provided - caller will set it
//         direction: direction, // Will be undefined if selectedTripId was provided - caller will set it
//         originStopId: leg.originStopId, // Use database format with prefix
//         originStopName: originStop.Description,
//         destinationStopId: leg.destinationStopId, // Use database format with prefix
//         destinationStopName: destinationStop.Description,
//         departureTime: originStop.ApproxTime,
//         arrivalTime: destinationStop.ApproxTime,
//         duration: durationMinutes
//     };
// };

