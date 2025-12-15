# TransitWatch

A multi-modal transit tracking application for the New York/New Jersey metropolitan area. Track NJ Transit, MTA Subway, MTA Bus, and PATH in real-time, save multi-leg commutes, and report accessibility issues.

## Team Members

- **Anugya Sharma**
- **Gwanhye Jeong**
- **Praneeth Sai Ummadisetty**
- **Zaid Khalifa**
- **Zeyan Liu**

---

## Quick Start

### Prerequisites

- Node.js
- MongoDB
- API Keys (see Environment Setup)

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Fill in your credentials in `.env`:
   ```
   NJT_API_USERNAME=your_username_here
   NJT_API_PASSWORD=your_password_here
   MTA_BUS_KEY = YOURKEY
   ```

### 3. Start MongoDB

### 4. Seed the Database

```bash
npm run seed
```

This downloads transit data from all agencies and creates test users. **This takes a few minutes.**

Alternatively, seed components separately:
```bash
npm run seed-transit   # Transit data only (~2-3 min)
npm run seed-users     # Test users only (~10 sec)
```

### 5. Start the Server

```bash
npm start
```

Visit: **http://localhost:3000**

---

## Test Accounts

| Username | Password |
|----------|----------|
| AliceJ | Test@123 |
| BobSmith | Pass#456 |
| CarolW | Secure!789 |
| DavidB | Hello@World1 |
| EmmaD | Transit#2024 |

---

## Features

### Core Features

#### 1. Multi-Leg Route Creation and Management
Users can create custom commute routes with multiple legs across different transit systems (NJT Bus, NJT Rail, MTA Subway, MTA Bus). Routes are saved with names for easy identification and can be edited or deleted.

**How to use:** Click "New Commute" -> Select transit system -> Choose origin/destination -> Add more legs if needed -> Save

#### 2. Connection Time Calculator
Automatically calculates total journey time across multiple legs. Shows when you need to leave based on transfer times. Updates in real-time as schedules change.

**How to use:** View any saved commute on the Dashboard or Details page. The system calculates connection times automatically based on live arrival data.

#### 3. Station Accessibility Issue Reporting
Report problems at stations: broken elevators, escalators, bathrooms, turnstiles, and other issues. Each report includes severity rating and description.

**How to use:** Go to "Reports" -> Fill out the form with affected stops, issue type, severity (1-10), and description.

#### 4. Report Voting and Verification System
Upvote or downvote reports to indicate accuracy. Users only have one vote per report. Reports with negative scores are de-emphasized.

**How to use:** On the Commute Details page, click 👍 or 👎 on any report. Click again to remove your vote.

#### 5. Route Detail View
Comprehensive page showing all legs of a saved route with live status, relevant accessibility reports filtered by route stations, extra options like selecting the trip for each leg, and view the number of possible routes (e.g. 87, 126) that can be taken per leg.

**How to use:** Click "More Details" on any commute card on the Dashboard.

#### 6. Personal Report History
View all reports you've submitted with timestamps and vote counts. Edit or delete your own reports.

**How to use:** Go to "Reports" to see your submitted reports with edit/delete options.

#### 7. Live Status Dashboard
Real-time view of all saved commutes showing next departure times for each leg. Automatically updates every 30 seconds or when any paremeter is changed with fresh data from transit APIs.

**How to use:** Go to "Dashboard" after logging in. Your saved commutes show live arrival times.

#### 8. Route Feasibility Indicator
Visual score (1-10) for each route based on active accessibility issues at stops. Green (7-10) = Good, Yellow (4-6) = Moderate, Red (1-3) = Poor.

**How to use:** Check the score displayed on each commute card and details page. Lower scores indicate more accessibility issues.

### Extra Features

#### 1. Walking Distance Validation
When creating multi-leg routes, the system calculates distance between connection points using GPS coordinates and warns if transfers exceed reasonable walking distance.

**Implementation:** Uses the GPS coordinates for each station from GTFS data to calculate distances between consecutive legs.

#### 2. Walking Time Integration
Customize walking time between legs. The system factors walking time into connection calculations and adjusts subsequent leg recommendations accordingly.

The user is given the option to let it auto-calculate the walking time or add a custom walking time per transfer while creating or editing a commute, or temporarily (not persistent) change the walking time on the dashboard.

**How to use:** On Dashboard or Details page, click the edit button on any walking time between legs. Change the value and save.

---

## Project Structure

```
TransitWatch/
├── api/                    # Transit API integrations
│   ├── mta/                # MTA Subway & Bus
│   ├── njtransit/          # NJ Transit Bus & Rail
│   └── path/               # PATH
├── config/                 # Database configuration
├── data/                   # Data access layer
├── helpers/                # Transit helpers & validators
├── public/                 # Static assets
│   ├── css/
│   └── js/
├── routes/                 # Express routes
├── tasks/                  # Seed scripts
├── views/                  # Handlebars templates
│   ├── layouts/
│   └── partials/
├── app.js                  # Express app setup
└── package.json
```

---

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server |
| `npm run seed` | Seed everything (transit + users) |
| `npm run seed-transit` | Seed transit data only |
| `npm run seed-users` | Seed test users only |

---

## Database Collections

- **users** - User accounts with saved commutes
- **stops** - Transit stops from all agencies
- **routes** - Route definitions with directions
- **reports** - Accessibility issue reports

---

## Notes

- Transit data is fetched from official GTFS feeds and real-time APIs
- API rate limits apply - the system caches data where possible
- NJ Transit tokens are persisted to survive server restarts

---

## Known Limitations

- PATH real-time data not yet implemented (static schedules only). The API provided by PATH does not have to functionality to track specific trips.
- Historical delay analysis feature not implemented