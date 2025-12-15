/**
 * User, Commute, and Reports Seed Script
 * Creates test users with commutes and reports for demonstration
 * 
 * Usage: npm run seed:users
 */

import { dbConnection, closeConnection } from '../config/mongoConnection.js';
import { usersCollection, reportsCollection, stopsCollection } from '../config/mongoCollections.js';
import bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';

const SALT_ROUNDS = 16;

// Test users with valid passwords (1 uppercase, 1 number, 1 special char, 8+ chars)
const TEST_USERS = [
    {
        firstName: 'Alice',
        lastName: 'Johnson',
        userId: 'AliceJ',
        email: 'alice@example.com',
        password: 'Test@123',
        dob: new Date('1995-03-15')
    },
    {
        firstName: 'Bob',
        lastName: 'Smith',
        userId: 'BobSmith',
        email: 'bob@example.com',
        password: 'Pass#456',
        dob: new Date('1992-07-22')
    },
    {
        firstName: 'Carol',
        lastName: 'Williams',
        userId: 'CarolW',
        email: 'carol@example.com',
        password: 'Secure!789',
        dob: new Date('1998-11-08')
    },
    {
        firstName: 'David',
        lastName: 'Brown',
        userId: 'DavidB',
        email: 'david@example.com',
        password: 'Hello@World1',
        dob: new Date('1990-05-30')
    },
    {
        firstName: 'Emma',
        lastName: 'Davis',
        userId: 'EmmaD',
        email: 'emma@example.com',
        password: 'Transit#2024',
        dob: new Date('1997-09-12')
    }
];

// Working commutes from the user's data (1-4 legs)
const SAMPLE_COMMUTES = [
    // 1-leg commutes
    {
        name: 'Hoboken to Paterson',
        legs: [
            {
                legOrder: 0,
                transitMode: 'NJT_RAIL',
                originStopId: 'NJTR_HB',
                originStopName: 'Hoboken',
                destinationStopId: 'NJTR_RN',
                destinationStopName: 'Paterson',
                routes: [
                    {
                        routeId: '6',
                        routeName: 'Main Line',
                        directions: [
                            { directionId: '1', directionName: 'Suffern', originStopOrder: 0, destinationStopOrder: 24 }
                        ]
                    }
                ],
                preferences: { walkingTimeAfterMinutes: null, walkingTimeUserCustomized: false }
            }
        ]
    },
    {
        name: 'MTA Subway - 42nd to JFK',
        legs: [
            {
                legOrder: 0,
                transitMode: 'MTA_SUBWAY',
                originStopId: 'MTA_SUBWAY_A27S',
                originStopName: '42 St-Port Authority Bus Terminal',
                destinationStopId: 'MTA_SUBWAY_H03S',
                destinationStopName: 'Howard Beach-JFK Airport',
                routes: [
                    {
                        routeId: 'A',
                        routeName: 'A',
                        directions: [
                            { directionId: '1', directionName: 'Far Rockaway-Mott Av', originStopOrder: 21, destinationStopOrder: 51 }
                        ]
                    }
                ],
                preferences: { walkingTimeAfterMinutes: null, walkingTimeUserCustomized: false }
            }
        ]
    },
    // 2-leg commutes
    {
        name: 'Hoboken Terminal Loop',
        legs: [
            {
                legOrder: 0,
                transitMode: 'NJT_BUS',
                originStopId: 'NJTB_21626',
                originStopName: 'PLAZA DR AT HARMON MEADOW BLVD',
                destinationStopId: 'NJTB_20497',
                destinationStopName: 'HOBOKEN TERMINAL LANE 6',
                routes: [
                    {
                        routeId: '85',
                        routeName: 'American Dream - Mill Creek  - Hoboken',
                        directions: [
                            { directionId: '1', directionName: '85 HOBOKEN TERMINAL', originStopOrder: 5, destinationStopOrder: 36 }
                        ]
                    }
                ],
                preferences: { walkingTimeAfterMinutes: 3, walkingTimeUserCustomized: false }
            },
            {
                legOrder: 1,
                transitMode: 'NJT_BUS',
                originStopId: 'NJTB_20496',
                originStopName: 'HOBOKEN TERMINAL',
                destinationStopId: 'NJTB_20511',
                destinationStopName: 'WASHINGTON ST AT 7TH ST',
                routes: [
                    {
                        routeId: '89',
                        routeName: 'North Bergen - Hoboken',
                        directions: [
                            { directionId: '0', directionName: '89 NORTH BERGEN  91ST STREET VIA PARK AVE', originStopOrder: 1, destinationStopOrder: 5 }
                        ]
                    }
                ],
                preferences: { walkingTimeAfterMinutes: null, walkingTimeUserCustomized: false }
            }
        ]
    },
    {
        name: 'Bus to Rail Transfer',
        legs: [
            {
                legOrder: 0,
                transitMode: 'NJT_BUS',
                originStopId: 'NJTB_20496',
                originStopName: 'HOBOKEN TERMINAL',
                destinationStopId: 'NJTB_20623',
                destinationStopName: 'CENTRAL AVE AT POPLAR ST',
                routes: [
                    {
                        routeId: '85',
                        routeName: 'American Dream - Mill Creek  - Hoboken',
                        directions: [
                            { directionId: '0', directionName: '85 AMERICAN DREAM', originStopOrder: 1, destinationStopOrder: 11 }
                        ]
                    }
                ],
                preferences: { walkingTimeAfterMinutes: 5, walkingTimeUserCustomized: false }
            },
            {
                legOrder: 1,
                transitMode: 'NJT_RAIL',
                originStopId: 'NJTR_AB',
                originStopName: 'Absecon',
                destinationStopId: 'NJTR_EH',
                destinationStopName: 'Egg Harbor City',
                routes: [
                    {
                        routeId: '1',
                        routeName: 'Atlantic City Rail Line',
                        directions: [
                            { directionId: '1', directionName: 'Philadelphia 30th St.', originStopOrder: 5, destinationStopOrder: 10 }
                        ]
                    }
                ],
                preferences: { walkingTimeAfterMinutes: null, walkingTimeUserCustomized: false }
            }
        ]
    },
    // 3-leg commute
    {
        name: 'Cross-Hudson Commute',
        legs: [
            {
                legOrder: 0,
                transitMode: 'NJT_BUS',
                originStopId: 'NJTB_20496',
                originStopName: 'HOBOKEN TERMINAL',
                destinationStopId: 'NJTB_31757',
                destinationStopName: 'PORT AUTHORITY BUS TERMINAL',
                routes: [
                    {
                        routeId: '126',
                        routeName: 'Hoboken - New York',
                        directions: [
                            { directionId: '1', directionName: '126 NEW YORK', originStopOrder: 1, destinationStopOrder: 12 }
                        ]
                    }
                ],
                preferences: { walkingTimeAfterMinutes: 5, walkingTimeUserCustomized: false }
            },
            {
                legOrder: 1,
                transitMode: 'MTA_SUBWAY',
                originStopId: 'MTA_SUBWAY_A27S',
                originStopName: '42 St-Port Authority Bus Terminal',
                destinationStopId: 'MTA_SUBWAY_A31S',
                destinationStopName: '14 St',
                routes: [
                    {
                        routeId: 'A',
                        routeName: 'A',
                        directions: [
                            { directionId: '1', directionName: 'Far Rockaway-Mott Av', originStopOrder: 21, destinationStopOrder: 25 }
                        ]
                    }
                ],
                preferences: { walkingTimeAfterMinutes: 3, walkingTimeUserCustomized: false }
            },
            {
                legOrder: 2,
                transitMode: 'MTA_SUBWAY',
                originStopId: 'MTA_SUBWAY_136N',
                originStopName: 'Franklin St',
                destinationStopId: 'MTA_SUBWAY_135N',
                destinationStopName: 'Canal St',
                routes: [
                    {
                        routeId: '1',
                        routeName: '1',
                        directions: [
                            { directionId: '0', directionName: 'Van Cortlandt Park-242 St', originStopOrder: 5, destinationStopOrder: 6 }
                        ]
                    }
                ],
                preferences: { walkingTimeAfterMinutes: null, walkingTimeUserCustomized: false }
            }
        ]
    },
    // 4-leg commute
    {
        name: 'Full Multi-Modal Journey',
        legs: [
            {
                legOrder: 0,
                transitMode: 'NJT_RAIL',
                originStopId: 'NJTR_AB',
                originStopName: 'Absecon',
                destinationStopId: 'NJTR_EH',
                destinationStopName: 'Egg Harbor City',
                routes: [
                    {
                        routeId: '1',
                        routeName: 'Atlantic City Rail Line',
                        directions: [
                            { directionId: '1', directionName: 'Philadelphia 30th St.', originStopOrder: 5, destinationStopOrder: 10 }
                        ]
                    }
                ],
                preferences: { walkingTimeAfterMinutes: 30, walkingTimeUserCustomized: false }
            },
            {
                legOrder: 1,
                transitMode: 'NJT_BUS',
                originStopId: 'NJTB_20496',
                originStopName: 'HOBOKEN TERMINAL',
                destinationStopId: 'NJTB_31757',
                destinationStopName: 'PORT AUTHORITY BUS TERMINAL',
                routes: [
                    {
                        routeId: '126',
                        routeName: 'Hoboken - New York',
                        directions: [
                            { directionId: '1', directionName: '126 NEW YORK', originStopOrder: 1, destinationStopOrder: 12 }
                        ]
                    }
                ],
                preferences: { walkingTimeAfterMinutes: 5, walkingTimeUserCustomized: false }
            },
            {
                legOrder: 2,
                transitMode: 'NJT_BUS',
                originStopId: 'NJTB_26229',
                originStopName: 'PORT AUTHORITY BUS TERMINAL',
                destinationStopId: 'NJTB_31105',
                destinationStopName: 'NORTH BERGEN PARK/RIDE LOT AT BUS STOP OPPOSITE T',
                routes: [
                    {
                        routeId: '320',
                        routeName: 'Mill Creek - North Bergen Park/Ride - New York',
                        directions: [
                            { directionId: '0', directionName: '320 HARMON MEADOW MILL CREEK NORTH BERGEN PARK & RIDE', originStopOrder: 1, destinationStopOrder: 5 }
                        ]
                    }
                ],
                preferences: { walkingTimeAfterMinutes: 10, walkingTimeUserCustomized: false }
            },
            {
                legOrder: 3,
                transitMode: 'MTA_SUBWAY',
                originStopId: 'MTA_SUBWAY_136N',
                originStopName: 'Franklin St',
                destinationStopId: 'MTA_SUBWAY_135N',
                destinationStopName: 'Canal St',
                routes: [
                    {
                        routeId: '1',
                        routeName: '1',
                        directions: [
                            { directionId: '0', directionName: 'Van Cortlandt Park-242 St', originStopOrder: 5, destinationStopOrder: 6 }
                        ]
                    }
                ],
                preferences: { walkingTimeAfterMinutes: null, walkingTimeUserCustomized: false }
            }
        ]
    }
];

// Sample reports for various stops
const SAMPLE_REPORTS = [
    {
        stops: [
            { stopId: 'NJTR_HB', stopName: 'Hoboken', transitSystem: 'NJT_RAIL' }
        ],
        issueType: 'elevator',
        severity: 8,
        description: 'Main elevator to platform 1 is out of service. Use stairs or elevator at north end of station.'
    },
    {
        stops: [
            { stopId: 'NJTB_20496', stopName: 'HOBOKEN TERMINAL', transitSystem: 'NJT_BUS' }
        ],
        issueType: 'escalator',
        severity: 5,
        description: 'Escalator from street level is running slow and making grinding noises.'
    },
    {
        stops: [
            { stopId: 'MTA_SUBWAY_136N', stopName: 'Franklin St', transitSystem: 'MTA_SUBWAY' },
            { stopId: 'MTA_SUBWAY_135N', stopName: 'Canal St', transitSystem: 'MTA_SUBWAY' }
        ],
        issueType: 'turnstile',
        severity: 3,
        description: 'Two turnstiles on the downtown side are not accepting MetroCards properly.'
    },
    {
        stops: [
            { stopId: 'MTA_SUBWAY_A27S', stopName: '42 St-Port Authority Bus Terminal', transitSystem: 'MTA_SUBWAY' }
        ],
        issueType: 'elevator',
        severity: 9,
        description: 'Both elevators to the A/C/E platform are out of order. Wheelchair users must use 34th St station.'
    },
    {
        stops: [
            { stopId: 'NJTR_AC', stopName: 'Atlantic City Terminal', transitSystem: 'NJT_RAIL' }
        ],
        issueType: 'bathroom',
        severity: 6,
        description: 'Men\'s restroom near ticket counter is closed for maintenance.'
    },
    {
        stops: [
            { stopId: 'NJTB_31757', stopName: 'PORT AUTHORITY BUS TERMINAL', transitSystem: 'NJT_BUS' }
        ],
        issueType: 'other',
        severity: 4,
        description: 'Digital departure boards on level 2 showing incorrect gate information.'
    },
    {
        stops: [
            { stopId: 'NJTR_RN', stopName: 'Paterson', transitSystem: 'NJT_RAIL' }
        ],
        issueType: 'escalator',
        severity: 7,
        description: 'Only escalator at station has been broken for two weeks. Stairs are the only option.'
    },
    {
        stops: [
            { stopId: 'MTA_SUBWAY_H03S', stopName: 'Howard Beach-JFK Airport', transitSystem: 'MTA_SUBWAY' }
        ],
        issueType: 'elevator',
        severity: 6,
        description: 'Elevator to AirTrain level occasionally stops between floors. Has been reported to MTA.'
    }
];

async function createUser(usersCol, userData) {
    const hashedPassword = await bcrypt.hash(userData.password, SALT_ROUNDS);
    const now = new Date();
    
    const user = {
        firstName: userData.firstName,
        lastName: userData.lastName,
        userId: userData.userId,
        email: userData.email,
        password: hashedPassword,
        dob: userData.dob,
        preferences: {
            notifications: false,
            theme: 'dark'
        },
        signupDate: now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
        lastLogin: null,
        savedCommutes: [],
        reports: [],
        upvotedReports: [],
        downvotedReports: []
    };
    
    const result = await usersCol.insertOne(user);
    return { ...user, _id: result.insertedId };
}

async function addCommutesToUser(usersCol, userId, commutes) {
    const commutesWithIds = commutes.map(commute => ({
        ...commute,
        _id: new ObjectId(),
        createdAt: new Date(),
        lastUsed: new Date()
    }));
    
    await usersCol.updateOne(
        { _id: userId },
        { $push: { savedCommutes: { $each: commutesWithIds } } }
    );
    
    return commutesWithIds;
}

async function createReport(reportsCol, usersCol, stopsCol, user, reportData) {
    const now = new Date();
    
    const report = {
        userId: user._id,
        username: user.userId,
        stops: reportData.stops,
        issueType: reportData.issueType,
        severity: reportData.severity,
        description: reportData.description,
        upvotes: 0,
        downvotes: 0,
        netVotes: 0,
        voters: [],
        status: 'active',
        isResolved: false,
        createdAt: now,
        updatedAt: now,
        resolvedAt: null
    };
    
    const result = await reportsCol.insertOne(report);
    const reportId = result.insertedId;
    
    // Link report to user
    await usersCol.updateOne(
        { _id: user._id },
        { $push: { reports: reportId } }
    );
    
    // Link report to stops
    const stopIds = reportData.stops.map(s => s.stopId);
    await stopsCol.updateMany(
        { stopId: { $in: stopIds } },
        { $addToSet: { reports: reportId } }
    );
    
    return { ...report, _id: reportId };
}

async function addVote(reportsCol, usersCol, votingUser, report, vote) {
    // Update user's voted reports
    if (vote === 1) {
        await usersCol.updateOne(
            { _id: votingUser._id },
            { $addToSet: { upvotedReports: report._id } }
        );
    } else if (vote === -1) {
        await usersCol.updateOne(
            { _id: votingUser._id },
            { $addToSet: { downvotedReports: report._id } }
        );
    }
    
    // Update report
    const voteUpdate = vote === 1 
        ? { $inc: { upvotes: 1, netVotes: 1 } }
        : { $inc: { downvotes: 1, netVotes: -1 } };
    
    await reportsCol.updateOne(
        { _id: report._id },
        {
            ...voteUpdate,
            $push: { voters: { userId: votingUser._id, vote: vote } },
            $set: { updatedAt: new Date() }
        }
    );
}

async function main() {
    console.log('TransitWatch - User & Report Seeding');
    console.log('Creating test users, commutes, and reports...\n');
    
    const db = await dbConnection();
    const usersCol = await usersCollection();
    const reportsCol = await reportsCollection();
    const stopsCol = await stopsCollection();
    
    // Clear existing test data (but keep transit data)
    console.log('Clearing existing user data...');
    await usersCol.deleteMany({});
    await reportsCol.deleteMany({});
    
    // Remove report references from stops
    await stopsCol.updateMany({}, { $set: { reports: [] } });
    
    // Create users
    console.log('\nCreating test users...');
    const createdUsers = [];
    for (const userData of TEST_USERS) {
        const user = await createUser(usersCol, userData);
        createdUsers.push(user);
        console.log(`Created user: ${user.userId} (password: ${userData.password})`);
    }
    
    // Add commutes to users (each user gets 2-3 random commutes)
    console.log('\nAdding commutes to users...');
    for (const user of createdUsers) {
        // Randomly select 2-3 commutes for each user
        const numCommutes = 2 + Math.floor(Math.random() * 2);
        const shuffled = [...SAMPLE_COMMUTES].sort(() => 0.5 - Math.random());
        const selectedCommutes = shuffled.slice(0, numCommutes);
        
        await addCommutesToUser(usersCol, user._id, selectedCommutes);
        console.log(`Added ${numCommutes} commutes to ${user.userId}`);
    }
    
    // Create reports (distribute among users)
    console.log('\nCreating accessibility reports...');
    const createdReports = [];
    for (let i = 0; i < SAMPLE_REPORTS.length; i++) {
        const user = createdUsers[i % createdUsers.length];
        const reportData = SAMPLE_REPORTS[i];
        const report = await createReport(reportsCol, usersCol, stopsCol, user, reportData);
        createdReports.push({ report, author: user });
        console.log(`${user.userId} reported: ${reportData.issueType} at ${reportData.stops[0].stopName}`);
    }
    
    // Add cross-votes (users vote on each other's reports)
    console.log('\nAdding votes to reports...');
    for (const { report, author } of createdReports) {
        // Each report gets 2-4 votes from other users
        const otherUsers = createdUsers.filter(u => u._id.toString() !== author._id.toString());
        const numVotes = 2 + Math.floor(Math.random() * 3);
        const voters = otherUsers.slice(0, numVotes);
        
        for (const voter of voters) {
            // 70% chance of upvote, 30% chance of downvote
            const vote = Math.random() < 0.7 ? 1 : -1;
            await addVote(reportsCol, usersCol, voter, report, vote);
        }
    }
    console.log('Added votes to all reports');
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('Seeding Summary');
    console.log('='.repeat(60));
    console.log(`Users created: ${createdUsers.length}`);
    console.log(`Reports created: ${createdReports.length}`);
    console.log('\nTest Accounts:');
    for (const userData of TEST_USERS) {
        console.log(`Username: ${userData.userId.padEnd(12)} Password: ${userData.password}`);
    }
    console.log('\nUser seeding complete!');
    
    await closeConnection();
}

main().catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
});