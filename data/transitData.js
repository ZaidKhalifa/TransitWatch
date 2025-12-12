import { stopsCollection, routesCollection } from '../config/mongoCollections.js';
import { getDistance } from 'geolib';
import { StatusError } from '../helpers/helpers.js';

const transit_systems = ["NJT_BUS","NJT_RAIL","MTA_BUS","MTA_SUBWAY","PATH"];

/**
 * Finds all common routes between two stops and validates they're actually connected.
 * Uses routes collection to check stop order - no API calls needed!
 * 
 * @param {Object} originStop - Origin stop object from database
 * @param {Object} destinationStop - Destination stop object from database
 * @param {string} TransitSystem - the transit system
 * @returns {Promise<Array>} Array of valid common routes:
 * [{
 *   routeId: '125',
 *   routeName: 'Jersey City - Journal Square - New York',
 *   validDirections: [
 *     {
 *       directionId: '1',
 *       directionName: '125 NEW YORK',
 *       originStopOrder: 1,
 *       destinationStopOrder: 33
 *     }
 *   ]
 * }]
 * @throws {StatusError} 404 if no valid routes found
 */
export const findCommonRoutes = async (originStop, destinationStop, transitSystem) => {
    const routes = await routesCollection();
    const validRoutes = [];
    
    // Get all route IDs that appear in both stops
    const originRouteIds = originStop.routes.map(r => r.routeId);
    const destRouteIds = destinationStop.routes.map(r => r.routeId);
    const commonRouteIds = originRouteIds.filter(id => destRouteIds.includes(id));
    
    if (commonRouteIds.length === 0) {
        throw new StatusError(
            `No common routes found between ${originStop.stopName} and ${destinationStop.stopName}`,
            404
        );
    }
    
    // For each common route, check which directions are valid
    for (const routeId of commonRouteIds) {
        const routeDoc = await routes.findOne({ 
            routeId: routeId,
            transitSystem
        });
        
        if (!routeDoc) continue;
        
        const validDirections = [];
        
        // Check each direction to see if origin comes before destination
        for (const direction of routeDoc.directions) {
            const originStopInDir = direction.stops.find(s => s.stopId === originStop.stopId);
            const destStopInDir = direction.stops.find(s => s.stopId === destinationStop.stopId);
            
            // Both stops must exist AND origin must come before destination
            if (originStopInDir && destStopInDir && originStopInDir.stopOrder < destStopInDir.stopOrder) {
                validDirections.push({
                    directionId: direction.directionId,
                    directionName: direction.directionName,
                    originStopOrder: originStopInDir.stopOrder,
                    destinationStopOrder: destStopInDir.stopOrder
                });
            }
        }
        
        if (validDirections.length > 0) {
            validRoutes.push({
                routeId: routeDoc.routeId,
                routeName: routeDoc.routeName,
                directions: validDirections
            });
        }
    }
    
    if (validRoutes.length === 0) {
        throw new StatusError(
            `No valid route directions found between ${originStop.stopName} and ${destinationStop.stopName}`,
            404
        );
    }
    
    return validRoutes;
};

/**
 * Get all stops for a given transit system (for initial dropdown)
 */
export const getStopsByTransitSystem = async (transitSystem) => {
    const stops = await stopsCollection();
    return await stops.find({ transitSystem }).toArray();
};

/**
 * Get possible destination stops from an origin stop.
 * Uses routes collection to check stopOrder - only returns stops that come AFTER origin.
 * 
 * @param {string} originStopId - e.g., "NJTB_20883"
 * @returns {Object} {
 *   transitSystem: "NJT_BUS",
 *   destinations: [{stopId: "NJTB_26229", stopName: "PORT AUTHORITY"}, ...]
 * }
 */
export const getPossibleDestinations = async (originStopId) => {
    const stops = await stopsCollection();
    const routes = await routesCollection();
    
    const originStop = await stops.findOne({ stopId: originStopId });
    if (!originStop) return { transitSystem: null, destinations: [] };
    
    const destinationSet = new Set(); // Use Set to avoid duplicates
    const destinationDetails = new Map(); // stopId -> {stopId, stopName}
    
    // For each route that serves the origin stop
    for (const originRoute of originStop.routes) {
        // Fetch the full route document
        const routeDoc = await routes.findOne({
            routeId: originRoute.routeId,
            transitSystem: originStop.transitSystem
        });
        
        if (!routeDoc) continue;
        
        // For each direction that exists at the origin stop
        for (const directionName of originRoute.directions) {
            // Find the matching direction in the route document
            const direction = routeDoc.directions.find(d => d.directionName === directionName);
            if (!direction) continue;
            
            // Find origin's position in this direction
            const originInDirection = direction.stops.find(s => s.stopId === originStopId);
            if (!originInDirection) continue;
            
            // Find all stops that come AFTER origin (higher stopOrder)
            for (const stop of direction.stops) {
                if (stop.stopOrder > originInDirection.stopOrder) {
                    if (!destinationSet.has(stop.stopId)) {
                        destinationSet.add(stop.stopId);
                        destinationDetails.set(stop.stopId, {
                            stopId: stop.stopId,
                            stopName: stop.stopName
                        });
                    }
                }
            }
        }
    }
    
    return {
        transitSystem: originStop.transitSystem,
        destinations: Array.from(destinationDetails.values())
    };
};

/**
 * Get possible origin stops for a destination stop.
 * Uses routes collection to check stopOrder - only returns stops that come BEFORE destination.
 * 
 * @param {string} destinationStopId - e.g., "NJTB_26229"
 * @returns {Object} {
 *   transitSystem: "NJT_BUS",
 *   origins: [{stopId: "NJTB_20883", stopName: "JOURNAL SQUARE"}, ...]
 * }
 */
export const getPossibleOrigins = async (destinationStopId) => {
    const stops = await stopsCollection();
    const routes = await routesCollection();
    
    const destStop = await stops.findOne({ stopId: destinationStopId });
    if (!destStop) return { transitSystem: null, origins: [] };
    
    const originSet = new Set(); // Use Set to avoid duplicates
    const originDetails = new Map(); // stopId -> {stopId, stopName}
    
    // For each route that serves the destination stop
    for (const destRoute of destStop.routes) {
        // Fetch the full route document
        const routeDoc = await routes.findOne({
            routeId: destRoute.routeId,
            transitSystem: destStop.transitSystem
        });
        
        if (!routeDoc) continue;
        
        // For each direction that exists at the destination stop
        for (const directionName of destRoute.directions) {
            // Find the matching direction in the route document
            const direction = routeDoc.directions.find(d => d.directionName === directionName);
            if (!direction) continue;
            
            // Find destination's position in this direction
            const destInDirection = direction.stops.find(s => s.stopId === destinationStopId);
            if (!destInDirection) continue;
            
            // Find all stops that come BEFORE destination (lower stopOrder)
            for (const stop of direction.stops) {
                if (stop.stopOrder < destInDirection.stopOrder) {
                    if (!originSet.has(stop.stopId)) {
                        originSet.add(stop.stopId);
                        originDetails.set(stop.stopId, {
                            stopId: stop.stopId,
                            stopName: stop.stopName
                        });
                    }
                }
            }
        }
    }
    
    return {
        transitSystem: destStop.transitSystem,
        origins: Array.from(originDetails.values())
    };
};

/**
 * USAGE IN FRONTEND:
 * 
 * 1. User selects "NJT Bus" from transit system dropdown
 *    -> Call GET /api/stops/NJT_BUS
 *    -> Populate "From" dropdown with all stops
 * 
 * 2. User selects "Journal Square" from "From" dropdown (stopId: "NJTB_20883")
 *    -> Call GET /api/destinations/NJTB_20883
 *    -> Response: { transitSystem: "NJT_BUS", destinations: [{stopId, stopName}, ...] }
 *    -> Populate "To" dropdown with only reachable destinations
 * 
 * 3. User selects "Port Authority" from "To" dropdown
 *    -> Call GET /api/origins/NJTB_20883
 *    -> Response: { transitSystem: "NJT_BUS", destinations: [{stopId, stopName}, ...] }
 * 
 * 4. User selects all options and submits:
 *    -> does possible client side validation
 *    -> form does a normal post and POST /addCommute will check for errors and rerender the page 
 *       with error messages if needed (check how the login and signup pages work)
 */


/**
 * Calculate walking time between two GPS coordinates.
 * 
 * @param {Array} coords1 - [longitude, latitude] from MongoDB GeoJSON format
 * @param {Array} coords2 - [longitude, latitude] from MongoDB GeoJSON format
 * @returns {number} Walking time in minutes (rounded up)
 * using a slightly lower than average walking time of 1 m/s to account for path deviation
 */
export const calculateWalkTime = (coords1, coords2) => {
    const distance = getDistance(
        { latitude: coords1[0], longitude: coords1[1] },
        { latitude: coords2[0], longitude: coords2[1] }
    );
    return Math.ceil(distance / 60);
};