# TransitWatch: Multi-Modal NYC/NJ Transit Connection Tracker

**CS 546 Web Programming I - Final Project Proposal**

## Team Members

- Anugya Sharma
- Gwanghye Jeong
- Praneeth Sai Ummadisetty
- Zaid Khalifa
- Zeyan Liu

## GitHub Repository

[https://github.com/ZaidKhalifa/TransitWatch](https://github.com/ZaidKhalifa/TransitWatch)

## Brief Description

TransitWatch is a unified multi-modal transit tracking application designed to solve the fragmentation problem faced by NYC and New Jersey commuters. Currently, commuters must juggle multiple apps and websites (MTA for subway, NJ Transit for light rail, trains and buses, separate PATH information) to plan journeys that span different transit systems. Each system has its own interface, data format, and update schedule, making it difficult to coordinate complex multi-leg commutes.

TransitWatch aggregates real-time data from MTA, NJ Transit, and PATH into a single, simplified interface focused on the user's saved routes. Users define their typical commute paths (e.g., "NJTransit bus from Central Ave to Journal Square, PATH from Journal Square to Port Authority, then Subway to Queens"), and the application provides a unified dashboard showing live train times and delays across all legs of the journey. The system calculates connection windows and presents alternative options when delays occur, helping commuters make informed real-time decisions.

Additionally, TransitWatch addresses gaps in official APIs by enabling users to report station-level accessibility issues (broken elevators, closed bathrooms, non-functioning turnstiles) that transit agencies often don't communicate promptly. This crowdsourced information helps mobility-impaired commuters and others plan more reliable journeys.

## Dataset and API Sources

### Primary Data Sources

- **MTA Subway Stations Dataset**: [https://data.ny.gov/Transportation/MTA-Subway-Stations/39hk-dx4f](https://data.ny.gov/Transportation/MTA-Subway-Stations/39hk-dx4f)
  
  Used to seed the database with comprehensive NYC subway station information including locations, lines served, and official station IDs for API integration.

- **MTA GTFS Real-Time API**: [https://api.mta.info/](https://api.mta.info/)
  
  Free API providing live train arrival predictions, service alerts, and vehicle positions for all NYC subway lines. Updated every 30 seconds. Requires free API key registration.

- **NJ Transit GTFS Feeds**: [https://www.njtransit.com/developer-tools](https://www.njtransit.com/developer-tools)
  
  Free GTFS and GTFS-RT data for NJ Transit rail and bus services. Requires free developer account registration. Daily request limit: 40,000 (sufficient for student project usage).

- **PATH Train Real-Time API**: [https://github.com/mrazza/path-data](https://github.com/mrazza/path-data)
  
  Community-maintained free API providing live PATH train arrival data. Also available as GTFS-RT feed at [https://path.transitdata.nyc/gtfsrt](https://path.transitdata.nyc/gtfsrt). No authentication required, updated every 5 seconds.

### Inspiration

The fragmented nature of multi-modal transit data across these systems inspired this project. While each agency provides excellent data for their own services, no unified interface exists for commuters whose daily journeys span multiple transit systems. This project demonstrates practical integration of open transit data to solve a real user problem.

## Core Features

1. **User Authentication System**
   
   Secure user registration and login with password hashing. Case-insensitive username handling to prevent duplicate accounts. Session management using cookies to maintain logged-in state across requests.

2. **Multi-Leg Route Creation and Management**
   
   Users can create and save custom multi-modal commute routes with multiple legs. Each leg specifies transit mode (PATH/Subway/Bus), origin station, destination station, and line. Routes can be named (e.g., "Home to Work", "Weekend to Brooklyn") for easy identification. Users can view all saved routes, edit route names, and delete routes they no longer use.

3. **Connection Time Calculator**
   
   Calculates total journey time across multiple transit legs. When a leg is delayed, automatically computes next available complete journey options. Shows 2-3 alternative departure time combinations if the user's preferred connection is missed. Factors in realistic transfer times between stations. Client-side JavaScript performs time arithmetic and displays results dynamically.

4. **Station Accessibility Issue Reporting**
   
   Users can report station-level problems that official APIs don't communicate: broken elevators, non-functioning escalators, closed bathrooms, malfunctioning turnstiles. Report submission input validation (client-side form validation, server-side route validation, database-level validation). Reports include timestamp, affected station, issue type, and optional description. Input sanitization prevents XSS attacks from user-generated descriptions.

5. **Report Voting and Verification System**
   
   Users can upvote or downvote accessibility reports to indicate current accuracy. Vote counts help surface the most relevant and current information. Users can only vote once per report. Reports with negative vote scores are de-emphasized in displays.

6. **Route Detail View**
   
   Comprehensive page for each saved route showing all legs with current status. Displays relevant accessibility reports filtered by stations in the route. Provides quick access to report new issues for any station in the route. Shows historical reliability patterns when available.

7. **Personal Report History**
   
   Users can view all reports they've submitted with timestamps and current vote counts. Option to delete their own reports if issues are resolved. Encourages user accountability and engagement with the reporting system.

## Extra Features

1. **Live Status Dashboard**
   
   Real-time aggregated view of all legs in a user's saved routes. Displays next 2-3 departure times for each leg by querying respective transit APIs. Shows current service status (on time, delayed, good service). Updates automatically every few seconds.

2. **Walking Distance Validation**
   
   When users create multi-leg routes, the system calculates physical distance between connection points. Warns users if a transfer requires walking more than 0.5km. Allows users to confirm they're willing to make longer transfers or prompts them to adjust the route. Uses station coordinate data from GTFS feeds for distance calculations.

3. **Walking Time Integration**
   
   Enhances total journey time calculations by including walking time between stations. Maintains a lookup table of common transfer walking times based on station pairs. Updates estimated arrival time: "Train: 22 min + Walk: 6 min = Total: 28 min". Helps users make more accurate schedule decisions for tight connections.

4. **Route Feasibility Scoring**
   
   Provides a composite score for each saved route based on: number of active accessibility issues, typical delay frequency, transfer distance difficulty. Visual indicators (e.g., Green/Yellow/Red) show route reliability at a glance. Suggests alternative routes when feasibility score drops below threshold.

5. **Historical Delay Pattern Analysis**
   
   Archives API delay data over time to identify patterns. Displays insights like "This route typically has delays Friday evenings 5-7pm". Helps users adjust departure times proactively for known problem periods. Aggregates data across multiple weeks for statistical reliability.
