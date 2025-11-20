import axios from 'axios';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import '../../../config.js';

let APItoken = null;
let APItokenExpiry = null;

let GTFStoken = null;
let GTFStokenExpiry = null;

async function authenticate() {
    const formData = new FormData();
    formData.append('username', process.env.NJT_API_USERNAME);
    formData.append('password', process.env.NJT_API_PASSWORD);

    const response = await axios.post(
        'https://pcsdata.njtransit.com/api/BUSDV2/authenticateUser',
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

    const response = await axios.post(
        'https://pcsdata.njtransit.com/api/GTFS/authenticateUser',
        formData
    );

    if (response.data.Authenticated === 'True') {
        GTFStoken = response.data.UserToken;
        GTFStokenExpiry = Date.now() + (23 * 60 * 60 * 1000);
        console.log('NJT authenticated');
    } else {
        throw new Error('NJT auth failed');
    }
}

async function getAPIToken() {
    if (APItoken && Date.now() < APItokenExpiry) {
        return APItoken;
    }
    await authenticate();
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
const client = axios.create({
    baseURL: 'https://pcsdata.njtransit.com/api/BUSDV2',
    timeout: 10000
});

// Auto-add token to every request
client.interceptors.request.use(async (config) => {
    const authToken = await getAPIToken();
    if (!config.data) config.data = new FormData();
    config.data.append('token', authToken);
    return config;
});


export async function getLocations() {
    const formData = new FormData();
    formData.append('mode', 'BUS');
    return (await client.post('/getLocations', formData)).data;
}

export async function getBusRoutes() {
    const formData = new FormData();
    formData.append('mode', 'BUS');
    return (await client.post('/getBusRoutes', formData)).data;
}

export async function getBusDirections(route) {
    const formData = new FormData();
    formData.append('route', route);
    return (await client.post('/getBusDirectionsData', formData)).data;
}

export async function getStops(route, direction) {
    const formData = new FormData();
    formData.append('route', route);
    formData.append('direction', direction);
    formData.append('namecontains', '');
    return (await client.post('/getStops', formData)).data;
}

export async function getRouteTrips(location, route) {
    const formData = new FormData();
    formData.append('location', location);
    formData.append('route', route);
    return (await client.post('/getRouteTrips', formData)).data;
}

export async function getStopName(stopnum) {
    const formData = new FormData();
    formData.append('stopnum', stopnum);
    return (await client.post('/getStopName', formData)).data;
}

export async function getBusLocations(lat, lon, radius, route = "", direction = "") {
    const formData = new FormData();
    formData.append('route', route);
    formData.append('direction', direction);
    formData.append('lat', lat);
    formData.append('lon', lon);
    formData.append('radius', radius);
    formData.append('mode', 'BUS');
    return (await client.post('/getBusLocationsData', formData)).data;
}

export async function getBusDV(stop) {
    const formData = new FormData();
    formData.append('stop', stop);
    formData.append('direction', '');
    formData.append('route', '');
    return (await client.post('/getBusDV', formData)).data;
}

export async function getTripStops(timing_point_id, sched_dep_time, internal_trip_number) {
    const formData = new FormData();
    formData.append('timing_point_id', timing_point_id);
    formData.append('sched_dep_time', 'sched_dep_time');
    formData.append('internal_trip_number', 'internal_trip_number');
    return (await client.post('/getBusDV', formData)).data;
}

export async function getAllBusLocations(lat, lon, radius) {
    const formData = new FormData();
    formData.append('lat', lat);
    formData.append('lon', lon);
    formData.append('radius', radius);
    formData.append('mode', 'BUS');
    return (await client.post('/getBusLocationsData', formData)).data;
}

/*
** GTFS Data
*/

const gtfsClient = axios.create({
    baseURL: 'https://pcsdata.njtransit.com/api/GTFS',
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