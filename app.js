import express from 'express';
import exphbs from 'express-handlebars';
import session from 'express-session';
import configRoutes from './routes/index.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ------------------
   Handlebars setup
------------------ */
const hbs = exphbs.create({
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials')
});

/* Helpers (safe & minimal) */
hbs.handlebars.registerHelper('json', ctx =>
  JSON.stringify(ctx || [])
);

hbs.handlebars.registerHelper('inc', v =>
  parseInt(v) + 1
);

hbs.handlebars.registerHelper('ifEquals', function (a, b, options) {
  return a === b ? options.fn(this) : options.inverse(this);
});

app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

/* ------------------
   Middleware
------------------ */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

/* ------------------
   Session
------------------ */
app.use(
  session({
    name: 'TransitWatchSession',
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
      httpOnly: true,
      secure: false // set true only if HTTPS
    }
  })
);

/* ------------------
   Routes
------------------ */
configRoutes(app);

/* ------------------
   Server
------------------ */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
