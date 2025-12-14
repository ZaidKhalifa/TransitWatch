import * as apiCalls from '../api/njtransit/rail/APICalls.js';
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
 *   - routes: Array of {routeId, routeName, validDirections: [{directionName, ...}]}
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
export const getAvailableTrips = async (leg, minDepartureTime = null) => {
    const allAvailableTrips = [];
    
    // Extract the actual stop code (remove NJTR_ prefix)
    // Database: "NJTR_HB" -> API expects: "HB"
    const stopCode = leg.originStopId.replace(/^NJTR_/, '');
    
    // Loop through all stored routes for this leg
    for (const route of leg.routes) {
        try {
            // Call API to get trips for this route at origin stop
            // call without line filter, then match by LINEABBREVIATION
            let trips = await apiCalls.getTrainScheduleCached(stopCode,'');
            trips = trips?.ITEMS || [];

            for (const trip of trips) {
                // 1) ROUTE MATCH: DB routeName(NEC) must match API LINEABBREVIATION(NEC)
                const apiRouteAbbr = (trip.LINEABBREVIATION || '').trim();
                if (apiRouteAbbr && route.routeName && apiRouteAbbr.toLowerCase() !== route.routeName.trim().toLowerCase()) {
                    continue;
                }
//destination string can be inconsistent
//so we validate direction using stop order
                // // 2) Check if this trip's DESTINATION matches any of our valid directions
                // // DESTINATION format: "Penn Station New York" 
                // // Direction format: "Penn Station New York"
                
                // let destination = trip.DESTINATION.trim().toLowerCase();
                
                // // Find matching direction from our stored valid directions
                // //????? directionName might be "New York" or "New York -SEC" etc
                // const matchingDirection = route.validDirections.find(validDir => {
                //     const directionDB = (validDir.directionName||'').trim().toLowerCase();
                //     return destination === directionDB.toLowerCase();
                // });
                
                // if (!matchingDirection) continue;
                
                // Check minimum departure time
                if (minDepartureTime) {
                    const tripTime = new Date(trip.SCHED_DEP_DATE);
                    const minTime = minDepartureTime instanceof Date ? minDepartureTime : new Date(minDepartureTime);
                    if (tripTime < minTime) continue;
                }
                
                const tripStops = trip.STOPS||[];
                if (!tripStops.length) continue;
                // API does not return stopId, instead it returns STATION_2CHAR  (e.g., "HB")
                // Database has stopIds with prefix (e.g., "NJTR_HB")
                // So we need to strip the prefix for comparison
                const originStopCode = leg.originStopId.replace(/^NJTR_/, '');
                const destinationStopCode = leg.destinationStopId.replace(/^NJTR_/, '');
                // Find origin/destination stops
                const originStopIndex = tripStops.findIndex(stop => stop.STATION_2CHAR === originStopCode);
                const destinationStopIndex = tripStops.findIndex(stop => stop.STATION_2CHAR === destinationStopCode);

                if (originStopIndex === -1) {
                    continue;

                }
                if (destinationStopIndex===-1) {
                    continue;

                }
                // destination must appear AFTER origin in the stop list
                if (destinationStopIndex <= originStopIndex) {
                    continue;
                }



                allAvailableTrips.push({
                    routeId: route.routeId,
                    routeName: route.routeName,
                    direction: trip.DESTINATION,
                    departureTime: trip.SCHED_DEP_DATE, 
                    tripId: trip.TRAIN_ID,
                    scheduledDepartureTime: trip.SCHED_DEP_DATE //for sorting
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
 * @param {string|null} selectedTripId - Trip ID if user selected (first leg only)
 * 
 * @returns {Promise<Object>} Timing details:
 * {
 *   tripId: '19629805',(TRAIN_ID)
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

// Use getTrainStopList(tripId) to confirm:
//     - origin exists
//     - destination exists
//     - destination occurs AFTER origin (direction validity!)
export const getTripDetails = async (leg, minDepartureTime, selectedTripId = null) => {
    let tripId, schedDepTime, routeId, routeName, direction;
    
    if (selectedTripId) {
        // User selected a specific trip (first leg)
        tripId = selectedTripId;
        // We might not have schedDepTime, getTrainStopList can handle that
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
    
    // Get stop details for this trip
    const tripStopsPayload = await apiCalls.getTrainStopList(tripId);
    const tripStops = tripStopsPayload?.STOPS || [];
    // API does not return stopId, instead it returns STATION_2CHAR  (e.g., "HB")
    // Database has stopIds with prefix (e.g., "NJTR_HB")
    // So we need to strip the prefix for comparison
    const originStopCode = leg.originStopId.replace(/^NJTR_/, '');
    const destinationStopCode = leg.destinationStopId.replace(/^NJTR_/, '');
    // Find origin/destination stops
    const originStopIndex = tripStops.findIndex(stop => stop.STATION_2CHAR === originStopCode);
    const destinationStopIndex = tripStops.findIndex(stop => stop.STATION_2CHAR === destinationStopCode);

    if (originStopIndex === -1) {
        throw new StatusError(
            `Origin stop ${leg.originStopId} not found in trip ${tripId}`,
            404
        );
    }
    if (destinationStopIndex===-1) {
        throw new StatusError(
            `Destination stop ${leg.destinationStopId} not found in trip ${tripId}`,
            404
        );
    }
    // destination must appear AFTER origin in the stop list
    if (destinationStopIndex <= originStopIndex) {
        throw new StatusError(
        `Train ${tripId} does not travel from ${leg.originStopId} to ${leg.destinationStopId} in the correct direction`,
        404
        );
    }
    const originStop = tripStops[originStopIndex];
    const destinationStop = tripStops[destinationStopIndex];


    // Calculate duration
    const departureTime = new Date(originStop.DEP_TIME||originStop.TIME);
    const arrivalTime = new Date(destinationStop.TIME||destinationStop.DEP_TIME);
    const durationMinutes = Math.round((arrivalTime - departureTime) / (1000 * 60));
    
    return {
        tripId: tripId,
        routeId: routeId, // Will be undefined if selectedTripId was provided - caller will set it
        routeName: routeName, // Will be undefined if selectedTripId was provided - caller will set it
        direction: direction, // Will be undefined if selectedTripId was provided - caller will set it
        originStopId: leg.originStopId, // Use database format with prefix
        originStopName: originStop.STATIONNAME,
        destinationStopId: leg.destinationStopId, // Use database format with prefix
        destinationStopName: destinationStop.STATIONNAME,
        departureTime: originStop.DEP_TIME,
        arrivalTime: destinationStop.DEP_TIME,
        duration: durationMinutes
    };
};

//result for getTrainStopList
// Result #1:
// {
// "TRAIN_ID": "3240",
// "LINECODE": "NC",
// "BACKCOLOR": "#009CDB",
// "FORECOLOR": "white",
// "SHADOWCOLOR": "black",
// "DESTINATION": "Penn Station New York",
// "TRANSFERAT": "",
// "STOPS": [
// {
// "STATION_2CHAR": "LB",
// "STATIONNAME": "Long Branch",
// "TIME": "30-May-2024 10:52:30 AM",
// "PICKUP": "",
// "DROPOFF": "",
// "DEPARTED": "YES",
// "STOP_STATUS": "OnTime",
// "DEP_TIME": "30-May-2024 10:53:30 AM",
// "TIME_UTC_FORMAT": "30-May-2024 02:52:30 PM",
// "STOP_LINES": []
// },
// {
// "STATION_2CHAR": "LS",
// "STATIONNAME": "Little Silver",
// "TIME": "30-May-2024 11:00:07 AM",
// "PICKUP": "",
// "DROPOFF": "",
// "DEPARTED": "YES",
// "STOP_STATUS": "OnTime",
// "DEP_TIME": "30-May-2024 11:01:00 AM",
// "TIME_UTC_FORMAT": "30-May-2024 03:00:07 PM",
// "STOP_LINES": []
// },...]}

//station2char and stopid without prefix does not match
//17 != RY
// "Ramsey Route 17" "17"
// {
//   "_id": {
//     "$oid": "693df64ae6e49e3ae08b1ed9"
//   },
//   "stopId": "NJTR_RY",
//   "stopName": "Ramsey",
//   "transitSystem": "NJT_RAIL",
//   "location": {
//     "type": "Point",
//     "coordinates": [
//       -74.141877,
//       41.056422
//     ]
//   },
//   "routes": [
//     {
//       "routeId": "5",
//       "routeName": "BERG",
//       "directions": [
//         "Port Jervis",
//         "Suffern",
//         "Hoboken"
//       ]
//     },
//     {
//       "routeId": "6",
//       "routeName": "MAIN",
//       "directions": [
//         "Port Jervis",
//         "Suffern",
//         "Hoboken"
//       ]
//     }
//   ]
// }
// Wayne-Route 23 23? THIS TOO.?


// VI. Train Line Code
// TRAIN LINE, LINE CODE, ABBREVIATION
// Amtrak AM AMTK
// Atlantic City Line AC ACRL
// Bergen County Line BC BERG
// BetMGM Meadowlands SL BMGM
// Gladstone Branch GS M&E
// ME Line ME M&E
// Main Line ML MAIN
// Montclair-Boonton Line MC MOBO
// Morris & Essex Line ME M&E
// North Jersey Coast Line NC NJCL
// Northeast Corridor Line NE NEC
// Pascack Valley Line PV PASC
// Princeton Branch PR PRIN
// Raritan Valley Line RV RARV
// Septa SP SEPTA