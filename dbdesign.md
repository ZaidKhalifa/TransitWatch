# TransitWatch - MongoDB Collections Design

### 1. **users** Collection
```javascript
{
    _id: ObjectId,
    email: String (unique, indexed),
    username: String (unique, indexed),
    passwordHash: String,
    age: Number,
    createdAt: Date,
    lastLogin: Date,
    preferences: {
        //defaultTransferWalkTime: Number, // in minutes
        notifications: Boolean,
        theme: String
    },
    savedCommutes: //subdocument
    [{
        _id: ObjectId,
        name: String,
        isActive: Boolean,
        createdAt: Date,
        lastUsed: Date,
        legs: [
        {
            legOrder: Number, // 0, 1, 2, etc.
            transitMode: String, // "NJT_BUS", "NJT_RAIL", "PATH", "MTA_SUBWAY"
              
            // Origin
            originStopId: String, // stop ID from API
            originStopName: String,
            originCoords: 
            {
                latitude: Number,
                longitude: Number
            },
          
            // Destination
            destinationStopId: String,
            destinationStopName: String,
            destinationCoords: {
                latitude: Number,
                longitude: Number
            },
          
            // Route/Line info
            routeId: String, // bus route, train line, etc.
            routeName: String,
            direction: String,
          
            // User preferences for this leg
            preferences: {
                specificVehicleId: String, // if user wants specific train/bus number
                minDepartureTime: String, // "08:00 PM"
                preferredDepartureStart: String, //"20". number of minutes after last stop 
                walkingTimeAfterMinutes: String,
                walkingTimeUserCustomized: Boolean
            }
        }
        ],
    }],
    reports: [ObjectId],
    upvotedReports: [ObjectId],
    downVotedReports: [ObjectId]
}
```

### 2. **stops** Collection
Unified collection for all transit stops across systems
```javascript
{
    _id: ObjectId,
    stopId: String (unique, indexed), // The API's stop ID
    stopName: String (indexed),
    transitSystem: [String], // "NJT_BUS", "NJT_RAIL", "PATH", "MTA_SUBWAY", "MTA_BUS"
    
    location: {
        type: "Point",
        coordinates: [Number, Number] // [longitude, latitude]
    },
    
    // For transfer connections
    nearbyStops: [
        {
        stopId: String,
        transitSystem: String,
        walkingTimeMinutes: Number,
        walkingDistanceMeters: Number
        }
    ],
    
    // Lines/routes serving this stop
    routes: [
    {
        routeId: ObjectId,
        routeName: String,
        direction: String,
        routeType: String
    }
    ],
    
    lastUpdated: Date
}
```

### 3. **routes** Collection
Information about transit routes/lines
```javascript
{
    _id: ObjectId,
    transitSystem: String,
    routeName: String,
    routeType: String, // "bus", "rail", "subway", "light_rail"
    
    directions: [
    {
    directionId: String,
    directionName: String,
    stops: [
        {
        stopId: String,
        stopName: String,
        stopOrder: Number
        }
    ]
    }
    ],
    
    lastUpdated: Date
}
```

### 4. **reports** Collection
User-reported station issues
```javascript
{
    _id: ObjectId,
    userId: ObjectId (indexed),
    username: String,
    
    stopId: String (indexed),
    stopName: String,
    transitSystem: [String],
    
    issueType: String, // "elevator", "escalator", "bathroom", "turnstile", "other"
    severity: Number, // 1-5, 1:"minor", 2-3:"moderate", 4:"major", 5:"critical"
    description: String,
    
    location: {
        type: "Point",
        coordinates: [Number, Number]
    },
    
    // Voting system
    upvotes: Number (default: 0),
    downvotes: Number (default: 0),
    netVotes: Number (default: 0, indexed),
    voters: [
    {
    userId: ObjectId,
    vote: Number // 1 for upvote, -1 for downvote
    }
    ],
    
    status: String, // "active", "resolved", "disputed"
    isResolved: Boolean (default: false),
    
    createdAt: Date (indexed),
    updatedAt: Date,
    resolvedAt: Date
}
```

### 5. **historical_delays** Collection
For the delay pattern analysis feature
```javascript
{
    _id: ObjectId,
    
    transitSystem: String,
    routeId: ObjectId,
    stopId: OnjectId,

    timeWindow: 
    {
        dayOfWeek: Number,     // 0-6
        hourOfDay: Number,     // 0-23
    },

    arrivalHistogram: {
        0: 2,   // 2 arrivals at XX:00
        1: 0,
        2: 1,
        3: 0,
        ...
        12: 5,  // 5 arrivals at XX:12 (peak!)
        ...
        27: 4,  // 4 arrivals at XX:27 (another peak)
        ...
        59: 0
    },
    
    lastUpdated: Date,
}
```