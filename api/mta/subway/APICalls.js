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


// const busRoutes = await getBusDirections("119");
// const busRoutes = await getStops("119", "Bayonne");
// const busRoutes = await getRouteTrips("20635", "119");
// const busRoutes = await getStopName("20635");
// console.log(busRoutes);


// const stations = await getStationList();
// console.log(stations.slice(0, 5));

// const schedule = await getTrainSchedule('NP');
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