import { Router } from 'express';
const router = Router();
import * as userData from '../data/userCommutes.js';
import * as transitData from '../data/transitData.js';
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
 *   selectedTrips: [                           // Array matching leg indices, null = auto-select
 *     null,                                    // Leg 0: auto-select
 *     { tripId: "123", routeInfo: {...} },     // Leg 1: user selected this trip
 *     null,                                    // Leg 2: auto-select
 *     ...
 *   ],
 *   customWalkTimes: [number | null],          // Override walk times [null, 5, null, ...] (index = leg that FOLLOWS the walk)
 *   startTime: ISO string (optional)           // When to start calculating (e.g., arrival time of in-transit leg + walk)
 * }
 * 
 * Response includes the actual walk times used (from custom, stored, or calculated)
 */
router.post('/commute/:commuteId/calculate', async (req, res) => {
    try {
        const userId = req.session.user.userId;
        const { commuteId } = req.params;
        const { beginningLegOrder = 0, selectedTrips = [], customWalkTimes = [], startTime } = req.body;
        
        // Fetch the commute
        const commute = await userData.getCommuteById(userId, commuteId);
        
        if (beginningLegOrder < 0 || beginningLegOrder >= commute.legs.length) {
            return res.status(400).json({ error: 'Invalid beginning leg order' });
        }
        
        const legsToCalculate = commute.legs.slice(beginningLegOrder);
        
        // Fetch all stops we'll need for walk time calculations
        const stops = await stopsCollection();
        const stopIds = legsToCalculate.flatMap(leg => [leg.originStopId, leg.destinationStopId]);
        const stopObjects = await stops.find({ stopId: { $in: [...new Set(stopIds)] } }).toArray();
        const stopMap = Object.fromEntries(stopObjects.map(s => [s.stopId, s]));
        
        const legDetails = [];
        const walkTimesUsed = [];
        let currentMinTime = startTime ? new Date(startTime) : new Date();
        
        for (let i = 0; i < legsToCalculate.length; i++) {
            const leg = legsToCalculate[i];
            const actualLegOrder = beginningLegOrder + i;
            const helper = helpers[leg.transitMode];
            
            if (!helper) {
                // Return partial results with unsupported mode info
                legDetails.push({
                    legOrder: actualLegOrder,
                    transitMode: leg.transitMode,
                    originStopId: leg.originStopId,
                    originStopName: leg.originStopName,
                    destinationStopId: leg.destinationStopId,
                    destinationStopName: leg.destinationStopName,
                    error: `Live data unavailable for ${leg.transitMode}`,
                    unsupported: true
                });
                
                // Still calculate walk time for next leg if applicable
                if (i < legsToCalculate.length - 1) {
                    const walkTimeIndex = actualLegOrder + 1;
                    let walkTime;
                    if (customWalkTimes && customWalkTimes[walkTimeIndex] != null) {
                        walkTime = customWalkTimes[walkTimeIndex];
                    } else {
                        walkTime = legsToCalculate[i+1].walkingTimeAfterMinutes || 5;
                    }
                    walkTimesUsed.push({ legIndex: walkTimeIndex, minutes: walkTime, source: customWalkTimes[walkTimeIndex] != null ? 'custom' : 'stored' });
                }
                continue;
            }
            
            try {
                let details;

                // Check if user selected a specific trip for this leg
                const selectedTrip = selectedTrips[actualLegOrder];
                
                if (selectedTrip && selectedTrip.tripId) {
                    // User selected a specific trip for this leg
                    details = await helper.getTripDetails(leg, currentMinTime, selectedTrip.tripId);
                    // Override with the route info from the selection
                    details.routeId = selectedTrip.routeInfo.routeId;
                    details.routeName = selectedTrip.routeInfo.routeName;
                    details.direction = selectedTrip.routeInfo.direction;
                } else {
                    // Auto-select earliest available trip
                    details = await helper.getTripDetails(leg, currentMinTime, null);
                }
                
                legDetails.push({
                    ...details,
                    legOrder: actualLegOrder,
                    transitMode: leg.transitMode
                });
                
                // Calculate walk time to next leg (if there is one)
                if (i < legsToCalculate.length - 1) {
                    // Priority: custom > stored preference > GPS calculation
                    const walkTimeIndex = actualLegOrder + 1;
                    let walkTime;
                    let walkSource;

                    if (customWalkTimes && customWalkTimes[walkTimeIndex] != null)
                    {
                        walkTime = customWalkTimes[walkTimeIndex];
                        walkSource = 'custom';
                    }
                    else
                    {
                        walkTime = legsToCalculate[i+1].walkingTimeAfterMinutes || 5;
                        walkSource = 'stored';
                    }
                    
                    walkTimesUsed.push({ 
                        legIndex: walkTimeIndex, 
                        minutes: walkTime, 
                        source: walkSource 
                    });
                    
                    // Update minimum start time for next leg
                    currentMinTime = new Date(details.arrivalTime);
                    currentMinTime.setMinutes(currentMinTime.getMinutes() + walkTime);
                }
                
            } catch (error) {
                // No trips available for this leg
                legDetails.push({
                    legOrder: actualLegOrder,
                    transitMode: leg.transitMode,
                    originStopId: leg.originStopId,
                    originStopName: leg.originStopName,
                    destinationStopId: leg.destinationStopId,
                    destinationStopName: leg.destinationStopName,
                    error: error.message || `No trips available`,
                    unavailable: true
                });

                // Mark subsequent legs as dependent on this unavailable leg
                for (let j = i + 1; j < legsToCalculate.length; j++) {
                    const futureLeg = legsToCalculate[j];
                    legDetails.push({
                        legOrder: beginningLegOrder + j,
                        transitMode: futureLeg.transitMode,
                        originStopId: futureLeg.originStopId,
                        originStopName: futureLeg.originStopName,
                        destinationStopId: futureLeg.destinationStopId,
                        destinationStopName: futureLeg.destinationStopName,
                        error: 'Previous leg unavailable',
                        dependencyError: true
                    });
                }

                return res.json({
                    success: false,
                    error: error.message || `No trips available for leg ${actualLegOrder}`,
                    errorLegOrder: actualLegOrder,
                    beginningLegOrder: beginningLegOrder,
                    legs: legDetails,
                    walkTimes: walkTimesUsed
                });
            }
        }

        const successfulLegs = legDetails.filter(l => !l.error);

        if (successfulLegs.length === 0) {
            return res.json({
                success: false,
                error: 'No legs could be calculated',
                beginningLegOrder: beginningLegOrder,
                legs: legDetails,
                walkTimes: walkTimesUsed
            });
        }
        
        // Calculate totals from successful legs
        const firstDeparture = new Date(successfulLegs[0].departureTime);
        const lastArrival = new Date(successfulLegs[successfulLegs.length - 1].arrivalTime);
        const totalDuration = Math.round((lastArrival - firstDeparture) / (1000 * 60));
        
        // Update lastUsed timestamp
        await userData.updateCommuteLastUsed(userId, commuteId);
        
        res.json({
            success: true,
            beginningLegOrder: beginningLegOrder,
            legs: legDetails,
            walkTimes: walkTimesUsed,
            totalDuration: totalDuration,
            totalTransitTime: successfulLegs.reduce((sum, leg) => sum + (leg.duration || 0), 0),
            totalWalkTime: walkTimesUsed.reduce((sum, w) => sum + w.minutes, 0),
            departureTime: successfulLegs[0].departureTime,
            arrivalTime: successfulLegs[successfulLegs.length - 1].arrivalTime,
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
 * (In case we need this for initial page load)
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
 * GET /api/commute/:commuteId/feasibility
 * Get feasibility score for a commute based on reports at its stations
 * 
 * Returns:
 * {
 *   score: number (1-10),
 *   level: 'good' | 'moderate' | 'poor',
 *   message: string
 * }
 * 
 * Score calculation (TODO - implement properly):
 * - 7-10: Good (green) - few or no issues reported
 * - 4-6: Moderate (yellow) - some issues reported
 * - 1-3: Poor (red) - many issues reported
 */
router.get('/commute/:commuteId/feasibility', async (req, res) => {
    try {
        const userId = req.session.user.userId;
        const { commuteId } = req.params;
        
        // Verify the commute exists and belongs to user
        const commute = await userData.getCommuteById(userId, commuteId);
        
        // TODO: Calculate actual score based on:
        // - Number of active accessibility issues at stops
        // - Typical delay frequency for routes
        // - Transfer distance difficulty
        // For now, return dummy score of 10
        
        const score = 10;
        
        let level, message;
        if (score >= 7) {
            level = 'good';
            message = 'Route conditions are good';
        } else if (score >= 4) {
            level = 'moderate';
            message = 'Some issues reported on this route';
        } else {
            level = 'poor';
            message = 'Multiple issues reported on this route';
        }
        
        res.json({
            score,
            level,
            message
        });
        
    } catch (error) {
        console.error('Error fetching feasibility:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch feasibility score' });
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