import axios from 'axios';
// There is no trip data: all the Port Authority communicates are stops, and arrival times at those stops. 
// There is no easy way to connect arrival times for the same train at multiple stops. 
// So, in the GTFS Realtime feed, the "trips" are dummy trips with a random ID and a single stop time update. This should be sufficient for consumers that want to show arrival times at stops, but of course prevents other uses like tracking trains through the system.
const PATH_BASE_URL = 'https://path.api.razza.dev/v1';

const client = axios.create({
  baseURL: PATH_BASE_URL,
  timeout: 10000
});

//get the list of all stations
export async function getPathStations() {
  const res = await client.get('/stations');
  // res.data.stations: [ { id, name, station, coordinates, ... }, ... ]
  return res.data;
}

//note that stationName is used for querying instead of stop_id consisting of numbers
//get real time arrival information for the given station
export async function getPathRealtimeForStation(stationName) {
  const res = await client.get(`/stations/${stationName}/realtime`);
  // res.data.upcomingTrains: [ ... ]
  return res.data;
}


// Get upcoming PATH trains for a station.
//no trip_id for path, thus unable to track a trip
// @params {string} stationName - e.g. 'harrison', 'newark'
// @returns {Promise<Array<{
//     system: 'PATH',
//     stopId: stirng,
//     routeId: string|null,
//     headsign: string|null,
//     arrivalTime: string|null,
//     status: string|null
// }}

export async function getArrivalsForStop(stationName) {
  const data = await getPathRealtimeForStation(stationName);
  const trains = data.upcomingTrains || [];
  return trains.map((t)=>({
    system: 'PATH',
    stopId: stationName, //internal stationID
    routeId: t.route||null, //NWK_WTC
    headsign: t.headsign||null, //Newwark
    arrivalTime: t.projectedArrival||null, //ISO datetime string
    status: t.status||null //ON_TIME
  }))
}


// List Stations
// HTTP: https://path.api.razza.dev/v1/stations
// {
//   "stations": [
//     {
//       "station": "NEWARK",
//       "id": "26733",
//       "name": "Newark",
//       "coordinates": {
//         "latitude": 40.73454,
//         "longitude": -74.16375
//       },
//       "platforms": [
//         // ...
//       ],
//       "entrances": [
//         // ...
//       ],
//       "timezone": "America/New_York"
//     },
//     // ...
//   ]
// }



// Get Station
// HTTP: https://path.api.razza.dev/v1/stations/{station_name} where {station_name} is one of:
// newark
// harrison
// journal_square
// grove_street
// exchange_place
// world_trade_center
// newport
// hoboken
// christopher_street
// ninth_street
// fourteenth_street
// twenty_third_street
// thirty_third_street


// Realtime Arrivals
// HTTP: https://path.api.razza.dev/v1/stations/<station_name>/realtime
// {
//   "upcomingTrains": [
//     {
//       "lineColors": [
//         "#65C100"
//       ],
//       "projectedArrival": "2019-04-13T01:56:00Z",
//       "lastUpdated": "2019-04-13T01:52:05Z",
//       "status": "ON_TIME",
//       "headsign": "Hoboken",
//       "route": "HOB_WTC",
//       "routeDisplayName": "World Trade Center - Hoboken",
//       "direction": "TO_NJ"
//     },
//     {
//       "lineColors": [
//         "#65C100"
//       ],
//       "projectedArrival": "2019-04-13T02:11:00Z",
//       "lastUpdated": "2019-04-13T01:52:05Z",
//       "status": "ON_TIME",
//       "headsign": "Hoboken",
//       "route": "HOB_WTC",
//       "routeDisplayName": "World Trade Center - Hoboken",
//       "direction": "TO_NJ"
//     },
//     {
//       "lineColors": [
//         "#D93A30"
//       ],
//       "projectedArrival": "2019-04-13T02:01:00Z",
//       "lastUpdated": "2019-04-13T01:52:05Z",
//       "status": "ON_TIME",
//       "headsign": "Newark",
//       "route": "NWK_WTC",
//       "routeDisplayName": "World Trade Center - Newark",
//       "direction": "TO_NJ"
//     },
//     {
//       "lineColors": [
//         "#D93A30"
//       ],
//       "projectedArrival": "2019-04-13T02:16:00Z",
//       "lastUpdated": "2019-04-13T01:52:05Z",
//       "status": "ON_TIME",
//       "headsign": "Newark",
//       "route": "NWK_WTC",
//       "routeDisplayName": "World Trade Center - Newark",
//       "direction": "TO_NJ"
//     }
//   ]
// }