import axios from 'axios';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import '../../../config.js';

export const MTA_BUS_GTFS_STATIC_FEEDS = {
  bx: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_bx.zip',     // Bronx
  b: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_b.zip',       // Brooklyn
  m: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_m.zip',       // Manhattan (M100 제외)
  q: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_q.zip',       // Queens
  si: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_si.zip',     // Staten Island
  busco: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_busco.zip'// MTA Bus Company
};

const mtaStaticClient = axios.create({
    timeout: 20000,
    responseType: 'arraybuffer'
});
/**
 * get GTFS zip for single key(bx, b, m, q, si, busco)
 * @param {string} key  - 'bx' | 'b' | 'm' | 'q' | 'si' | 'busco'
 * @returns {Promise<ArrayBuffer>}
 */
// ---- Static GTFS (zip) ----
export async function getStaticGTFSData(key) {
    const url = MTA_BUS_GTFS_STATIC_FEEDS[key];
    if (!url) {
        throw new Error(`Unknown MTA Bus GTFS key: ${key}`);
    }
    try {
        console.log(`[MTA_BUS] Downloading static GTFS for ${key} from ${url}`);
        const response = await mtaStaticClient.get(url);
        return response.data; //arraybuffer
    } catch (error) {
        console.error("Download failed for ${key}:", error.message);
        throw error;
    }
}
export async function getAllMtaBusStaticZips() {
  const entries = Object.entries(MTA_BUS_GTFS_STATIC_FEEDS);

  const results = {};
  for (const [key, url] of entries) {
    try {
      console.log(`[MTA_BUS] Downloading GTFS for ${key} from ${url}`);
      const response = await mtaStaticClient.get(url);
      results[key] = response.data; // arraybuffer
    } catch (err) {
      console.error(`[MTA_BUS] Failed to download GTFS for ${key}:`, err.message);
      throw err;
    }
  }
  return results; // { bx: ArrayBuffer, b: ArrayBuffer, ... }
}




