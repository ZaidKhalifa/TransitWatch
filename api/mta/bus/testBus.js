import {
  getArrivalsForBusStop
} from './APICalls.js';

async function test() {
  try {
    const stopId = "MTA_100506";   
    const routeId = "MTA NYCT_BX8";          

    const arrivals = await getArrivalsForBusStop(stopId, routeId);

    console.log("=== Arrivals for stop", stopId, "===");
    console.log(arrivals);
  } catch (err) {
    console.error("Test failed:", err);
  }
}


test();
// === Arrivals for stop MTA_100506 ===
// [
//   {
//     routeId: 'MTA NYCT_BX8',
//     tripId: 'MTA NYCT_WF_D5-Sunday-090000_BX31_618',
//     arrivalTime: '2025-12-14T15:48:53.367-05:00'
//   }
// ]