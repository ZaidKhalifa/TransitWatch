import { Router } from 'express';
const router = Router();
import * as userData from '../data/users.js';
import * as transitData from '../data/transitData.js';
import * as NJTBusHelpers from '../helpers/NJTBusHelpers.js';
import { stopsCollection } from '../config/mongoCollections.js';
import { StatusError } from '../helpers/helpers.js';

const transit_systems = ["NJT_BUS","NJT_RAIL","MTA_BUS","MTA_SUBWAY","PATH"];

const helpers = { "NJT_BUS": NJTBusHelpers };


router
    .route('/')
    .get(async (req, res) => {
        // TODO: Render the add-commute form
        res.render('addCommute', {
            title: 'Add New Commute'
        });
    })
    .post(async (req, res) => {
        let { name, legs } = req.body;
        const userId = req.session.user.userId;
        const errors = [];
        
        // Helper function to re-render with error
        const renderWithError = (statusCode, errorMessage) => {
            return res.status(statusCode).render('addCommute', {
                title: 'Add New Commute',
                transitSystems: transit_systems,
                error: errorMessage,
                name: name,
                legs: legs // Preserve user's input
            });
        };
        
        try {
            // Validate commute name
            if (!name || typeof name !== 'string') {
                return renderWithError(400, 'Commute name is required');
            }
            
            name = name.trim();
            
            if (name.length === 0) {
                return renderWithError(400, 'Commute name cannot be empty');
            }
            
            if (!/^[a-zA-Z0-9\s_-]+$/.test(name)) {
                return renderWithError(400, 'Commute name can only contain letters, numbers, spaces, hyphens and underscores');
            }
            
            if (name.length > 50) {
                return renderWithError(400, 'Commute name must be 50 characters or less');
            }
            
            // Validate legs array
            if (!Array.isArray(legs)) {
                return renderWithError(400, 'Invalid commute data');
            }
            
            if (legs.length === 0) {
                return renderWithError(400, 'At least one leg is required');
            }
            
            if (legs.length > 4) {
                return renderWithError(400, 'Maximum four legs allowed');
            }
            
            // Fetch stops collection once
            const stops = await stopsCollection();
            
            // Validate and enrich each leg
            const validatedLegs = [];
            
            for (let i = 0; i < legs.length; i++) {
                const leg = legs[i];
                
                // Validate required fields
                if (!leg.transitMode || !leg.originStopId || !leg.destinationStopId) {
                    return renderWithError(400, `Leg ${i + 1} is missing required fields`);
                }

                if (typeof leg.transitMode !== 'string' || typeof leg.originStopId !== 'string' || typeof leg.destinationStopId !== 'string') {
                    return renderWithError(400, `Leg ${i + 1} has invalid data types`);
                }

                const transitMode = leg.transitMode.trim();
                const originStopId = leg.originStopId.trim();
                const destinationStopId = leg.destinationStopId.trim();

                if (transitMode.length === 0 || originStopId.length === 0 || destinationStopId.length === 0) {
                    return renderWithError(400, `Leg ${i + 1} has incomplete data`);
                }

                if (!transit_systems.includes(transitMode)) {
                    return renderWithError(400, `Invalid transit system for leg ${i + 1}`);
                }
                
                // Fetch full stop documents
                const originStop = await stops.findOne({ stopId: originStopId });
                const destinationStop = await stops.findOne({ stopId: destinationStopId });
                
                if (!originStop || !destinationStop) {
                    return renderWithError(400, `Invalid stops for leg ${i + 1}`);
                }
                
                // Verify stops are from the same transit system
                if (originStop.transitSystem !== transitMode || destinationStop.transitSystem !== transitMode) {
                    return renderWithError(400, `Stop transit system mismatch for leg ${i + 1}`);
                }
                
                // Validate that there's a valid route connection
                const helper = helpers[transitMode];
                if (!helper) {
                    return renderWithError(400, `Transit system ${transitMode} is not yet supported`);
                }
                
                let validRoutes;
                try {
                    validRoutes = await transitData.findCommonRoutes(originStop, destinationStop, transitMode);
                    
                    if (!validRoutes || validRoutes.length === 0) {
                        return renderWithError(400, `No valid routes found for leg ${i + 1}`);
                    }
                } catch (error) {
                    return renderWithError(400, `No valid connection for leg ${i + 1}: ${error.message}`);
                }
                
                // Calculate walk time from previous leg to this leg
                let walkingTimeAfterMinutes = null;
                let walkingTimeUserCustomized = false;
                
                if (i > 0) {
                    if (leg.walkingTimeAfterMinutes && typeof leg.walkingTimeAfterMinutes === 'number' && leg.walkingTimeAfterMinutes > 0) {
                        // User provided custom walk time
                        walkingTimeAfterMinutes = Math.round(leg.walkingTimeAfterMinutes);
                        walkingTimeUserCustomized = true;
                    } else {
                        // Calculate from GPS
                        const prevLeg = validatedLegs[i - 1];
                        const prevDestStop = await stops.findOne({ stopId: prevLeg.destinationStopId });
                        
                        if (prevDestStop) {
                            walkingTimeAfterMinutes = transitData.calculateWalkTime(
                                prevDestStop.location.coordinates,
                                originStop.location.coordinates
                            );
                        } else {
                            walkingTimeAfterMinutes = 5; // Default 5 minutes if calculation fails
                        }
                    }
                }
                
                // Build validated leg object
                validatedLegs.push({
                    legOrder: i,
                    transitMode,
                    originStopId,
                    originStopName: originStop.stopName,
                    destinationStopId,
                    destinationStopName: destinationStop.stopName,
                    routes: validRoutes,
                    walkingTimeAfterMinutes,
                    walkingTimeUserCustomized
                });
            }
            
            // Create commute object
            const commuteData = {
                name,
                legs: validatedLegs
            };
            
            // Save to database
            const newCommute = await userData.addCommute(userId, commuteData);
            
            // Success - redirect to dashboard
            return res.redirect('/dashboard');
            
        } catch (error) {
            console.error('Error adding commute:', error);
            
            if (error instanceof StatusError) {
                return renderWithError(error.status, error.message);
            }
            
            return renderWithError(500, 'Failed to add commute. Please try again.');
        }
    });



export default router;