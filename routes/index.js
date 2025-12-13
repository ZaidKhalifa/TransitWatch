import authRoutes from './auth_routes.js';

import * as middleware from '../middleware.js';
import apiRoutes from './api.js';
import addCommuteRoutes from './add_commute.js';
import reportsRoutes from './reports.js';

const constructorMethod = (app) => {
    app.use('/', middleware.logging);

    app.use((req, res, next) => {
        res.locals.user = req.session.user;
        next();
    });
  
    app.use('/login', middleware.isGuest);
    app.use('/register', middleware.isGuest);
    app.use('/signout', middleware.isAuthenticated);
    app.use('/dashboard', middleware.isAuthenticated);
    app.use('/api', middleware.isAuthenticated);
    app.use('/addCommute', middleware.isAuthenticated);
    app.use('/reports', middleware.isAuthenticated);
    
    app.use('/', authRoutes);
    app.use('/api', apiRoutes);
    app.use('/addCommute', addCommuteRoutes);
    app.use('/reports', reportsRoutes);

    app.use(/(.*)/, (req, res) => {
    return res.status(404).render('error', {
    title: '404 Not Found',
    error: 'Page not found'
    });
    });
};
export default constructorMethod;