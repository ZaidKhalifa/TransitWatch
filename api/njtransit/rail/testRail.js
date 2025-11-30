import { getStationList, getTrainSchedule } from "./APICalls.js";

async function test() {
    try {
        console.log("=== Testing getStationList ===");
        const stations = await getStationList();
        console.log(stations);

        console.log("\n=== Testing getTrainSchedule ===");
        const schedule = await getTrainSchedule("NP"); //  Newark Penn
        console.log(schedule);

    } catch (e) {
        console.error("ERROR:", e);
    }
}

test();