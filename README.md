# TransitWatch

**CS 546 Web Programming I - Group Project**

TransitWatch is a unified multi-modal transit tracking application for NYC and NJ commuters, currently aggregating real-time and static data for NJ Transit buses with plans for PATH/MTA integration.

## Features Implemented (or in progress)
* **Backend Architecture**: Node.js/Express server with MongoDB.
* **Data Seeding (ETL)**: Custom pipeline downloads and parses official NJT GTFS Static CSVs to populate `stops` and `routes`.
* **Real-Time Client**: Consumes NJT GTFS-RT (Protobuf) for live vehicle positions and trip updates.
* **Database**: Optimized geospatial schemas for efficient location querying.

## Tech Stack
* **Core**: Node.js, Express, MongoDB
* **Libraries**: `gtfs-realtime-bindings`, `csv-parser`, `adm-zip`, `axios`

## Installation & Setup

### 1. Installation
```bash
git clone https://github.com/ZaidKhalifa/TransitWatch.git
cd TransitWatch
npm install
```

### 2. Configuration
Rename the provided `.env.example` to `.env` and update your credentials:

```ini
PORT=3000
MONGODB_URI=mongodb://localhost:27017/TransitWatch_db
NJT_API_USERNAME=your_username
NJT_API_PASSWORD=your_password
MTA_BUS_KEY = YOURKEY
```

### 3. Seed Database
Populate the local database with static routes and stops (downloads ~20MB of data).

```bash
npm seed
```

### 4. Start Server
```bash
npm start
```

## Team
Anugya Sharma, Gwanghye Jeong, Praneeth Sai Ummadisetty, Zaid Khalifa, Zeyan Liu