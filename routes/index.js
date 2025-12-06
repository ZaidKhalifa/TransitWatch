import authRoutes from './auth_routes.js';

import * as middleware from '../middleware.js';

const constructorMethod = (app) => {
    app.use('/', middleware.logging);
  
    app.use('/login', middleware.login);
    app.use('/register', middleware.register);
    app.use('/signout', middleware.signout);
    
    app.use('/', authRoutes);

    app.use(/(.*)/, (req, res) => {
    return res.status(404).render('error', {
    title: '404 Not Found',
    error: 'Page not found'
    });
    });
};
export default constructorMethod;