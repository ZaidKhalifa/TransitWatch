import { Router } from 'express';
import * as userData from '../data/users.js';
import * as userCommutes from '../data/userCommutes.js';
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
 * FIXED: Show ALL valid destinations in same transit system
 */
router.get('/api/destinations/:originStopId', async (req, res) => {
  try {
    const stops = await stopsCollection();

    const origin = await stops.findOne(
      { stopId: req.params.originStopId },
      { projection: { transitSystem: 1 } }
    );

    if (!origin) {
      return res.json([]);
    }

    const destinations = await stops
      .find(
        {
          transitSystem: origin.transitSystem,
          stopId: { $ne: req.params.originStopId }
        },
        { projection: { stopId: 1, stopName: 1 } }
      )
      .sort({ stopName: 1 })
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
      legs: [],
      isEditMode: false
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
   GET /commutes/edit/:commuteId
   ========================= */
router.get('/edit/:commuteId', async (req, res) => {
  try {
    const userId = req.session.user.userId;
    const commute = await userCommutes.getCommuteById(userId, req.params.commuteId);
    
    if (!commute) {
      return res.status(404).render('error', {
        title: 'Not Found',
        error: 'Commute not found'
      });
    }

    res.render('addCommute', {
      title: 'Edit Commute',
      transitSystems,
      isEditMode: true,
      commuteId: req.params.commuteId,
      existingCommute: JSON.stringify(commute)
    });
  } catch (err) {
    console.error('Edit commute error:', err);
    res.status(500).render('error', {
      title: 'Error',
      error: 'Failed to load commute for editing'
    });
  }
});

/* =========================
   POST /commutes (Create new)
   ========================= */
router.post('/', async (req, res) => {
  return handleCommuteSave(req, res, false);
});

/* =========================
   POST /commutes/edit/:commuteId (Update existing)
   ========================= */
router.post('/edit/:commuteId', async (req, res) => {
  return handleCommuteSave(req, res, true, req.params.commuteId);
});

/**
 * Shared handler for create and update
 */
async function handleCommuteSave(req, res, isEdit, commuteId = null) {
  let { name, legs } = req.body;
  const userId = req.session.user.userId;

  const renderWithError = (status, message) =>
    res.status(status).render('addCommute', {
      title: isEdit ? 'Edit Commute' : 'New Commute',
      transitSystems,
      error: message,
      name,
      legs,
      isEditMode: isEdit,
      commuteId
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

      // Parse walk time from form (comes as string)
      let walkTimeAfter = null;
      let walkTimeUserCustomized = false;
      
      if (leg.walkTimeAfter !== undefined && leg.walkTimeAfter !== '') {
        walkTimeAfter = parseInt(leg.walkTimeAfter);
        if (isNaN(walkTimeAfter) || walkTimeAfter < 1 || walkTimeAfter > 60) {
          walkTimeAfter = null;
        }
      }
      
      if (leg.walkTimeUserCustomized === 'true' || leg.walkTimeUserCustomized === true) {
        walkTimeUserCustomized = true;
      }

      validatedLegs.push({
        legOrder: i,
        transitMode: leg.transitMode,
        originStopId: originStop.stopId,
        originStopName: originStop.stopName,
        destinationStopId: destinationStop.stopId,
        destinationStopName: destinationStop.stopName,
        routes,
        preferences: {
          walkingTimeAfterMinutes: walkTimeAfter,
          walkingTimeUserCustomized: walkTimeUserCustomized
        }
      });
    }

    /* ---------- Save or Update commute ---------- */
    const commuteData = {
      name,
      legs: validatedLegs
    };

    if (isEdit && commuteId) {
      // Update existing commute
      await userCommutes.updateCommute(userId, commuteId, commuteData);
      return res.redirect('/dashboard');
    } else {
      // Create new commute
      await userData.addCommute(userId, commuteData);
      return res.render('addCommute', {
        title: 'New Commute',
        transitSystems,
        success: '✅ Commute saved successfully!',
        savedCommute: commuteData,
        isEditMode: false
      });
    }

  } catch (err) {
    console.error('Save commute error:', err);

    if (err instanceof StatusError) {
      return renderWithError(err.status, err.message);
    }

    return renderWithError(500, 'Failed to save commute');
  }
}

export default router;