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
        originStopId:"MTA_BUS_401491",
        destinationStopId: "MTA_BUS_401492",
        routes: [{ routeId: "MTA NYCT_M11", routeName: "Riverbank Park & Harlem - West Village" }]
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

// [
//   {
//     routeId: 'MTA NYCT_M11',
//     routeName: 'Riverbank Park & Harlem - West Village',
//     direction: 'WEST VILLAGE ABINGDON SQ via 9 AV',
//     departureTime: '2025-12-14T17:48:01.614-05:00',
//     tripId: 'MTA NYCT_MV_D5-Sunday-098600_M11_628',
//     scheduledDepartureTime: '2025-12-14T17:48:01.614-05:00'
//   },
//   {
//     routeId: 'MTA NYCT_M11',
//     routeName: 'Riverbank Park & Harlem - West Village',
//     direction: 'WEST VILLAGE ABINGDON SQ via 9 AV',
//     departureTime: '2025-12-14T17:48:47.892-05:00',
//     tripId: 'MTA NYCT_MV_D5-Sunday-101000_M11_618',
//     scheduledDepartureTime: '2025-12-14T17:48:47.892-05:00'
//   },
//   {
//     routeId: 'MTA NYCT_M11',
//     routeName: 'Riverbank Park & Harlem - West Village',
//     direction: 'WEST VILLAGE ABINGDON SQ via 9 AV',
//     departureTime: '2025-12-14T17:59:52.730-05:00',
//     tripId: 'MTA NYCT_MV_D5-Sunday-102200_M11_622',
//     scheduledDepartureTime: '2025-12-14T17:59:52.730-05:00'
//   }
// ]
// {
//   tripId: 'MTA NYCT_MV_D5-Sunday-098600_M11_628',
//   routeId: undefined,
//   routeName: undefined,
//   direction: undefined,
//   originStopId: 'MTA_BUS_401491',
//   originStopName: '',
//   destinationStopId: 'MTA_BUS_401492',
//   destinationStopName: '9 AV/W 52 ST',
//   departureTime: '2025-12-14T17:48:01.614-05:00',
//   arrivalTime: '2025-12-14T17:49:48.414-05:00',
//   duration: 2
// }