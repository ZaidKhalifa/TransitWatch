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

// Provides a set of trips for the given route at the given location. 
// location : possible locations are either bus_terminal_code as returned by querying
// getLocations or busstopnumber as returned by querying getStops
// route : possible routes are found by querying getBusRoutes
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

// Provides a list of trips matching the given criteria that will be active 1 hour
// stop : possible locations are either bus_terminal_code as returned by querying getLocations
// or busstopnumber as returned by querying getStops
// direction : possible routes are found by querying getBusDirectionsData
// route : possible routes are found by querying getBusRoutes
export async function getBusDV(stop) {
    const formData = new FormData();
    formData.append('stop', stop);
    formData.append('direction', '');
    formData.append('route', '');
    return (await client.post('/getBusDV', formData)).data;
}
// Provides the list of stops that the requested trip will make.
// timing_point_id : possible timing_point_ids are found by querying getBusDV
// sched_dep_time : possible sched_dep_times are found by querying getBusDV
// internal_trip_number : possible internal_trip_numbers are found by querying getBusDV

export async function getTripStops(internal_trip_number, sched_dep_time = "") {
    const formData = new FormData();
    formData.append('sched_dep_time', sched_dep_time);
    formData.append('internal_trip_number', internal_trip_number);
    return (await client.post('/getTripStops', formData)).data;
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
    responseType: 'arraybuffer' //tells axios to not try and parse JSON
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

// result for getRouteTrips
// [
//  {
//  "public_route": "113N",
//  "header": "DUNELLEN NORTH AVE ",
//  "lanegate": "222-3",
//  "departuretime": "7:30 AM",
//  "remarks": "",
//  "internal_trip_number": "19629805",
//  "sched_dep_time": "6/22/2023 7:30:00 AM",
//  "timing_point_id": "NWYKPABT",
//  "message": null,
//  "fullscreen": null,
//  "passload": null,
//  "vehicle_id": null
//  },...]




// result for getBUSDV
// {
//  "message": {
//  "message": "NJ TRANSIT Bus Service Customer Service Message“
//  },
//  "DVTrip": [
//  {
//  "public_route": "164",
//  "header": "MIDLAND PARK ",
//  "lanegate": "311",
//  "departuretime": "in 18 mins",
//  "remarks": "EMPTY",
//  "internal_trip_number": "19624134",
//  "sched_dep_time": "6/22/2023 12:50:00 AM",
//  "timing_point_id": "NWYKPABT",
//  "message": null,
//  "fullscreen": "FALSE",
//  "passload": "EMPTY",
//  "vehicle_id": "21032"
//  },...]
// }



// result for getTripStops
// [
//  {
//  "TripNumber": "19624134",
//  "TimePoint": "NWYKPABT",
//  "Description": "PORT AUTHORITY BUS TERMINAL",
//  "SchedLaneGate": "311",
//  "ManLaneGate": "",
//  "SchedDepTime": "6/22/2023 12:50:00 AM",
//  "ApproxTime": "6/22/2023 12:50:00 AM",
//  "StopID": "26229",
//  "Status": "Departed"
//  },
//  {
//  "TripNumber": "19624134",
//  "TimePoint": "",
//  "Description": "PABT SOUTH WING WHEN ASSIGNED",
//  "SchedLaneGate": "",
//  "ManLaneGate": "",
//  "SchedDepTime": "",
//  "ApproxTime": "6/22/2023 12:51:38 AM",
//  "StopID": "31860",
//  "Status": "Departed"
//  },...]