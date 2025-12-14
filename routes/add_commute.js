import { Router } from 'express';
import * as userData from '../data/users.js';
import * as transitData from '../data/transitData.js';
import { stopsCollection } from '../config/mongoCollections.js';
import { StatusError } from '../helpers/helpers.js';

const router = Router();

/* =========================
   Constants
   ========================= */
const transitSystems = [
  'NJT_BUS',
  'NJT_RAIL',
  'MTA_BUS',
  'MTA_SUBWAY',
  'PATH'
];

/* =====================================================
   ADD COMMUTE – DROPDOWN APIs (ISOLATED)
   Prefix used: /commutes/api/...
   ===================================================== */

/**
 * GET /commutes/api/stops/:transitSystem
 */
router.get('/api/stops/:transitSystem', async (req, res) => {
  try {
    const stops = await transitData.getStopsByTransitSystem(
      req.params.transitSystem
    );
    res.json(stops);
  } catch (e) {
    console.error('Stops dropdown error:', e);
    res.json([]);
  }
});

/**
 * GET /commutes/api/destinations/:originStopId
 */
router.get('/api/destinations/:originStopId', async (req, res) => {
  try {
    const stops = await stopsCollection();

    const origin = await stops.findOne(
      { stopId: req.params.originStopId },
      { projection: { transitSystem: 1, routes: 1 } }
    );

    if (!origin || !origin.routes?.length) {
      return res.json([]);
    }

    const routeIds = origin.routes.map(r => r.routeId);

    const destinations = await stops
      .find(
        {
          transitSystem: origin.transitSystem,
          stopId: { $ne: origin.stopId },
          routes: {
            $elemMatch: { routeId: { $in: routeIds } }
          }
        },
        { projection: { stopId: 1, stopName: 1 } }
      )
      .limit(50)
      .toArray();

    res.json(destinations);
  } catch (e) {
    console.error('Destination dropdown error:', e);
    res.json([]);
  }
});

/* =========================
   GET /commutes/new
   ========================= */
router.get('/new', async (req, res) => {
  try {
    res.render('addCommute', {
      title: 'New Commute',
      transitSystems,
      legs: []
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', {
      title: 'Error',
      error: 'Failed to load Add Commute page'
    });
  }
});

/* =========================
   POST /commutes
   ========================= */
router.post('/', async (req, res) => {
  let { name, legs } = req.body;
  const userId = req.session.user.userId;

  const renderWithError = (status, message) =>
    res.status(status).render('addCommute', {
      title: 'New Commute',
      transitSystems,
      error: message,
      name,
      legs
    });

  try {
    /* ---------- Commute name ---------- */
    if (!name || typeof name !== 'string') {
      return renderWithError(400, 'Commute name is required');
    }

    name = name.trim();
    if (!name) {
      return renderWithError(400, 'Commute name cannot be empty');
    }

    if (name.length > 50) {
      return renderWithError(400, 'Commute name must be under 50 characters');
    }

    /* ---------- Legs ---------- */
    if (!Array.isArray(legs) || legs.length === 0) {
      return renderWithError(400, 'At least one commute leg is required');
    }

    if (legs.length > 4) {
      return renderWithError(400, 'Maximum 4 legs allowed');
    }

    const stops = await stopsCollection();
    const validatedLegs = [];

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];

      if (!leg.transitMode || !leg.originStopId || !leg.destinationStopId) {
        return renderWithError(400, `Leg ${i + 1} is incomplete`);
      }

      if (!transitSystems.includes(leg.transitMode)) {
        return renderWithError(
          400,
          `Invalid transit system in leg ${i + 1}`
        );
      }

      const originStop = await stops.findOne({ stopId: leg.originStopId });
      const destinationStop = await stops.findOne({
        stopId: leg.destinationStopId
      });

      if (!originStop || !destinationStop) {
        return renderWithError(
          400,
          `Invalid stops selected for leg ${i + 1}`
        );
      }

      if (
        originStop.transitSystem !== leg.transitMode ||
        destinationStop.transitSystem !== leg.transitMode
      ) {
        return renderWithError(
          400,
          `Transit system mismatch in leg ${i + 1}`
        );
      }

      const routes = await transitData.findCommonRoutes(
        originStop,
        destinationStop,
        leg.transitMode
      );

      if (!routes || routes.length === 0) {
        return renderWithError(
          400,
          `No valid routes found for leg ${i + 1}`
        );
      }

      validatedLegs.push({
        legOrder: i,
        transitMode: leg.transitMode,
        originStopId: originStop.stopId,
        originStopName: originStop.stopName,
        destinationStopId: destinationStop.stopId,
        destinationStopName: destinationStop.stopName,
        routes
      });
    }

    /* ---------- Save commute ---------- */
    const savedCommute = {
  name,
  legs: validatedLegs
};

await userData.addCommute(userId, savedCommute);

return res.render('addCommute', {
  title: 'New Commute',
  transitSystems,
  success: '✅ Commute saved successfully!',
  savedCommute
});

  } catch (err) {
    console.error('Add commute error:', err);

    if (err instanceof StatusError) {
      return renderWithError(err.status, err.message);
    }

    return renderWithError(500, 'Failed to add commute');
  }
});

export default router;
