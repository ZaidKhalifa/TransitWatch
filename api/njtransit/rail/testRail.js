// import { getStationList, getTrainSchedule } from "./APICalls.js";

// async function test() {
//     try {
//         console.log("=== Testing getStationList ===");
//         const stations = await getStationList();
//         console.log(stations);

//         console.log("\n=== Testing getTrainSchedule ===");
//         const schedule = await getTrainSchedule("NP"); //  Newark Penn
//         console.log(schedule);

//     } catch (e) {
//         console.error("ERROR:", e);
//     }
// }

// test();



import { getAvailableTrips, getTripDetails } from '../../../helpers/NJTRailHelpers.js'; 


async function testRail() {
  const leg = {
    originStopId: 'NJTR_NP',        // Newark Penn
    originStopName: 'Newark Penn',
    destinationStopId: 'NJTR_NY',   // New York Penn
    destinationStopName: 'New York Penn',

    routes: [
      {
        routeId: '9',
        routeName: 'NEC',
        validDirections: [
          { directionName: 'Penn Station New York' }
        ]
      }
    ]
  };

  console.log('--- Testing getAvailableTrips ---');
  const trips = await getAvailableTrips(leg, new Date());
  console.log(trips);

  if (trips.length > 0) {
    console.log('--- Testing getTripDetails ---');
    const details = await getTripDetails(leg, new Date(), trips[0].tripId);
    console.log(details);
  } else {
    console.log('No trips found');
  }
}

testRail().catch(err => {
  console.error('TEST FAILED:', err);
});

