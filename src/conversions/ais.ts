import _ from 'lodash'

import { ServerAPI, Plugin, Delta, Update, PathValue, hasValues} from '@signalk/server-api'
import {
  PGN_129794,
  PGN_129794Defaults,
  PGN_129038,
  PGN_129038Defaults,
  PGN_129041,
  PGN_129041Defaults,
  YesNo
} from '@canboat/ts-pgns'


const static_keys = [
  "name",
  "design.aisShipType",
  "design.draft",
  "design.length",
  "design.beam",
  "sensors.ais.fromCenter",
  "sensors.ais.fromBow" ,
  "design.draft",
  "registrations.imo"
]

const position_keys = [ 'navigation.position' ]

const static_pgn = 129794
const position_pgn = 129038
const aton_pgn = 129041

const navStatusMapping : {[key:string]: number} = {
  'not under command': 2,
  'anchored': 1,
  'moored': 5,
  'sailing': 8,
  'motoring': 0,
  'towing < 200m': 3,
  'towing > 200m': 3,
  'pushing': 3,
  'fishing': 7,
  'fishing-hampered': 7,
  'trawling': 7,
  'trawling-shooting': 7,
  'trawling-hauling': 7,
  'not-under-way': 2,
  'aground': 6,
  'restricted manouverability':3,
  'restricted manouverability towing < 200m': 3,
  'restricted manouverability towing > 200m': 3,
  'restricted manouverability underwater operations': 3,
  'constrained by draft': 4,
  'ais-sart': 14,
  'hazardous material high speed': 9,
  'hazardous material wing in ground': 10
}

module.exports = function(app:ServerAPI, plugin:Plugin) {
  return {
    title: `AIS (${static_pgn}, ${position_pgn}, ${aton_pgn})`,
    sourceType: 'onDelta',
    //outputType: 'buffer',
    optionKey: 'AISv2',
    callback: (delta:Delta) => {
      var selfContext = 'vessels.' + app.selfId

      if ( delta.context === undefined || delta.context == selfContext || isN2K(delta) ) {
        return null
      }

      if ( delta.context.startsWith('vessels.') ) {
        var hasStatic = hasAnyKeys(delta, static_keys);
        var hasPosition = hasAnyKeys(delta, position_keys)
        
        if ( !hasStatic && !hasPosition ) {
          return null
        }
    
        var vessel = app.getPath(delta.context)
        var mmsi = findDeltaValue(vessel, delta, 'mmsi');
        
        if ( !mmsi ) {
          return null;
        }
        
      var res = []
        if ( hasPosition ) {
          res.push(generatePosition(vessel, mmsi, delta))
        }
        
        if ( hasStatic ) {
          res.push(generateStatic(vessel, mmsi, delta))
        }
        return res
      } else if ( delta.context.startsWith('atons.') ) {
        var vessel = app.getPath(delta.context)
        var mmsi = findDeltaValue(vessel, delta, 'mmsi');

        if ( !mmsi ) {
          return
        }
        
        return [ generateAtoN(vessel, mmsi, delta) ]
      }
    },
    tests: [{
      input: [{
        "context":"vessels.urn:mrn:imo:mmsi:367301250",
        "updates":[{"values":[
          {
            "path":"navigation.position",
            "value": {"longitude":-76.3947165,"latitude":39.1296167}
          },
          {"path":"navigation.courseOverGroundTrue","value":1.501},
          {"path":"navigation.speedOverGround","value":0.05},
          {"path":"navigation.headingTrue","value":5.6199},
          {"path":"navigation.rateOfTurn","value":0},
          {"path":"navigation.state","value":"motoring"},
          {"path":"navigation.destination.commonName","value":"BALTIMORE"},
          {"path":"sensors.ais.fromBow","value":9},
          {"path":"sensors.ais.fromCenter","value":0},
          {"path": "design.draft", "value": { "maximum": 4.2 }},
          {"path": "design.length","value": {"overall": 30}},
          {"path": "design.aisShipType", "value": {"id": 52, "name": "Tug"}},
          {"path": "design.beam","value": 7},
          {"path":"","value":{"mmsi":"367301250"}},
          {"path":"","value":{"name":"SOME BOAT"}}
        ]}
      ]}],
      expected: [{
        "prio": 2,
        "pgn": 129038,
        "dst": 255,
        "fields": {
          "Message ID": "Scheduled Class A position report",
          "User ID": 367301250,
          "Longitude": -76.3947165,
          "Latitude": 39.1296167,
          "Position Accuracy": "Low",
          "RAIM": "not in use",
          "Time Stamp": "0",
          "COG": 1.501,
          "SOG": 0.05,
          "AIS Transceiver information": "Channel A VDL reception",
          "Heading": 5.6199,
          "Rate of Turn": 0,
          "Nav Status": "Under way using engine"
        }
      },{
        "prio": 2,
        "pgn": 129794,
        "dst": 255,
        "fields": {
          "Message ID": "Static and voyage related data",
          "User ID": 367301250,
          "Name": "SOME BOAT",
          "Type of ship": "Tug",
          "Length": 30,
          "Beam": 7,
          "Position reference from Bow": 9,
          "Position reference from Starboard": 3.5,
          "Draft": 4.2,
          "Destination": "BALTIMORE",
          "AIS version indicator": "ITU-R M.1371-1",
          "DTE": "Available",
          "Reserved1": 1,
          "AIS Transceiver information": "Channel A VDL reception"
        }
      }]
    },{
      input: [{
        "context": "atons.urn:mrn:imo:mmsi:993672085",
        "updates": [
          {
            "values":[
              {"path": "","value": {"name": "78A"}},
              {
                "path": "navigation.position",
                "value": {
                  "longitude": -76.4313882,
                  "latitude": 38.5783333
                }
              },
              {
                "path": "atonType",
                "value": {
                  "id": 14,
                  "name": "Beacon, Starboard Hand"
                }
              },
               {
                 "path": "",
                 "value": {
                   "mmsi": "993672085"
                 }
               },
               {
                 "path": "sensors.ais.class",
                 "value": "ATON"
               }
            ]
          }
        ]}],
      expected: [{
        "prio": 2,
        "pgn": 129041,
        "dst": 255,
        "fields": {
          "Message ID": 0,
          "Repeat Indicator": "Initial",
          "User ID": 993672085,
          "Longitude": -76.4313882,
          "Latitude": 38.5783333,
          "Position Accuracy": "Low",
          "RAIM": "not in use",
          "Time Stamp": "0",
          "AtoN Type": "Fixed beacon: starboard hand",
          "Off Position Indicator": "No",
          "Virtual AtoN Flag": "No",
          "Assigned Mode Flag": "Assigned mode",
          "Spare": 1,
          "AtoN Name": "78A"
        }
      }]
    }]
  }
}

function generateStatic(vessel:any, mmsiString:string, delta:Delta): PGN_129794 {
  var name = findDeltaValue(vessel, delta, 'name');
  var type = _.get(findDeltaValue(vessel, delta, "design.aisShipType"), "id")
  var callsign = findDeltaValue(vessel, delta, "communication.callsignVhf")
  var length = _.get(findDeltaValue(vessel, delta, 'design.length'), 'overall')
  var beam = findDeltaValue(vessel, delta, 'design.beam')
  var fromCenter = findDeltaValue(vessel, delta, 'sensors.ais.fromCenter')
  var fromBow = findDeltaValue(vessel, delta, 'sensors.ais.fromBow')
  var draft = _.get(findDeltaValue(vessel, delta, 'design.draft'), 'maximum')
  var imo = findDeltaValue(vessel, delta, 'registrations.imo')
  var dest = findDeltaValue(vessel, delta, 'navigation.destination.commonName')

  if ( _.isUndefined(imo) ) {
    imo = 0
  } else {
    var parts = imo.split(imo)
    imo = Number(parts[parts.length-1])
  }

  var fromStarboard
  if ( !_.isUndefined(beam) && !_.isUndefined(fromCenter) ) {
    fromStarboard = (beam / 2 + fromCenter)
  }
  fromBow = fromBow ? fromBow : undefined

  return {
    ...PGN_129794Defaults,
    fields: {
      messageId: 5,
      userId: mmsiString,
      callsign: callsign,
      name: name,
      typeOfShip: type,
      length: length,
      beam: beam,
      positionReferenceFromStarboard: fromStarboard,
      positionReferenceFromBow: fromBow,
      draft: draft,
      destination: dest,
      aisVersionIndicator: 0,
      dte: 0,
      aisTransceiverInformation: 0,
    }
  }
}

function generatePosition(vessel:any, mmsi:string, delta:Delta): PGN_129038|null {
  var position = findDeltaValue(vessel, delta, 'navigation.position')

  if ( position && position.latitude && position.longitude ) {
    var cog = findDeltaValue(vessel, delta, 'navigation.courseOverGroundTrue')
    var sog = findDeltaValue(vessel, delta, 'navigation.speedOverGround')
    var heading = findDeltaValue(vessel, delta, 'navigation.headingTrue');
    var rot = findDeltaValue(vessel, delta, 'navigation.rateOfTurn')
    const status:string = findDeltaValue(vessel, delta, 'navigation.state')
    let n2kStatus:number|undefined = undefined
    
    if ( status !== undefined ) {
      n2kStatus = navStatusMapping[status]
    }
    if ( n2kStatus === undefined ) {
      n2kStatus = 0
    }

    if ( cog > Math.PI*2 ) {
      cog = undefined
    }

    if ( heading > Math.PI*2 ) {
      heading = undefined
    }
    
    
    return {
      ...PGN_129038Defaults,
      fields: {
        messageId: 1,
        userId: mmsi,
        longitude: position.longitude,
        latitude: position.latitude,
        positionAccuracy: 0,
        raim: 0,
        timeStamp: 0,
        cog: cog,
        sog: sog,
        aisTransceiverInformation: 0,
        heading: heading,
        rateOfTurn: rot,
        navStatus: n2kStatus
      }
    }
  } else {
    return null
  }
}

function generateAtoN(vessel:any, mmsiString:string, delta:Delta): PGN_129041|undefined {
  var position = findDeltaValue(vessel, delta, 'navigation.position')

  if ( position && position.latitude && position.longitude ) {
    var name = _.get(vessel, "name") || findDeltaValue(vessel, delta, 'name');
    var type = _.get(findDeltaValue(vessel, delta, "atonType"), "id")
    var length = _.get(findDeltaValue(vessel, delta, 'design.length'), 'overall')
    var beam = findDeltaValue(vessel, delta, 'design.beam')
    var fromCenter = findDeltaValue(vessel, delta, 'sensors.ais.fromCenter')
    var fromBow = findDeltaValue(vessel, delta, 'sensors.ais.fromBow')
    var latitude = position.latitude * 10000000;
    var longitude = position.longitude * 10000000;

    var fromStarboard
    if ( !_.isUndefined(beam) && !_.isUndefined(fromCenter) ) {
      fromStarboard = (beam / 2 + fromCenter)
    }
    fromBow = fromBow ? fromBow * 10 : undefined

    return {
      ...PGN_129041Defaults,
      fields: {
        messageId: 0,
        repeatIndicator: 0,
        userId: mmsiString,
        longitude: position.longitude,
        latitude: position.latitude,
        positionAccuracy: 0,
        raim: 0,
        timeStamp: 0,
        lengthDiameter: length,
        beamDiameter: beam,
        positionReferenceFromStarboardEdge: fromStarboard,
        positionReferenceFromTrueNorthFacingEdge: fromBow,
        atonType: type,
        atonName: name,
        offPositionIndicator: 0,
        virtualAtonFlag: 0,
        assignedModeFlag:1,
      }
    }
  } else {
    return undefined
  }
}

function hasAnyKeys(delta:Delta, keys: string[]) {
  if ( delta.updates ) {
    delta.updates.forEach((update: Update) => {
      if (hasValues(update)) {
        update.values.forEach(async (pathValue: PathValue) => {
          if ( pathValue.path == '' ) {
            if ( _.intersection(_.keys(pathValue.value), keys).length > 0 ) {
              return true
            }
          } else if ( keys.includes(pathValue.path) ) {
            return true
          }
        })
      }
    })
  }
  return false
}

function findDeltaValue(vessel:any, delta:Delta, path:string) {
  if ( delta.updates ) {
    delta.updates.forEach((update: Update) => {
      if (hasValues(update)) {
        update.values.forEach(async (pathValue: PathValue) => {
          if ( pathValue.path == '' && path.indexOf('.') == -1 ) {
            const value =  _.get(pathValue.value, path)
            if ( value ) {
              return value
            }
          } else if ( path == pathValue.path ) {
            return pathValue.value
          }
        })
      }
    })
  }
  let val = _.get(vessel, path)
  return val && !_.isUndefined(val.value) ? val.value: val
}

function isN2K(delta:any) {
  return false
  var res = false
  if ( delta.updates ) {
    delta.updates.forEach((update:any) => {
      var type = _.get(update, 'source.type')
      if ( type && type == 'NMEA2000' ) {
        res = true
      }
    });
  }
  return res
}
