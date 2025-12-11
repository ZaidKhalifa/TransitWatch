import axios from 'axios';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import '../../../config.js';
const BUS_BASE_URL = 'https://bustime.mta.info/api';

// stopId from MTA Bus Time matches GTFS stop_id (same number).
// Example: "MTA_307582" → GTFS stop_id "307582".
// Only difference is the "MTA_" prefix.

// routeId from Bus Time is the same as GTFS route_id.
// Example: "MTA NYCT_B63" matches GTFS routes.txt exactly.

// tripId in Bus Time (DatedVehicleJourneyRef) is NOT the same as GTFS trip_id.
// It is an internal real-time ID only used for live predictions.
// Good enough for our project because we only need real-time info.

// MTA_BUS_KEY required for getting GTFS data and siri API data
export const MTA_BUS_GTFS_STATIC_FEEDS = {
  bx: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_bx.zip',     // Bronx
  b: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_b.zip',       // Brooklyn
  m: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_m.zip',       // Manhattan (M100 제외)
  q: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_q.zip',       // Queens
  si: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_si.zip',     // Staten Island
  busco: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_busco.zip'// MTA Bus Company
};

const mtaStaticClient = axios.create({
    timeout: 20000,
    responseType: 'arraybuffer'
});
/**
 * get GTFS zip for single key(bx, b, m, q, si, busco)
 * @param {string} key  - 'bx' | 'b' | 'm' | 'q' | 'si' | 'busco'
 * @returns {Promise<ArrayBuffer>}
 */
// ---- Static GTFS (zip) ----
export async function getStaticGTFSData(key) {
    const url = MTA_BUS_GTFS_STATIC_FEEDS[key];
    if (!url) {
        throw new Error(`Unknown MTA Bus GTFS key: ${key}`);
    }
    try {
        console.log(`[MTA_BUS] Downloading static GTFS for ${key} from ${url}`);
        const response = await mtaStaticClient.get(url);
        return response.data; //arraybuffer
    } catch (error) {
        console.error("Download failed for ${key}:", error.message);
        throw error;
    }
}
export async function getAllMtaBusStaticZips() {
  const entries = Object.entries(MTA_BUS_GTFS_STATIC_FEEDS);

  const results = {};
  for (const [key, url] of entries) {
    try {
      console.log(`[MTA_BUS] Downloading GTFS for ${key} from ${url}`);
      const response = await mtaStaticClient.get(url);
      results[key] = response.data; // arraybuffer
    } catch (err) {
      console.error(`[MTA_BUS] Failed to download GTFS for ${key}:`, err.message);
      throw err;
    }
  }
  return results; // { bx: ArrayBuffer, b: ArrayBuffer, ... }
}

// call SIRI StopMonitoring for one stop
const busClient = axios.create({
  baseURL: BUS_BASE_URL,
  timeout: 10000
});


// @param {string} stopId  e.g. 'MTA_305408'
// @param {string|null} routeId e.g. 'MTA NYCT_B63' or null for all routes at this stop
export async function callStopMonitoring(stopId, routeId = null) {
  const params = {
    key: process.env.MTA_BUS_KEY,
    MonitoringRef: stopId
  };
  if (routeId) {
    params.LineRef = routeId;
  }

  const res = await busClient.get('/siri/stop-monitoring.json', { params });
  return res.data;
}

// get arrivals at a stop in a simple array.
//  Input:
//    stopId: 'MTA_305408' 
//    routeId: 'MTA NYCT_B63' or null (all routes)

//  Output:
//  [
//    {
//      routeId: 'MTA NYCT_B63',
//      tripId: '20241210_...something',   
//      expectedArrivalTime: '2025-12-10T17:32:00-05:00'
//    },
//    ...
//  ]

export async function getArrivalsForBusStop(stopId, routeId = null) {
    const raw = await callStopMonitoring(stopId, routeId);
    // Navigate down to the arrival list inside the SIRI structure
    const delivery =raw?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0];
    
    // MonitoredStopVisit[] = Each item is “one incoming bus”
    const visits = delivery?.MonitoredStopVisit || [];

    // Convert SIRI's complex structure into our simple format
    return visits.map((v) => {
        const mvj = v.MonitoredVehicleJourney || {};        // bus-level data
        const call = mvj.MonitoredCall || {};               // arrival info
        const framed = mvj.FramedVehicleJourneyRef || {};   // contains tripId

        return {
            routeId: mvj.LineRef || null,                          // bus route
            tripId: framed.DatedVehicleJourneyRef || null,         // unique trip ID
            arrivalTime:
                call.ExpectedArrivalTime || call.AimedArrivalTime || null // arrival
        };
    });
}

// async function test() {
//   try {
//     const stopId = "MTA_307582";   
//     const routeId = null;          

//     const arrivals = await getArrivalsForBusStop(stopId, routeId);

//     console.log("=== Arrivals for stop", stopId, "===");
//     console.log(arrivals);
//   } catch (err) {
//     console.error("Test failed:", err);
//   }
// }

// test();
// === Arrivals for stop MTA_307582 ===
// [
//   {
//     routeId: 'MTA NYCT_B8',
//     tripId: 'MTA NYCT_JG_D5-Weekday-SDon-119900_B8_148',
//     arrivalTime: '2025-12-10T20:23:04.659-05:00'
//   },
//   {
//     routeId: 'MTA NYCT_B8',
//     tripId: 'MTA NYCT_JG_D5-Weekday-SDon-127400_B8_144',
//     arrivalTime: '2025-12-10T21:14:00.000-05:00'
//   }
// ]
