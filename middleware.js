export const logging = (req, res, next) => {
    const timestamp = new Date().toUTCString();
    const method = req.method;
    const path = req.path;
    let authStatus = 'Non-Authenticated';
    
    if (req.session && req.session.user) {
        const role = req.session.user.role;
        authStatus = 'Authenticated';
    }
    
    console.log(`[${timestamp}]: ${method} ${path} (${authStatus})`);
    next();
};

export const isGuest = (req, res, next) => {
    if (req.session && req.session.user)
        return res.redirect('/dashboard');
    next();
};

export const isAuthenticated = (req, res, next) => {
    if (!req.session || !req.session.user)
        return res.redirect('/login');
    next();
};