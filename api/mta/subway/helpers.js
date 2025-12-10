import '../../../config.js'; 
import {
  getMtaSubwayRealtime,
  getStaticGTFSData
} from './APICalls.js';

async function main() {
  try {
    const group = process.argv[2] || 'ace'; // node api/mta/subway/helpers.js bdfm 

    console.log(`=== MTA SUBWAY REALTIME (${group}) ===`);

    const { tripUpdates, vehicles, alerts } = await getMtaSubwayRealtime(group);

    console.log('TripUpdates:', tripUpdates.length);
    console.log('Vehicles   :', vehicles.length);
    console.log('Alerts     :', alerts.length);


    if (tripUpdates.length > 0) {
      console.log('\n--- Sample TripUpdate ---');
      console.dir(tripUpdates[0], { depth: 3 });
    }

    if (vehicles.length > 0) {
      console.log('\n--- Sample Vehicle ---');
      console.dir(vehicles[0], { depth: 3 });
    }

    if (alerts.length > 0) {
      console.log('\n--- Sample Alert ---');
      console.dir(alerts[0], { depth: 3 });
    }

    // Static GTFS zip
    console.log('\n=== STATIC GTFS ZIP ===');
    const zipBuffer = await getStaticGTFSData();
    console.log(
      'ZIP size (bytes):',
      zipBuffer.byteLength || zipBuffer.length
    );
  } catch (err) {
    console.error('Error in MTA debug script:', err);
  }
}

main();
