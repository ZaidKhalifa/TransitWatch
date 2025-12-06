import { Router } from 'express';
const router = Router();
import { register, login } from '../data/users.js';
import * as helpers from '../helpers/userHelpers.js';
import { StatusError } from '../helpers/helpers.js';

router.route('/').get(async (req, res) => {
    const isLoggedIn = req.session && req.session.user;
    
    res.render('home', {
        title: 'Home',
        isLoggedIn
    });
});

router
    .route('/register')
    .get(async (req, res) => {
        res.render('register', {
        title: 'Register'
        });
    })
    .post(async (req, res) => {
        let { firstName, lastName, email, userId, password, dob } = req.body;
    
        if (firstName) firstName = firstName.trim();
        if (lastName) lastName = lastName.trim();
        if (userId) userId = userId.trim();
        if (email) email = email.trim();
        if (dob) dob = dob.trim();
        let errors = [];

        if (!firstName) errors.push('firstName is required');
        if (!lastName) errors.push('lastName is required');
        if (!userId) errors.push('userId is required');
        if (!password) errors.push('password is required');
        if (!email) errors.push('email is required');
        if (!dob) errors.push('Date of birth is required');

        if (errors.length > 0)
            return res.status(400).render('register', {
                title: 'Register',
                error: errors.join(', ')
            });

        try {
            firstName = helpers.validateName(firstName, 'firstName');
        } catch (e) {
            errors.push(e.message || e);
        }

        try {
            lastName = helpers.validateName(lastName, 'lastName');
        } catch (e) {
            errors.push(e.message || e);
        }

        try {
            userId = helpers.validateUserId(userId);
        } catch (e) {
            errors.push(e.message || e);
        }

        try {
            password = helpers.validatePassword(password);
        } catch (e) {
            errors.push(e.message || e);
        }

        try {
            helpers.validateEmail(email);
        } catch (e) {
            errors.push(e.message || e);
        }

        try {
            helpers.validateDob(dob);
        } catch (e) {
            errors.push(e.message || e);
        }

        if (errors.length > 0)
            return res.status(400).render('register', {
                title: 'Register',
                error: errors.join(', '),
                backgroundColor: '#000',
                fontColor: '#FFF'
            });

        try {
            const result = await register(firstName, lastName, email, userId, dob, password);
        
            if (result.registrationCompleted)
                return res.redirect('/login');
            else 
                return res.status(500).render('register', {
                    title: 'Register',
                    error: 'Internal Server Error'
                });
        } catch (e) {
            return res.status(e.status || 500).render('register', {
                title: 'Register',
                error: e.message || 'Registration failed',
                firstName,
                lastName,
                userId,
                email,
                dob
            });
        }
    });

router
    .route('/login')
    .get(async (req, res) => {
        res.render('login', {
        title: 'Login'
        });
    })
    .post(async (req, res) => {
        let { userId, password } = req.body;

        if (userId) userId = userId.trim();
        if (password) password = password.trim();

        const errors = [];

        if (!userId) errors.push('userId is required');
        if (!password) errors.push('password is required');

        if (errors.length > 0)
            return res.status(400).render('login', {
                title: 'Login',
                error: errors.join(', ')
            });

        try {
            userId = helpers.validateUserId(userId);
        } catch (e) {
            errors.push(e.message || e);
        }

        try {
            password = helpers.validatePassword(password);
        } catch (e) {
            errors.push(e.message || e);
        }

        if (errors.length > 0) {
        return res.status(400).render('login', {
            title: 'Login',
            error: errors.join(', ')
        });
        }

        try {
            const user = await login(userId, password);
            
            req.session.user = {
                firstName: user.firstName,
                lastName: user.lastName,
                userId: user.userId,
                email: user.email,
                preferences: user.preferences,
                signupDate: user.signupDate,
                lastLogin: user.lastLogin
            };

            return res.redirect('/dashboard');
        } catch (e) {
            return res.status(e.status || 500).render('login', {
                title: 'Login',
                error: e.message || 'Login failed',
                userId
            });
        }
    });

router.route('/signout').get(async (req, res) => {
    req.session.destroy();
    res.render('signout', {
        title: 'Signed Out',
    });
});

export default router;