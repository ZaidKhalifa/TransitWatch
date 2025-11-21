// tasks/seed.js
import fs from 'fs';
import fsPromises from 'fs/promises';
import { getGTFSData } from '../api/njtransit/bus/APICalls.js';
import AdmZip from 'adm-zip';
import { dbConnection, closeConnection } from '../config/mongoConnection.js';
import { stopsCollection, routesCollection } from '../config/mongoCollections.js';
import csv from 'csv-parser';

const GTFS_ZIP_PATH = './downloads/njt_bus_gtfs_data.zip';
const EXTRACT_PATH = './downloads/njt_bus_gtfs';

async function downloadAndUnzip() {
    console.log("Downloading GTFS Zip from NJ Transit...");
    
    try {
        const zipBuffer = await getGTFSData();
        
        await fsPromises.writeFile(GTFS_ZIP_PATH, zipBuffer);
        console.log("Download complete. Saved to", GTFS_ZIP_PATH);

        console.log("Extracting...");
        const zip = new AdmZip(GTFS_ZIP_PATH);
        zip.extractAllTo(EXTRACT_PATH, true);
        console.log("Extraction complete.");
        
    } catch (e) {
        console.error("Error during download/extract:", e);
        process.exit(1);
    }
}

const readCsv = (fileName) => {
    const results = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(`${EXTRACT_PATH}/${fileName}`)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (err) => reject(err));
    });
};

async function seed() {
    const db = await dbConnection();

    // 1. Load files
    console.log("Reading CSV files...");
    const [routesData, tripsData, stopTimesData, stopsData] = await Promise.all([
        readCsv('routes.txt'),
        readCsv('trips.txt'),
        readCsv('stop_times.txt'),
        readCsv('stops.txt')
    ]);

    // 2. Build Lookup Maps
    console.log("Building lookup maps...");
    
    // Map: internal_stop_id -> { name, publicCode }
    // We need this because stop_times.txt uses the internal ID, 
    // but we want to output the stop code as it is used publicly.
    const stopInfoMap = new Map();
    stopsData.forEach(s => {
        stopInfoMap.set(s.stop_id, { 
            name: s.stop_name, // This is the internal id
            code: s.stop_code // This is the public number (e.g. 20548)
        });
    });

    const routeNameMap = new Map();
    routesData.forEach(r => {
        routeNameMap.set(r.route_id, r.route_long_name || r.route_short_name);
    });

    // 3. Find Representative Trips by Headsign
    const bestTripsByHeadsign = new Map();
    const tripStopCounts = new Map(); 

    // Count stops per trip
    stopTimesData.forEach(st => {
        const count = tripStopCounts.get(st.trip_id) || 0;
        tripStopCounts.set(st.trip_id, count + 1);
    });

    //There might be different trips for same route sometimes, so for each direction name I take the longest trip to avoid any shortcut trips
    console.log("Selecting best trips per variant...");
    
    tripsData.forEach(t => {
        const rId = t.route_id;
        const headsign = t.trip_headsign || "Unknown";
        const stopCount = tripStopCounts.get(t.trip_id) || 0;
        const key = `${rId}|${headsign}`;
        const existing = bestTripsByHeadsign.get(key);
        
        if (!existing || stopCount > existing.numStops) {
            bestTripsByHeadsign.set(key, {
                tripId: t.trip_id,
                routeId: rId,
                directionId: t.direction_id || "0",
                headsign: headsign,
                numStops: stopCount
            });
        }
    });

    // 4. Initialize Route Objects
    const routeMap = {};
    routesData.forEach(r => {
        routeMap[r.route_id] = {
            transitSystem: "NJT_BUS",
            routeId: r.route_id,
            routeName: r.route_long_name || r.route_short_name,
            directions: [] 
        };
    });

    // 5. Process Stops & Directions
    const stopToRouteAggregator = new Map();
    stopTimesData.sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));
    
    // Efficient lookup for the chosen trips
    const tripMetadata = new Map();
    bestTripsByHeadsign.forEach(data => tripMetadata.set(data.tripId, data));

    console.log("Processing routes and stops...");

    stopTimesData.forEach(st => {
        const meta = tripMetadata.get(st.trip_id);
        if (!meta) return; 

        const stopInfo = stopInfoMap.get(st.stop_id);
        if (!stopInfo) return;

        // GENERATE ID: "NJTB_" + Public Code
        const finalStopId = `NJTB_${stopInfo.code}`;

        // A. Update ROUTES Collection
        const routeDoc = routeMap[meta.routeId];
        let dirDoc = routeDoc.directions.find(d => d.directionName === meta.headsign);
        
        if (!dirDoc) {
            dirDoc = { 
                directionId: meta.directionId, 
                directionName: meta.headsign, 
                stops: [] 
            };
            routeDoc.directions.push(dirDoc);
        }

        dirDoc.stops.push({
            stopId: finalStopId, // Uses NJTB_20548
            stopName: stopInfo.name,
            stopOrder: parseInt(st.stop_sequence)
        });

        // B. Update STOPS Collection (Aggregation)
        // I am using the internal ID for the Map key to ensure we aggregate correctly before converting to the final object
        if (!stopToRouteAggregator.has(st.stop_id)) {
            stopToRouteAggregator.set(st.stop_id, new Map());
        }
        
        const routesForThisStop = stopToRouteAggregator.get(st.stop_id);
        if (!routesForThisStop.has(meta.routeId)) {
            routesForThisStop.set(meta.routeId, {
                routeId: meta.routeId,
                routeName: routeNameMap.get(meta.routeId),
                directions: new Set()
            });
        }
        routesForThisStop.get(meta.routeId).directions.add(meta.headsign);
    });

    // 6. Insert ROUTES
    console.log("Inserting Routes...");
    const routesCol = await routesCollection();
    await routesCol.deleteMany({});
    await routesCol.insertMany(Object.values(routeMap));

    // 7. Insert STOPS
    console.log("Constructing Stops...");
    const finalStops = stopsData.map(s => {
        const routesMap = stopToRouteAggregator.get(s.stop_id);
        
        const routesArray = [];
        if (routesMap) {
            routesMap.forEach(r => {
                routesArray.push({
                    routeId: r.routeId,
                    routeName: r.routeName,
                    directions: Array.from(r.directions)
                });
            });
        }

        return {
            // SCHEME: NJTB_ + Public Code
            stopId: `NJTB_${s.stop_code}`, 
            stopName: s.stop_name,
            transitSystem: "NJTB_BUS",
            location: { 
                type: "Point", 
                coordinates: [parseFloat(s.stop_lon), parseFloat(s.stop_lat)] 
            },
            routes: routesArray
        };
    });
    
    console.log(`Inserting ${finalStops.length} Stops...`);
    const stopsCol = await stopsCollection();
    await stopsCol.deleteMany({});
    await stopsCol.insertMany(finalStops);
}

const main = async () => {
    const db = await dbConnection();
    await downloadAndUnzip();
    await seed();
    console.log("Seeding completed!");
    await closeConnection();
};

main().catch(console.error);