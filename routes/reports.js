import express from 'express';
import { createReport, getReportsByUser, getReportById, updateReport, deleteReport } from '../data/reports.js';
import { isAuthenticated } from '../middleware.js';

const router = express.Router();

router.get('/', isAuthenticated, async (req, res) => {
    try {
        const reports = await getReportsByUser(req.session.user.userId);
        res.render('reports', {
            title: 'Accessibility Reports',
            user: req.session.user,
            reports
        });
    }
    catch (e) {
        res.status(500).render('error', { error: e.toString(), user: req.session.user });
    }
});

router.post('/new', isAuthenticated, async (req, res) => {
    try {
        const { stationId, stationName, issueType, description } = req.body;
        await createReport(req.session.user.userId, stationId, stationName, issueType, description);
        res.redirect('/reports');
    }
    catch (e) {
        const reports = await getReportsByUser(req.session.user.userId);
        res.status(400).render('reports', { 
            title: 'Accessibility Reports',
            user: req.session.user,
            reports,
            error: e.toString()
        });
    }
});

router.get('/:id/edit', isAuthenticated, async (req, res) => {
    try {
        const report = await getReportById(req.params.id);
        if (!report)
            throw 'Report not found';
        res.render('editReport', { title: 'Edit Report', user: req.session.user, report });
    }
    catch (e) {
        res.status(404).render('error', { error: e.toString() });
    }
});

router.post('/:id/edit', isAuthenticated, async (req, res) => {
    try {
        const { stationName, issueType, description } = req.body;
        await updateReport(req.params.id, req.session.user.userId, { stationName, issueType, description });
        res.redirect('/reports');
    }
    catch (e) {
        res.status(400).render('editReport', { 
            title: 'Edit Report',
            user: req.session.user,
            error: e.toString()
        });
    }
});

router.post('/:id/delete', isAuthenticated, async (req, res) => {
    try {
        await deleteReport(req.params.id, req.session.user.userId);
        res.redirect('/reports');
    }
    catch (e) {
        res.status(400).render('error', { error: e.toString(), user: req.session.user });
    }
});

export default router;