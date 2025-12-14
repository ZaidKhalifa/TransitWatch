// tasks/seed.js
import fs from 'fs';
import fsPromises from 'fs/promises';
import { getAllMtaBusStaticZips } from '../api/mta/bus/APICalls.js';
import AdmZip from 'adm-zip';
import { dbConnection, closeConnection } from '../config/mongoConnection.js';
import { stopsCollection, routesCollection } from '../config/mongoCollections.js';
import csv from 'csv-parser';
import path from 'path';

const GTFS_ZIP_BASE_PATH = './downloads/MTA_BUS_gtfs_data_zips';
const EXTRACT_BASE_PATH = './downloads/MTA_BUS_gtfs';
await fsPromises.mkdir(GTFS_ZIP_BASE_PATH, { recursive: true });
await fsPromises.mkdir(EXTRACT_BASE_PATH, { recursive: true });

const DATASETS = ['bx', 'b', 'm', 'q', 'si', 'busco'];
function toSiriLineRef(r) {
  const agency = (r.agency_id || 'MTA NYCT').trim(); 
  return `${agency}_${r.route_id}`;                  // "MTA NYCT_B63"
}
async function downloadAndUnzipAll() {
    console.log("Downloading all GTFS Zips from MTA BUS...");
    const zipBuffers = await getAllMtaBusStaticZips();
    for (const key of DATASETS) {
        const zipBuffer = zipBuffers[key];
        if (!zipBuffer) {
        console.warn(`[MTA_BUS] no buffer for key=${key}, skipping`);
        continue;
        }
        const GTFS_ZIP_PATH = path.join(GTFS_ZIP_BASE_PATH, `${key}.zip`);
        const EXTRACT_PATH  = path.join(EXTRACT_BASE_PATH, key);
        await fsPromises.writeFile(GTFS_ZIP_PATH, zipBuffer);
        console.log(`Download complete for ${key}. Saved to`, GTFS_ZIP_PATH);

        console.log("Extracting...");
        const zip = new AdmZip(GTFS_ZIP_PATH);
        zip.extractAllTo(EXTRACT_PATH, true);
        console.log(`Extraction for ${key}.zip complete.`);
    }     
}

const readCsvFromFolder = (folderPath, fileName) => {
    const results = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(`${folderPath}/${fileName}`)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (err) => reject(err));
    });
};
//read routes.txt from all 6 folders and combine them into one array.
async function readCsvAll(fileName) {
  const allRows = [];

  for (const key of DATASETS) {
    const folderPath = path.join(EXTRACT_BASE_PATH, key);

    const rows = await readCsvFromFolder(folderPath, fileName);
    // allRows.push(...rows);
    for (const row of rows) {
      allRows.push(row);
    }
    console.log(`[MTA_BUS] Loaded ${rows.length} rows from ${key}/${fileName}`);
  }
  console.log(`[MTA_BUS] Total ${fileName} rows: ${allRows.length}`);
  return allRows;
}
async function seed() {
    const db = await dbConnection();

    // 1. Load files
    console.log("Reading CSV files...");
    const [routesData, tripsData, stopTimesData, stopsData] = await Promise.all([
        readCsvAll('routes.txt'),
        readCsvAll('trips.txt'),
        readCsvAll('stop_times.txt'),
        readCsvAll('stops.txt')
    ]);

    // 2. Build Lookup Maps
    console.log("Building lookup maps...");
    
    // unlike njt, stop_times.txt does not use the internal ID
    const stopInfoMap = new Map();
    stopsData.forEach(s => {
        stopInfoMap.set(s.stop_id, { 
            name: s.stop_name 
        });
    });

    //short_name prioritized
    const routeNameMap = new Map();
    routesData.forEach(r => {
        routeNameMap.set(r.route_id, r.route_short_name || r.route_long_name);
    });
    const tripToRouteDir = new Map();
    tripsData.forEach(t=>{
        tripToRouteDir.set(t.trip_id, {
            routeId: t.route_id,
            headsign: t.trip_headsign||"Unknown"
        })
    })
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
    //short_name prioritized
    // { directionId, directionName, stops: [ { stopId, stopName, stopOrder } ] }
    const routeMap = {};
    routesData.forEach(r => {
        routeMap[r.route_id] = {
            transitSystem: "MTA_BUS",
            routeId: toSiriLineRef(r),
            routeName: r.route_short_name || r.route_long_name,
            directions: [] 
        };
    });

    // 5. Process Stops & Directions
    const stopToRouteAggregator = new Map();
    // stopTimesData.sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));
    
    // Efficient lookup for the chosen trips
    const tripMetadata = new Map();
    bestTripsByHeadsign.forEach(data => tripMetadata.set(data.tripId, data));

    console.log("Processing routes and stops...");

    stopTimesData.forEach(st => {
        const meta = tripMetadata.get(st.trip_id);
        if (!meta) return; 

        const stopInfo = stopInfoMap.get(st.stop_id);
        if (!stopInfo) return;

        // GENERATE ID: "MTA_BUS_" + stop_id
        const finalStopId = `MTA_BUS_${st.stop_id}`;

        // A. Update ROUTES Collection
        const routeDoc = routeMap[meta.routeId];
        if (!routeDoc) {
        // in case the route_id in trip is not in routes.txt
            console.warn(
            'route_id',
            meta.routeId,
            'not found in routes.txt, skipping'
        );
        return;
        }

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
            stopId: finalStopId, 
            stopName: stopInfo.name,
            stopOrder: parseInt(st.stop_sequence)
        });
    })

    const siriLineRefMap = new Map();
    routesData.forEach(r => {
        siriLineRefMap.set(r.route_id, toSiriLineRef(r));
    });
    stopTimesData.forEach(st => {
        const t = tripToRouteDir.get(st.trip_id);
        // B. Update STOPS Collection (Aggregation)
        const siriRouteId = siriLineRefMap.get(t.routeId) || t.routeId;
        if (!stopToRouteAggregator.has(st.stop_id)) {
            stopToRouteAggregator.set(st.stop_id, new Map());
        }
        
        const routesForThisStop = stopToRouteAggregator.get(st.stop_id);
        if (!routesForThisStop.has(siriRouteId)) {
            routesForThisStop.set(siriRouteId, {
                routeId: siriRouteId,
                routeName: routeNameMap.get(t.routeId),
                directions: new Set()
            });
        }
        routesForThisStop.get(siriRouteId).directions.add(t.headsign);
    });

    // 6. Insert ROUTES
    console.log("Inserting Routes...");
    const routesCol = await routesCollection();
    await routesCol.deleteMany({transitSystem: "MTA_BUS"});
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
            // SCHEME: MTA_BUS + st_id
            stopId: `MTA_BUS_${s.stop_id}`, 
            stopName: s.stop_name,
            transitSystem: "MTA_BUS",
            location: { 
                type: "Point", 
                coordinates: [parseFloat(s.stop_lon), parseFloat(s.stop_lat)] 
            },
            routes: routesArray
        };
    });
    
    console.log(`Inserting ${finalStops.length} Stops...`);
    const stopsCol = await stopsCollection();
    await stopsCol.deleteMany({transitSystem: "MTA_BUS"});
    await stopsCol.insertMany(finalStops);
}

const main = async () => {
    const db = await dbConnection();
    await downloadAndUnzipAll();
    await seed();
    console.log("Seeding completed!");
    await closeConnection();
};

main().catch(console.error);