import axios from 'axios';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import '../../../config.js';


const MTA_SUBWAY_GTFS_STATIC_URL = 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip';
const MTA_GTFS_BASE_URL = process.env.MTA_GTFS_BASE_URL || 
    'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds';
const mtaStaticClient = axios.create({
    timeout: 20000,
    responseType: 'arraybuffer'
});
// ---- Static GTFS (zip) ----
export async function getStaticGTFSData() {
    try {
        const response = await mtaStaticClient.get(MTA_SUBWAY_GTFS_STATIC_URL);
        return response.data; //arraybuffer
    } catch (error) {
        console.error("Download failed:", error.message);
        throw error;
    }
}

/*
** GTFS Data
*/

const gtfsClient = axios.create({
    baseURL: MTA_GTFS_BASE_URL,
    timeout: 10000,
    responseType: 'arraybuffer' //ells axios to not try and parse JSON
});



const decodeFeed = (buffer) => {
    return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
        new Uint8Array(buffer)
    );
};

// group: 'ace' | 'bdfm' | 'nqrw' | '123' | '456' | '7' | 'l'
export async function getMtaSubwayFeed(group = 'ace') {
  const path = `/nyct%2Fgtfs-${group}`;

  try {
    const response = await gtfsClient.get(path);
    return decodeFeed(response.data); // FeedMessage 
  } catch (err) {
    console.error(`Failed to fetch MTA GTFS-RT for group=${group}:`, err.message);
    throw err;
  }
}
// FeedMessage -> { tripUpdates, vehicles, alerts }
export function splitRealtimeFeed(feed) {
  const tripUpdates = [];
  const vehicles = [];
  const alerts = [];

  if (!feed || !Array.isArray(feed.entity)) {
    return { tripUpdates, vehicles, alerts };
  }

  for (const entity of feed.entity) {
    if (entity.tripUpdate) {
      tripUpdates.push(entity.tripUpdate);
    }
    if (entity.vehicle) {
      vehicles.push(entity.vehicle);
    }
    if (entity.alert) {
      alerts.push(entity.alert);
    }
  }

  return { tripUpdates, vehicles, alerts };
}


export async function getMtaSubwayRealtime(group = 'ace') {
  const feed = await getMtaSubwayFeed(group);
  const { tripUpdates, vehicles, alerts } = splitRealtimeFeed(feed);

  return {
    tripUpdates,
    vehicles,
    alerts
  };
}

const SUBWAY_GROUPS = ['ace', 'bdfm', 'nqrw', '123', '456', '7', 'l'];
function extractArrivalsFromTripUpdates(tripUpdates, stopId, nowEpochSec = null) {
  const results = [];
  const now = nowEpochSec ?? Math.floor(Date.now() / 1000);

  for (const tu of tripUpdates) {
    const trip = tu.trip;
    if (!trip) continue;

    const tripId = trip.tripId;
    const routeId = trip.routeId;

    if (!Array.isArray(tu.stopTimeUpdate)) continue;

    for (const stu of tu.stopTimeUpdate) {
      if (!stu.stopId) continue;
      if (stu.stopId !== stopId) continue; // skip if it is not the given station

      const arrivalTime = stu.arrival?.time ?? null;
      const departureTime = stu.departure?.time ?? null;
      const when = arrivalTime ?? departureTime;

      if (!when) continue;

      // direction: last letter of stopId ('N' or 'S')
      const direction = stopId.slice(-1); 

      results.push({
        tripId,
        routeId,
        stopId,
        direction,              // 'N' or 'S'
        arrivalTimeEpoch: arrivalTime,     // sec based epoch
        departureTimeEpoch: departureTime, // sec based epoch (if there is none, null)
      });
    }
  }

  // sort by arrival time
  results.sort((a, b) => {
    const ta = a.arrivalTimeEpoch ?? a.departureTimeEpoch ?? Number.MAX_SAFE_INTEGER;
    const tb = b.arrivalTimeEpoch ?? b.departureTimeEpoch ?? Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });

  return results;
}

/**
 * Finds all upcoming subway arrivals for the given stopId
 * by checking every MTA GTFS-RT group (ace, bdfm, nqrw, 123, 456, 7, l)
 * and combining the results into a single list.
 *
 * @param {string} stopId - Example: 'R14N' (parent_station + direction)
 * @param {object} options
 *   - groups: Array of feed groups to check (default: all groups)
 *   - limit: Maximum number of arrivals to return (default: 10)
 */
export async function getMtaSubwayArrivalsForStop(stopId, options = {}) {
  // from options, get groups and limit 
  const groups = options.groups || SUBWAY_GROUPS;
  const limit = options.limit ?? 10;

  // 1. get realtime feed for each group
  const feeds = [];

  for (const g of groups) {
    try {
      const feed = await getMtaSubwayRealtime(g);
      feeds.push(feed);         // push if succeeded
    } catch (err) {
      console.error(`Failed to fetch realtime for group=${g}:`, err.message);
      // if failed, just skip
    }
  }
  let allArrivals = [];
  for (const feed of feeds) {
    if (!feed) continue;
    const { tripUpdates } = feed;
    const arrivals = extractArrivalsFromTripUpdates(tripUpdates, stopId);
    allArrivals = allArrivals.concat(arrivals);
  }
  allArrivals.sort((a, b) => {
  const ta = a.arrivalTimeEpoch ?? a.departureTimeEpoch ?? Number.MAX_SAFE_INTEGER;
  const tb = b.arrivalTimeEpoch ?? b.departureTimeEpoch ?? Number.MAX_SAFE_INTEGER;
  return ta - tb;
  });
  return allArrivals.slice(0, limit);



  }











// console.log(schedule.STATIONNAME, schedule.ITEMS.length);
// const gtfsdata = await getAlerts();
// console.log(gtfsdata.entity.map(entity => {
//   if (entity.alert) {
//     // We are now inside the "envelope"
//     const alertPayload = entity.alert;
    
//     // Alerts usually have headerText (the title) and descriptionText (the body)
//     // Note: translation[0] gets the English text usually
//     return {
//       id: entity.id,
//       title: alertPayload.headerText?.translation?.[0]?.text,
//       description: alertPayload.descriptionText?.translation?.[0]?.text
//     };
//   }
// }));

// const positions = await getVehiclePositions();

// console.log(positions.entity[0])

// const tripUpdates = await getTripUpdates();

// console.log(tripUpdates.entity[0])