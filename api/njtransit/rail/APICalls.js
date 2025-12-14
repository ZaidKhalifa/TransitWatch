import axios from 'axios';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import '../../../config.js';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory of this file for token storage
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_FILE = path.join(__dirname, '.njt_rail_tokens.json');

let APItoken = null;
let APItokenExpiry = null;
const RAIL_AUTH_URL = 'https://testraildata.njtransit.com/api/TrainData/getToken';
const RAIL_BASE_URL = 'https://testraildata.njtransit.com/api/TrainData';
const GTFS_AUTH_URL = 'https://testraildata.njtransit.com/api/GTFSRT/getToken';
const GTFS_BASE_URL = 'https://testraildata.njtransit.com/api/GTFSRT';

let GTFStoken = null;
let GTFStokenExpiry = null;

// TOKEN PERSISTENCE - Save/Load tokens to survive server restarts

function loadTokensFromFile() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      
      // Load Rail token if not expired
      if (data.railToken && data.railExpiry && Date.now() < data.railExpiry) {
        APItoken = data.railToken;
        APItokenExpiry = data.railExpiry;
        console.log('Loaded cached NJT Rail token (expires in', Math.round((APItokenExpiry - Date.now()) / 1000 / 60), 'min)');
      }
      
      // Load GTFS token if not expired
      if (data.gtfsToken && data.gtfsExpiry && Date.now() < data.gtfsExpiry) {
        GTFStoken = data.gtfsToken;
        GTFStokenExpiry = data.gtfsExpiry;
        console.log('Loaded cached NJT GTFS token (expires in', Math.round((GTFStokenExpiry - Date.now()) / 1000 / 60), 'min)');
      }
    }
  } catch (err) {
    console.warn('Could not load cached NJT tokens:', err.message);
  }
}

function saveTokensToFile() {
  try {
    const data = {
      railToken: APItoken,
      railExpiry: APItokenExpiry,
      gtfsToken: GTFStoken,
      gtfsExpiry: GTFStokenExpiry,
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
    console.log('Saved NJT tokens to cache file');
  } catch (err) {
    console.error('Could not save NJT tokens:', err.message);
  }
}

// Load tokens on module initialization
loadTokensFromFile();

// AUTHENTICATION

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
        console.log('NJT Rail authenticated (new token)');
        saveTokensToFile(); // Persist the new token
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
    console.log('NJT GTFSRT authenticated (new token)');
    saveTokensToFile(); // Persist the new token
  } else {
    throw new Error('NJT GTFSRT auth failed');
  }
}

async function getRailToken() {
    if (APItoken && Date.now() < APItokenExpiry) {
        return APItoken;
    }
    await authenticateRail();
    return APItoken;
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



//List all stations in JSON format.
export async function getStationList() {
  const formData = new FormData(); 
  const res = await railClient.post('/getStationList', formData);
  return res.data; 
}

// List train schedule for a given station in JSON format, data is much the same as DepartureVision
// with train stop list information. There is a limit on total schedule records, it starts with current
// time and gives 19 records for the selected station. This method includes the stops data for each
// train item.
export async function getTrainSchedule(stationCode) {
  const formData = new FormData();
  formData.append('station', stationCode); // ex) 'NP'
  const res = await railClient.post('/getTrainSchedule', formData);
  return res.data;
}

// Provides a list of the 27 hours of train schedule data for any one station or all stations if no station is
// entered
// Limited access to 5 times per day but only needed once per day after midnight - 12:30AM after
// would be better - to show the schedule for the 27 hour period from 12 midnight until 3am the next day. 
export async function getStationSchedule(stationCode = '', njtOnly = true) {
  const formData = new FormData();
  formData.append('station', stationCode); // if it is empty, all stations
  formData.append('NJTOnly', njtOnly ? 'true' : 'false');
  const res = await railClient.post('/getStationSchedule', formData);
  return res.data;
}
//in-memory cache(30s) for station schedule
const stationScheduleCache = new Map();
// key: stationCode, value: { ts: number, data: object }
export async function getTrainScheduleCached(stationCode, ttlMs = 30_000) {
  const now = Date.now();
  const cached = stationScheduleCache.get(stationCode);

  if (cached && (now - cached.ts) < ttlMs) {
    return cached.data;
  }

  const data = await getTrainSchedule(stationCode); // existing function
  stationScheduleCache.set(stationCode, { ts: now, data });
  return data;
}



// List train schedule for a given station in JSON format, data is much the same as
// DepartureVision, but without train stop list information. There is a limit on total schedule
// records, it starts with current time and gives 19 records for the selected station.
export async function getTrainSchedule19Rec(stationCode, lineCode = '') {
  const formData = new FormData();
  formData.append('station', stationCode);
  formData.append('line', lineCode); // if it is '', entire line
  const res = await railClient.post('/getTrainSchedule19Rec', formData);
  return res.data;
}


// List train stops in JSON format by train ID.
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
// result for getTrainSchedule
//same as getTrainSchedule19recs except it includes information about stops information that the trip will make.

// "STOPS": [
// {
// "STATION_2CHAR": "NY",
// "STATIONNAME": "New York Penn Station",
// "TIME": "30-May-2024 11:40:00 AM",
// "PICKUP": "",
// "DROPOFF": "",
// "DEPARTED": "NO",
// "STOP_STATUS": "OnTime",
// "DEP_TIME": "30-May-2024 11:40:00 AM",
// "TIME_UTC_FORMAT": "30-May-2024 03:40:00 PM",
// "STOP_LINES": []
// },
// {
// "STATION_2CHAR": "SE",
// "STATIONNAME": "Secaucus Upper Lvl",
// "TIME": "30-May-2024 11:50:56 AM",
// "PICKUP": "",
// "DROPOFF": "",
// "DEPARTED": "YES",
// "STOP_STATUS": "OnTime",
// "DEP_TIME": "30-May-2024 11:49:30 AM",
// "TIME_UTC_FORMAT": "30-May-2024 03:50:56 PM",
// "STOP_LINES": []
// },
// 22
// {
// "STATION_2CHAR": "NP",
// "STATIONNAME": "Newark Penn Station",
// "TIME": "30-May-2024 11:58:43 AM",
// "PICKUP": "",
// "DROPOFF": "",
// "DEPARTED": "NO",
// "STOP_STATUS": "OnTime",
// "DEP_TIME": "30-May-2024 12:00:00 PM",
// "TIME_UTC_FORMAT": "30-May-2024 03:58:43 PM",
// "STOP_LINES": []
// },


// result for getTrainSchedule19Rec
// {
// "STATION_2CHAR": "NP",
// "STATIONNAME": "Newark Penn",
// "STATIONMSGS":[...],
// "ITEMS": [{
// "SCHED_DEP_DATE": "30-May-2024 11:52:00 AM",
// "DESTINATION": "Newport News",
// "TRACK": "4",
// "LINE": "REGIONAL",
// "TRAIN_ID": "A125",
// "CONNECTING_TRAIN_ID": "",
// "STATUS": "in 0 Min",
// "SEC_LATE": "1299",
// "LAST_MODIFIED": "30-May-2024 12:12:44 PM","BACKCOLOR": "#FFFF00",
// "FORECOLOR": "black",
// "SHADOWCOLOR": "yellow",
// "GPSLATITUDE": "40.735059",
// "GPSLONGITUDE":
// "-74.163665","GPSTIME": "30-May-2024 12:12:14 PM",
// "STATION_POSITION": "1",
// "LINECODE": "AM",
// "LINEABBREVIATION": "AMTK",
// "INLINEMSG": "",
// "CAPACITY": [],
// "STOPS": null
// },
// ...]
// }]


//result for getTrainStopList
// Result #1:
// {
// "TRAIN_ID": "3240",
// "LINECODE": "NC",
// "BACKCOLOR": "#009CDB",
// "FORECOLOR": "white",
// "SHADOWCOLOR": "black",
// "DESTINATION": "Penn Station New York",
// "TRANSFERAT": "",
// "STOPS": [
// {
// "STATION_2CHAR": "LB",
// "STATIONNAME": "Long Branch",
// "TIME": "30-May-2024 10:52:30 AM",
// "PICKUP": "",
// "DROPOFF": "",
// "DEPARTED": "YES",
// "STOP_STATUS": "OnTime",
// "DEP_TIME": "30-May-2024 10:53:30 AM",
// "TIME_UTC_FORMAT": "30-May-2024 02:52:30 PM",
// "STOP_LINES": []
// },
// {
// "STATION_2CHAR": "LS",
// "STATIONNAME": "Little Silver",
// "TIME": "30-May-2024 11:00:07 AM",
// "PICKUP": "",
// "DROPOFF": "",
// "DEPARTED": "YES",
// "STOP_STATUS": "OnTime",
// "DEP_TIME": "30-May-2024 11:01:00 AM",
// "TIME_UTC_FORMAT": "30-May-2024 03:00:07 PM",
// "STOP_LINES": []
// },...]}

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