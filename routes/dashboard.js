import { Router } from 'express';
const router = Router();

/**
 * GET /dashboard
 * Render the dashboard page
 * Commute data will be fetched via AJAX after page load
 */
router.get('/', async (req, res) => {
    res.render('dashboard', {
        title: 'Dashboard'
    });
});

export default router;
