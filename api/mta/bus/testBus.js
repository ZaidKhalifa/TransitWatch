// import {
//   getArrivalsForBusStop
// } from './APICalls.js';

// async function test() {
//   try {
//     const stopId = "MTA_100506";   
//     const routeId = "MTA NYCT_BX8";          

//     const arrivals = await getArrivalsForBusStop(stopId, routeId);

//     console.log("=== Arrivals for stop", stopId, "===");
//     console.log(arrivals);
//   } catch (err) {
//     console.error("Test failed:", err);
//   }
// }


// test();
// // === Arrivals for stop MTA_100506 ===
// // [
// //   {
// //     routeId: 'MTA NYCT_BX8',
// //     tripId: 'MTA NYCT_WF_D5-Sunday-090000_BX31_618',
// //     arrivalTime: '2025-12-14T15:48:53.367-05:00'
// //   }
// // ]



import { closeConnection } from '../../../config/mongoConnection.js';
import { getAvailableTrips, getTripDetails } from '../../../helpers/MTABusHelpers.js'; 

async function testBus() {
  try {
    const leg = {
        originStopId: "MTA_BUS_100860",
        destinationStopId: "MTA_BUS_100861",
        routes: [{ routeId: "MTA NYCT_BX29", routeName: 'BX29' }]
    };

    const trips = await getAvailableTrips(leg, new Date());
    console.log(trips);

    if (trips.length > 0) {
      const details = await getTripDetails(leg, new Date(), trips[0].tripId);
      console.log(details);
    }
  } catch (e) {
    console.error(e);
  } 
//     await closeConnection(); 
//     process.exit(0);           
//   }
}

testBus();