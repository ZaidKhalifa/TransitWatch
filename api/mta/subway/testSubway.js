// import '../../../config.js'; 
// import {
//   getMtaSubwayRealtime,
//   getStaticGTFSData
// } from './APICalls.js';

// async function main() {
//   try {
//     const group = process.argv[2] || 'ace'; // node api/mta/subway/helpers.js bdfm 

//     console.log(`=== MTA SUBWAY REALTIME (${group}) ===`);

//     const { tripUpdates, vehicles, alerts } = await getMtaSubwayRealtime(group);

//     console.log('TripUpdates:', tripUpdates.length);
//     console.log('Vehicles   :', vehicles.length);
//     console.log('Alerts     :', alerts.length);


//     if (tripUpdates.length > 0) {
//       console.log('\n--- Sample TripUpdate ---');
//       console.dir(tripUpdates[0], { depth: 3 });
//     }

//     if (vehicles.length > 0) {
//       console.log('\n--- Sample Vehicle ---');
//       console.dir(vehicles[0], { depth: 3 });
//     }

//     if (alerts.length > 0) {
//       console.log('\n--- Sample Alert ---');
//       console.dir(alerts[0], { depth: 3 });
//     }

//     // Static GTFS zip
//     console.log('\n=== STATIC GTFS ZIP ===');
//     const zipBuffer = await getStaticGTFSData();
//     console.log(
//       'ZIP size (bytes):',
//       zipBuffer.byteLength || zipBuffer.length
//     );
//   } catch (err) {
//     console.error('Error in MTA debug script:', err);
//   }
// }

// main();
import { closeConnection } from '../../../config/mongoConnection.js';
import { getAvailableTrips, getTripDetails } from '../../../helpers/MTASubwayHelpers.js'; 

async function testSubway() {
  try {
    const leg = {
      originStopId: 'MTA_SUBWAY_R40N',
      destinationStopId: 'MTA_SUBWAY_R39N',
      routes: [{ routeId: 'W', routeName: 'W' }]
    };

    const trips = await getAvailableTrips(leg, new Date());
    console.log(trips);

    if (trips.length > 0) {
      const details = await getTripDetails(leg, new Date(), trips[0].tripId);
      console.log(details);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await closeConnection(); 
    process.exit(0);           
  }
}

testSubway();

// --- Testing getAvailableTrips ---
// Failed to fetch MTA GTFS-RT for group=7: invalid wire type 4 at offset 1
// [
//   {
//     routeId: 'R',
//     routeName: 'R',
//     direction: 'N',
//     departureTime: 1765703670,
//     tripId: '20251214:R:024600_R..N31R',
//     scheduledDepartureTime: 1765703670
//   },
//   {
//     routeId: 'N',
//     routeName: 'N',
//     direction: 'N',
//     departureTime: 1765703979,
//     tripId: '20251214:N:023700_N..N20R',
//     scheduledDepartureTime: 1765703979
//   },
//   {
//     routeId: 'R',
//     routeName: 'R',
//     direction: 'N',
//     departureTime: 1765704870,
//     tripId: '20251214:R:026600_R..N31R',
//     scheduledDepartureTime: 1765704870
//   },
//   {
//     routeId: 'N',
//     routeName: 'N',
//     direction: 'N',
//     departureTime: 1765705050,
//     tripId: '20251214:N:025700_N..N20R',
//     scheduledDepartureTime: 1765705050
//   },
//   {
//     routeId: 'R',
//     routeName: 'R',
//     direction: 'N',
//     departureTime: 1765706070,
//     tripId: '20251214:R:028600_R..N31R',
//     scheduledDepartureTime: 1765706070
//   },
//   {
//     routeId: 'N',
//     routeName: 'N',
//     direction: 'N',
//     departureTime: 1765706250,
//     tripId: '20251214:N:027700_N..N20R',
//     scheduledDepartureTime: 1765706250
//   },
//   {
//     routeId: 'N',
//     routeName: 'N',
//     direction: 'N',
//     departureTime: 1765707660,
//     tripId: '20251214:N:030050_N..N20R',
//     scheduledDepartureTime: 1765707660
//   }
// ]
// {
//   tripId: '20251214:R:024600_R..N31R',
//   routeId: undefined,
//   routeName: undefined,
//   direction: undefined,
//   originStopId: 'MTA_SUBWAY_R40N',
//   originStopName: '53 St',
//   destinationStopId: 'MTA_SUBWAY_R39N',
//   destinationStopName: '45 St',
//   departureTime: 1765703670,
//   arrivalTime: 1765703760,
//   duration: 2
// }