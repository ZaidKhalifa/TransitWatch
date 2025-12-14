import * as middleware from '../middleware.js';
import authRoutes from './auth_routes.js';
import apiRoutes from './api.js';
import addCommuteRoutes from './add_commute.js';
import reportsRoutes from './reports.js';
import dashboardRoutes from './dashboard.js';

const constructorMethod = (app) => {
    app.use('/', middleware.logging);

  // Make user available to handlebars 
    app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
  });

  // Auth guards 
  app.use('/login', middleware.isGuest);
  app.use('/register', middleware.isGuest);

  app.use('/signout', middleware.isAuthenticated);
  app.use('/dashboard', middleware.isAuthenticated);
  app.use('/api', middleware.isAuthenticated);

  // commute route standardized
  app.use('/commutes', middleware.isAuthenticated);
    app.use('/reports', middleware.isAuthenticated);

  // Routes 
  app.use('/', authRoutes);
  app.use('/api', apiRoutes);
  app.use('/commutes', addCommuteRoutes);
    app.use('/reports', reportsRoutes);
    app.use('/dashboard', dashboardRoutes);

  // 404 handler
  app.use((req, res) => {
    return res.status(404).render('error', {
      title: '404 Not Found',
      error: 'Page not found'
    });
  });
};

export default constructorMethod;
