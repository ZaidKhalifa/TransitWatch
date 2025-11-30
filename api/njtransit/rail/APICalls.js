import axios from 'axios';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import '../../../config.js';
import FormData from 'form-data';

let APItoken = null;
let APItokenExpiry = null;
const RAIL_AUTH_URL = 'https://testraildata.njtransit.com/api/TrainData/getToken';
const RAIL_BASE_URL = 'https://testraildata.njtransit.com/api/TrainData';
const GTFS_AUTH_URL = 'https://testraildata.njtransit.com/api/GTFSRT/getToken';
const GTFS_BASE_URL = 'https://testraildata.njtransit.com/api/GTFSRT';

let GTFStoken = null;
let GTFStokenExpiry = null;

async function authenticateRail() {
    const formData = new FormData();
    formData.append('username', process.env.NJT_API_USERNAME);
    formData.append('password', process.env.NJT_API_PASSWORD);

    const response = await axios.post(
        RAIL_AUTH_URL,
        formData
    );

    if (response.data.Authenticated === 'True') {
        APItoken = response.data.UserToken;
        APItokenExpiry = Date.now() + (23 * 60 * 60 * 1000);
        console.log('NJT authenticated');
    } else {
        throw new Error('NJT auth failed');
    }
}
async function authenticateGTFS() {
  const formData = new FormData();
  formData.append('username', process.env.NJT_API_USERNAME);
  formData.append('password', process.env.NJT_API_PASSWORD);

  const response = await axios.post(GTFS_AUTH_URL, formData);

  if (response.data.Authenticated === 'True') {
    GTFStoken = response.data.UserToken;
    GTFStokenExpiry = Date.now() + (23 * 60 * 60 * 1000);
    console.log('NJT GTFSRT authenticated');
  } else {
    throw new Error('NJT GTFSRT auth failed');
  }
}
async function getRailToken() {
    if (APItoken && Date.now()<APItokenExpiry){
        return APItoken
    }
    await authenticateRail();
    return APItoken
}
async function getGTFSToken() {
  if (GTFStoken && Date.now() < GTFStokenExpiry) {
    return GTFStoken;
  }
  await authenticateGTFS();
  return GTFStoken;
}



// Create axios client
const railClient = axios.create({
    baseURL: RAIL_BASE_URL,
    timeout: 10000
});

// Auto-add token to every request
railClient.interceptors.request.use(async (config) => {
    const authToken = await getRailToken();
    if (!config.data) config.data = new FormData();
    config.data.append('token', authToken);
    return config;
});



//list of all stations
export async function getStationList() {
  const formData = new FormData(); 
  const res = await railClient.post('/getStationList', formData);
  return res.data; 
}


//for a given station, 19 arrival schedules(message included; upcoming 19 trips)
export async function getTrainSchedule(stationCode) {
  const formData = new FormData();
  formData.append('station', stationCode); // ex) 'NP'
  const res = await railClient.post('/getTrainSchedule', formData);
  return res.data;
}
//for a given station, 27 hours worth of arrival schedules(upcoming trips for the next 27 hours)
export async function getStationSchedule(stationCode = '', njtOnly = true) {
  const formData = new FormData();
  formData.append('station', stationCode); // if it is empty, all stations
  formData.append('NJTOnly', njtOnly ? 'true' : 'false');
  const res = await railClient.post('/getStationSchedule', formData);
  return res.data;
}
//for a given station, 19 arrival schedules(message included; upcoming 19 trips)
//without stops information
export async function getTrainSchedule19Rec(stationCode, lineCode = '') {
  const formData = new FormData();
  formData.append('station', stationCode);
  formData.append('line', lineCode); // if it is '', entire line
  const res = await railClient.post('/getTrainSchedule19Rec', formData);
  return res.data;
}
//for a given train, the entire list of stations
export async function getTrainStopList(trainId) {
  const formData = new FormData();
  formData.append('train', trainId); // ex) '3240'
  const res = await railClient.post('/getTrainStopList', formData);
  return res.data;
}


/*
** GTFS Data
*/

const gtfsClient = axios.create({
    baseURL: GTFS_BASE_URL,
    timeout: 10000,
    responseType: 'arraybuffer' //ells axios to not try and parse JSON
});

gtfsClient.interceptors.request.use(async (config) => {
    const authToken = await getGTFSToken();
    if (!config.data) config.data = new FormData();
    config.data.append('token', authToken);
    return config;
});

const decodeFeed = (buffer) => {
    return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
        new Uint8Array(buffer)
    );
};

export async function getGTFSData() {
    try {
        const response = await gtfsClient.post('/getGTFS');
        return response.data; 
    } catch (error) {
        console.error("Download failed:", error.message);
        throw error;
    }
}

export async function getTripUpdates() {
    const response = await gtfsClient.post('/getTripUpdates');
    return decodeFeed(response.data);
}

export async function getVehiclePositions() {
    const response = await gtfsClient.post('/getVehiclePositions');
    return decodeFeed(response.data);
}

export async function getAlerts() {
    const response = await gtfsClient.post('/getAlerts');
    return decodeFeed(response.data);
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