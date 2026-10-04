
module.exports = (app, plugin) => {
  return {
    conversions: [
      to129283_xte,
      to127237_heading_track_control
    ]
  }
}

/*
 {
  "PGN":129283,
  "Id":"crossTrackError",
  "Description":"Cross Track Error",
  "Complete":false,
  "Length":6,
  "RepeatingFields":0,
  "Fields":[
    {
   "Order":1,
   "Id":"sid",
   "Name":"SID","BitLength":8,"BitOffset":0,"BitStart":0,"Signed":false},
    {
   "Order":2,
   "Id":"xteMode",
   "Name":"XTE mode","BitLength":4,"BitOffset":8,"BitStart":0,
   "Type":"Lookup table","Signed":false,
   "EnumValues":[
     {"name":"Autonomous","value":"0"},
     {"name":"Differential enhanced","value":"1"},
     {"name":"Estimated","value":"2"},
     {"name":"Simulator","value":"3"},
     {"name":"Manual","value":"4"}]},
    {
   "Order":3,
   "Id":"reserved",
   "Name":"Reserved",
   "Description":"reserved","BitLength":2,"BitOffset":12,"BitStart":4,
   "Type":"Binary data","Signed":false},
    {
   "Order":4,
   "Id":"navigationTerminated",
   "Name":"Navigation Terminated","BitLength":2,"BitOffset":14,"BitStart":6,
   "Type":"Lookup table","Signed":false,
   "EnumValues":[
     {"name":"No","value":"0"},
     {"name":"Yes","value":"1"},
     {"name":"Error","value":"10"},
     {"name":"Unavailable","value":"11"}]},
    {
   "Order":5,
   "Id":"xte",
   "Name":"XTE","BitLength":32,"BitOffset":16,"BitStart":0,
   "Units":"m",
   "Resolution":"0.01","Signed":true}]},
*/

const to129283_xte = {
  pgn: 129283,
  title: 'Cross Track Error (129283',
  optionKey: 'xte',
  keys: [
    'navigation.courseRhumbline.crossTrackError'
  ],
  callback: (XTE) => [{
    pgn: 129283,
    XTE,
    "XTE mode": "Autonomous",
    "Navigation Terminated": "No"
  }]
}

/*
{
  "PGN": 127237,
  "Id": "headingTrackControl",
  "Description": "Heading/Track control",
  "Complete": false,
  "Length": 21,
  "RepeatingFields": 0,
  "Fields": [
    {
      "Order": 1, "Id": "rudderLimitExceeded",
      "Name": "Rudder Limit Exceeded",
      "BitLength": 2, "BitOffset": 0, "BitStart": 0, "Signed": false
    }, {
      "Order": 2, "Id": "offHeadingLimitExceeded",
      "Name": "Off-Heading Limit Exceeded",
      "BitLength": 2, "BitOffset": 2, "BitStart": 2, "Signed": false
    }, {
      "Order": 3, "Id": "offTrackLimitExceeded",
      "Name": "Off-Track Limit Exceeded",
      "BitLength": 2, "BitOffset": 4, "BitStart": 4, "Signed": false
    }, {
      "Order": 4, "Id": "override",
      "Name": "Override",
      "BitLength": 2, "BitOffset": 6, "BitStart": 6, "Signed": false
    }, {
      "Order": 5, "Id": "steeringMode",
      "Name": "Steering Mode",
      "BitLength": 4, "BitOffset": 8, "BitStart": 0, "Signed": false
    }, {
      "Order": 6, "Id": "turnMode",
      "Name": "Turn Mode",
      "BitLength": 4, "BitOffset": 12, "BitStart": 4, "Signed": false
    }, {
      "Order": 7, "Id": "headingReference",
      "Name": "Heading Reference",
      "BitLength": 3, "BitOffset": 16, "BitStart": 0, "Signed": false
    }, {
      "Order": 8, "Id": "reserved",
      "Name": "Reserved",
      "BitLength": 3, "BitOffset": 19, "BitStart": 3,
      "Type": "Binary data", "Signed": false
    }, {
      "Order": 9, "Id": "commandedRudderDirection",
      "Name": "Commanded Rudder Direction",
      "BitLength": 2, "BitOffset": 22, "BitStart": 6, "Signed": false
    }, {
      "Order": 10, "Id": "commandedRudderAngle",
      "Name": "Commanded Rudder Angle",
      "BitLength": 16, "BitOffset": 24, "BitStart": 0,
      "Units": "rad", "Resolution": "0.0001", "Signed": true
    }, {
      "Order": 11, "Id": "headingToSteerCourse",
      "Name": "Heading-To-Steer (Course)",
      "BitLength": 16, "BitOffset": 40, "BitStart": 0,
      "Units": "rad", "Resolution": "0.0001", "Signed": false
    }, {
      "Order": 12, "Id": "track",
      "Name": "Track",
      "BitLength": 16, "BitOffset": 56, "BitStart": 0,
      "Units": "rad", "Resolution": "0.0001", "Signed": false
    }, {
      "Order": 13, "Id": "rudderLimit",
      "Name": "Rudder Limit",
      "BitLength": 16, "BitOffset": 72, "BitStart": 0,
      "Units": "rad", "Resolution": "0.0001", "Signed": false
    }, {
      "Order": 14, "Id": "offHeadingLimit",
      "Name": "Off-Heading Limit",
      "BitLength": 16, "BitOffset": 88, "BitStart": 0,
      "Units": "rad", "Resolution": "0.0001", "Signed": false
    }, {
      "Order": 15, "Id": "radiusOfTurnOrder",
      "Name": "Radius of Turn Order",
      "BitLength": 16, "BitOffset": 104, "BitStart": 0,
      "Units": "rad", "Resolution": "0.0001", "Signed": true
    }, {
      "Order": 16, "Id": "rateOfTurnOrder",
      "Name": "Rate of Turn Order",
      "BitLength": 16, "BitOffset": 120, "BitStart": 0,
      "Units": "rad/s", "Resolution": 3.125e-05, "Signed": true
    }, {
      "Order": 17, "Id": "offTrackLimit",
      "Name": "Off-Track Limit",
      "BitLength": 16, "BitOffset": 136, "BitStart": 0,
      "Units": "m", "Signed": true
    }, {
      "Order": 18, "Id": "vesselHeading",
      "Name": "Vessel Heading",
      "BitLength": 16, "BitOffset": 152, "BitStart": 0,
      "Units": "rad", "Resolution": "0.0001", "Signed": false
    }]
} 
*/
const to127237_heading_track_control = {
  pgn: 127237,
  title: 'Heading/Track control (127237)',
  optionKey: 'trackcontrol',
  keys: [
    'steering.autopilot.target.headingTrue',
    'navigation.courseRhumbline.bearingToDestinationTrue',
    'navigation.courseRhumbline.bearingOriginToDestinationTrue'
  ],
  callback: (steerToTrue, bearingToDest, bearingOriginToDest) => {
    return [{
      pgn: 127237,
      "Course/Bearing reference": 0,
      "Heading-To-Steer (Course)": steerToTrue,
      "Bearing, Position to Destination Waypoint": bearingToDest,
      "Bearing, Origin to Destination Waypoint": bearingOriginToDest
    }]
  }
}

/*
  "PGN": 129284,
  "Id": "navigationData",
  "Description": "Navigation Data",
  "Complete": true,
  "Length": 34,
  "RepeatingFields": 0,
  "Fields": [
    {
      "Order": 1, "Id": "sid",
      "Name": "SID",
      "BitLength": 8, "BitOffset": 0, "BitStart": 0, "Signed": false
    }, {
      "Order": 2, "Id": "distanceToWaypoint",
      "Name": "Distance to Waypoint",
      "BitLength": 32, "BitOffset": 8, "BitStart": 0,
      "Units": "m", "Resolution": "0.01", "Signed": false
    }, {
      "Order": 3, "Id": "courseBearingReference",
      "Name": "Course/Bearing reference",
      "BitLength": 2, "BitOffset": 40, "BitStart": 0,
      "Type": "Lookup table", "Signed": false,
      "EnumValues": [
        { "name": "True", "value": "0" },
        { "name": "Magnetic", "value": "1" }]
    }, {
      "Order": 4, "Id": "perpendicularCrossed",
      "Name": "Perpendicular Crossed",
      "BitLength": 2, "BitOffset": 42, "BitStart": 2,
      "Type": "Lookup table", "Signed": false,
      "EnumValues": [
        { "name": "No", "value": "0" },
        { "name": "Yes", "value": "1" }]
    }, {
      "Order": 5, "Id": "arrivalCircleEntered",
      "Name": "Arrival Circle Entered",
      "BitLength": 2, "BitOffset": 44, "BitStart": 4,
      "Type": "Lookup table", "Signed": false,
      "EnumValues": [
        { "name": "No", "value": "0" },
        { "name": "Yes", "value": "1" }]
    }, {
      "Order": 6, "Id": "calculationType",
      "Name": "Calculation Type",
      "BitLength": 2, "BitOffset": 46, "BitStart": 6,
      "Type": "Lookup table", "Signed": false,
      "EnumValues": [
        { "name": "Great Circle", "value": "0" },
        { "name": "Rhumb Line", "value": "1" }]
    }, {
      "Order": 7, "Id": "etaTime",
      "Name": "ETA Time",
      "Description": "Seconds since midnight",
      "BitLength": 32, "BitOffset": 48, "BitStart": 0,
      "Units": "s",
      "Type": "Time", "Resolution": "0.0001", "Signed": false
    }, {
      "Order": 8, "Id": "etaDate",
      "Name": "ETA Date",
      "Description": "Days since January 1, 1970",
      "BitLength": 16, "BitOffset": 80, "BitStart": 0,
      "Units": "days",
      "Type": "Date", "Resolution": 1, "Signed": false
    }, {
      "Order": 9, "Id": "bearingOriginToDestinationWaypoint",
      "Name": "Bearing, Origin to Destination Waypoint",
      "BitLength": 16, "BitOffset": 96, "BitStart": 0,
      "Units": "rad", "Resolution": "0.0001", "Signed": false
    }, {
      "Order": 10, "Id": "bearingPositionToDestinationWaypoint",
      "Name": "Bearing, Position to Destination Waypoint",
      "BitLength": 16, "BitOffset": 112, "BitStart": 0,
      "Units": "rad", "Resolution": "0.0001", "Signed": false
    }, {
      "Order": 11, "Id": "originWaypointNumber",
      "Name": "Origin Waypoint Number",
      "BitLength": 32, "BitOffset": 128, "BitStart": 0, "Signed": false
    }, {
      "Order": 12, "Id": "destinationWaypointNumber",
      "Name": "Destination Waypoint Number",
      "BitLength": 32, "BitOffset": 160, "BitStart": 0, "Signed": false
    }, {
      "Order": 13, "Id": "destinationLatitude",
      "Name": "Destination Latitude",
      "BitLength": 32, "BitOffset": 192, "BitStart": 0,
      "Units": "deg",
      "Type": "Latitude", "Resolution": "0.0000001", "Signed": true
    }, {
      "Order": 14, "Id": "destinationLongitude",
      "Name": "Destination Longitude",
      "BitLength": 32, "BitOffset": 224, "BitStart": 0,
      "Units": "deg",
      "Type": "Longitude", "Resolution": "0.0000001", "Signed": true
    }, {
      "Order": 15, "Id": "waypointClosingVelocity",
      "Name": "Waypoint Closing Velocity",
      "BitLength": 16, "BitOffset": 256, "BitStart": 0,
      "Units": "m/s", "Resolution": "0.01", "Signed": true
    }]
}
*/