import express from 'express';
import {
  createReport,
  getReportsByUser,
  getReportById,
  updateReport,
  deleteReport,
  //getReportsByStation,
  //voteReport
} from '../data/reports.js';
import { isAuthenticated } from '../middleware.js';
import { stopsCollection } from '../config/mongoCollections.js';

const router = express.Router();

const getStopsForForm = async () => {
    const stopsCol = await stopsCollection();
    const totalCount = await stopsCol.countDocuments({});
    console.log('Total stops in DB: ',totalCount);
    const hobokenDocs = await stopsCol.find({ stopName: { $regex: /hoboken/i } }).toArray();
    console.log('Hoboken docs from DB: ', hobokenDocs);
    const stops = await stopsCol.find({}).sort({ stopName: 1 }).toArray();
    const mapped = stops.map((s) => ({
        stopId: s.stopId,
        stopName: s.stopName,
        transitSystem: s.transitSystem
    }));
    const hobokenMatches = mapped.filter((s) => s.stopName.toLowerCase().includes('hoboken'));
    console.log('Total stopsOptions: ', mapped.length);
    console.log('Hoboken stopsOptions matches: ', hobokenMatches);
    return mapped;
};

const formatDateTime = (d) => {
    if(!d)
        return '';
    const date = new Date(d);
    return date.toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
};

const decorateReportsForView = (reports) => reports.map((r) => ({
    ...r,
    createdAtFormatted: formatDateTime(r.createdAt),
    updatedAtFormatted: formatDateTime(r.updatedAt),
    statusClass: r.status === 'active' ? 'status-active' : 'status-inactive'
}));

router.get('/', isAuthenticated, async (req, res) => {
    try {
        const username = req.session.user.userId;
        const [reportsRaw, stopsOptions] = await Promise.all([
            getReportsByUser(username),
            getStopsForForm()
        ]);
        const reports = decorateReportsForView(reportsRaw);

        res.render('reports', {
            title: 'Accessibility Reports',
            user: req.session.user,
            reports,
            stopsOptions
        });
    }
    catch (e) {
        res.status(500).render('error',
            { error: e.toString(),
                user: req.session.user
            });
    }
});


router.post('/new', isAuthenticated, async (req, res) => {
    try {
        const username = req.session.user.userId;
        const { stops, issueType, description, severity, status } = req.body;
        await createReport(username, stops, issueType, description, severity, status || 'active');
        res.redirect('/reports');
    }
    catch (e) {
        const username = req.session.user.userId;
        const [reportsRaw, stopsOptions] = await Promise.all([
            getReportsByUser(username),
            getStopsForForm()
        ]);
        const reports = decorateReportsForView(reportsRaw);
        
        res.status(400).render('reports', {
            title: 'Accessibility Reports',
            user: req.session.user,
            reports,
            stopsOptions,
            error: e.toString()
        });
    }
});


router.get('/:id/edit', isAuthenticated, async (req, res) => {
    try {
        const report = await getReportById(req.params.id);
        if(!report || report.username !== req.session.user.userId){
            throw new Error('Report not found or unauthorized');
        }
        const stopsOptions = await getStopsForForm();
        res.render('editReport', { title: 'Edit Report', user: req.session.user, report, stopsOptions });
    }
    catch (e) {
        res.status(404).render('error', { error: e.toString(), user: req.session.user });
    }
});


router.post('/:id/edit', isAuthenticated, async (req, res) => {
    try {
        const username = req.session.user.userId;
        const { stops, issueType, description, severity, status } = req.body;
        await updateReport(
            req.params.id,
            username,
            {
                stops,
                issueType,
                description,
                severity,
                status
            }
        );
        res.redirect('/reports');
    }
    catch (e) {
        res.status(400).render('error',
            { error: e.toString(),
                user: req.session.user
            });
    }
});

router.post('/:id/delete', isAuthenticated, async (req, res) => {
  try {
    await deleteReport(req.params.id, req.session.user.userId);
    res.redirect('/reports');
  } catch (e) {
    res.status(400).render('error', { error: e.toString(), user: req.session.user });
  }
});

export default router;
