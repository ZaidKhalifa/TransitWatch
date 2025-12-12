import { Router } from 'express';
const router = Router();
import * as userData from '../data/users.js';
import * as transitData from '../data/transitHelpers.js';
import * as NJTBusHelpers from '../helpers/NJTBusHelpers.js';
import { stopsCollection } from '../config/mongoCollections.js';

const helpers = { "NJT_BUS": NJTBusHelpers };

/* ============================================================================
 * ROUTES FOR ADD COMMUTE PAGE - DROPDOWN FILTERING
 * ============================================================================ */

/**
 * GET /dashboard-api/stops/:transitSystem
 * Get all stops for a transit system (for initial dropdown)
 */
router.get('/stops/:transitSystem', async (req, res) => {
    try {
        const stops = await transitData.getStopsByTransitSystem(req.params.transitSystem);
        res.json(stops);
    } catch (e) {
        console.error('Error fetching stops:', e);
        res.status(e.status || 500).json({ error: e.message || 'Failed to fetch stops' });
    }
});

/**
 * GET /dashboard-api/destinations/:originStopId
 * Get possible destination stops from an origin
 */
router.get('/destinations/:originStopId', async (req, res) => {
    try {
        const result = await transitData.getPossibleDestinations(req.params.originStopId);
        res.json(result);
    } catch (e) {
        console.error('Error fetching destinations:', e);
        res.status(e.status || 500).json({ error: e.message || 'Failed to fetch destinations' });
    }
});

/**
 * GET /dashboard-api/origins/:destinationStopId
 * Get possible origin stops for a destination
 */
router.get('/origins/:destinationStopId', async (req, res) => {
    try {
        const result = await transitData.getPossibleOrigins(req.params.destinationStopId);
        res.json(result);
    } catch (error) {
        console.error('Error fetching origins:', error);
        res.status(500).json({ error: 'Failed to fetch origins' });
    }
});

/* ============================================================================
 * ROUTES FOR DASHBOARD - REAL-TIME TRIP LOOKUPS
 * ============================================================================ */

/**
 * GET /dashboard-api/commute/:commuteId/leg-options/:legOrder
 * Get available trip options for a specific leg
 * 
 * Used when:
 * - User first loads dashboard (legOrder 0)
 * - User marks a leg as "taken" and moves to next leg
 * - User wants to see options for any leg
 */
router.get('/commute/:commuteId/leg-options/:legOrder', async (req, res) => {
    try {
        const userId = req.session.user.userId;
        const { commuteId, legOrder } = req.params;
        const legIndex = parseInt(legOrder);
        
        // Fetch the commute
        const commute = await userData.getCommuteById(userId, commuteId);
        
        if (isNaN(legIndex) || legIndex < 0 || legIndex >= commute.legs.length) {
            return res.status(400).json({ error: 'Invalid leg order' });
        }
        
        const leg = commute.legs[legIndex];
        const helper = helpers[leg.transitMode];
        
        if (!helper) {
            return res.status(400).json({ error: 'Unsupported transit mode' });
        }
        
        // Get available trips starting from now (or could accept minTime as query param)
        const minTime = req.query.minTime ? new Date(req.query.minTime) : new Date();
        const trips = await helper.getAvailableTrips(leg, minTime);
        
        if (trips.length === 0) {
            return res.json({
                available: false,
                message: 'No trips currently available. Service may have ended for the day.',
                legOrder: legIndex
            });
        }
        
        // Update lastUsed timestamp
        await userData.updateCommuteLastUsed(userId, commuteId);
        
        res.json({
            available: true,
            legOrder: legIndex,
            trips: trips
        });
        
    } catch (error) {
        console.error('Error fetching leg options:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch trip options' });
    }
});

/**
 * POST /dashboard-api/commute/:commuteId/calculate
 * Calculate full commute timing from a specific leg onwards
 * 
 * Body:
 * {
 *   beginningLegOrder: number,                 // Which leg to start calculating from (0 = all legs)
 *   firstLegTripId: string (optional),         // If provided, use this trip for the beginning leg
 *   firstLegRouteInfo: {                       // Route info for the selected trip (from leg-options response)
 *     routeId: string,
 *     routeName: string,
 *     direction: string
 *   } (optional, required if firstLegTripId provided),
 *   customWalkTimes: [number] (optional),      // Override walk times [walkAfterLeg0, walkAfterLeg1, ...]
 *   startTime: ISO string (optional)           // When to start calculating (for mid-commute)
 * }
 */
router.post('/commute/:commuteId/calculate', async (req, res) => {
    try {
        const userId = req.session.user.userId;
        const { commuteId } = req.params;
        const { beginningLegOrder = 0, firstLegTripId, firstLegRouteInfo, customWalkTimes, startTime } = req.body;
        
        // Fetch the commute
        const commute = await userData.getCommuteById(userId, commuteId);
        
        if (beginningLegOrder < 0 || beginningLegOrder >= commute.legs.length) {
            return res.status(400).json({ error: 'Invalid beginning leg order' });
        }
        
        // If firstLegTripId is provided, firstLegRouteInfo must also be provided
        if (firstLegTripId && !firstLegRouteInfo) {
            return res.status(400).json({ 
                error: 'firstLegRouteInfo is required when firstLegTripId is provided' 
            });
        }
        
        const legsToCalculate = commute.legs.slice(beginningLegOrder);
        
        // Fetch all stops we'll need for walk time calculations
        const stops = await stopsCollection();
        const stopIds = legsToCalculate.flatMap(leg => [leg.originStopId, leg.destinationStopId]);
        const stopObjects = await stops.find({ stopId: { $in: [...new Set(stopIds)] } }).toArray();
        const stopMap = Object.fromEntries(stopObjects.map(s => [s.stopId, s]));
        
        const legDetails = [];
        const walkTimes = [];
        let currentMinTime = startTime ? new Date(startTime) : new Date();
        
        for (let i = 0; i < legsToCalculate.length; i++) {
            const leg = legsToCalculate[i];
            const actualLegOrder = beginningLegOrder + i;
            const helper = helpers[leg.transitMode];
            
            if (!helper) {
                return res.status(400).json({ 
                    error: `Unsupported transit mode for leg ${actualLegOrder}: ${leg.transitMode}` 
                });
            }
            
            try {
                let details;
                
                if (i === 0 && firstLegTripId) {
                    // First leg: user selected a specific trip
                    // We need to get the trip details, but we don't know which route it is
                    // from the stored routes array unless we check all of them
                    // Simpler: just get the trip details and use the provided route info
                    details = await helper.getTripDetails(leg, currentMinTime, firstLegTripId);
                    // Override with the route info we got from leg-options
                    details.routeId = firstLegRouteInfo.routeId;
                    details.routeName = firstLegRouteInfo.routeName;
                    details.direction = firstLegRouteInfo.direction;
                } else {
                    // Subsequent legs: auto-select earliest available
                    // getTripDetails will call getAvailableTrips which uses leg.routes
                    details = await helper.getTripDetails(leg, currentMinTime, null);
                }
                
                legDetails.push({
                    ...details,
                    legOrder: actualLegOrder
                });
                
                // Calculate walk time to next leg (if there is one)
                if (i < legsToCalculate.length - 1) {
                    let walkTime;
                    
                    // Priority: custom > stored preference > GPS calculation
                    const walkTimeIndex = actualLegOrder + 1;
                    if (customWalkTimes && customWalkTimes[walkTimeIndex] != null)
                        walkTime = customWalkTimes[walkTimeIndex];
                    else
                        walkTime = legsToCalculate[i+1].walkingTimeAfterMinutes;
                    
                    walkTimes.push(walkTime);
                    
                    // Update minimum start time for next leg
                    currentMinTime = new Date(details.arrivalTime);
                    currentMinTime.setMinutes(currentMinTime.getMinutes() + walkTime);
                }
                
            } catch (error) {
                // No trips available for this leg
                return res.json({
                    error: error.message || `No trips available for leg ${actualLegOrder}`,
                    legOrder: actualLegOrder,
                    partialResults: legDetails.length > 0 ? { 
                        legs: legDetails, 
                        walkTimes 
                    } : null
                });
            }
        }
        
        // Calculate totals
        const firstDeparture = new Date(legDetails[0].departureTime);
        const lastArrival = new Date(legDetails[legDetails.length - 1].arrivalTime);
        const totalDuration = Math.round((lastArrival - firstDeparture) / (1000 * 60));
        
        // Update lastUsed timestamp
        await userData.updateCommuteLastUsed(userId, commuteId);
        
        res.json({
            success: true,
            beginningLegOrder: beginningLegOrder,
            legs: legDetails,
            walkTimes: walkTimes,
            totalDuration: totalDuration,
            totalTransitTime: legDetails.reduce((sum, leg) => sum + leg.duration, 0),
            totalWalkTime: walkTimes.reduce((sum, time) => sum + time, 0),
            departureTime: legDetails[0].departureTime,
            arrivalTime: legDetails[legDetails.length - 1].arrivalTime,
            feasibilityScore: 10 // TODO: Calculate from reports subcollection
        });
        
    } catch (error) {
        console.error('Error calculating commute:', error);
        res.status(500).json({ error: error.message || 'Failed to calculate commute' });
    }
});

/**
 * GET /dashboard-api/commutes
 * Get all commutes for the logged-in user
 * (In case you need this for initial page load)
 */
router.get('/commutes', async (req, res) => {
    try {
        const userId = req.session.user.userId;
        const commutes = await userData.getUserCommutes(userId);
        res.json(commutes);
    } catch (error) {
        console.error('Error fetching commutes:', error);
        res.status(500).json({ error: 'Failed to fetch commutes' });
    }
});

/**
 * DELETE /dashboard-api/commute/:commuteId
 * Delete a commute
 */
router.delete('/commute/:commuteId', async (req, res) => {
    try {
        const userId = req.session.user.userId;
        await userData.deleteCommute(userId, req.params.commuteId);
        res.json({ success: true, message: 'Commute deleted' });
    } catch (error) {
        console.error('Error deleting commute:', error);
        res.status(500).json({ error: error.message || 'Failed to delete commute' });
    }
});

export default router;