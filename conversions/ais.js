const _ = require('lodash')

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

const navStatusMapping = {
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

module.exports = (app, plugin) => {
  return {
    title: `AIS (${static_pgn}, ${position_pgn}, ${aton_pgn})`,
    sourceType: 'onDelta',
    //outputType: 'buffer',
    optionKey: 'AISv2',
    callback: (delta) => {
      var selfContext = 'vessels.' + app.selfId

      if ( delta.context == selfContext || isN2K(delta) ) {
        return null
      }

      if ( delta.context.startsWith('vessels.') ) {
        var hasStatic = hasAnyKeys(delta, static_keys);
        var hasPosition = hasAnyKeys(delta, position_keys)
        
        if ( !hasStatic && !hasPosition ) {
          return null
        }
    
        var vessel = app.getPath(delta.context)
        var mmsi = _.get(vessel, 'mmsi') || findDeltaValue(delta, 'mmsi');
        
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
        var mmsi = _.get(vessel, 'mmsi') || findDeltaValue(delta, 'mmsi');

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
          "Message ID": 1,
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
          "Message ID": 5,
          "User ID": 367301250,
          "Callsign": "",
          "Name": "SOME BOAT",
          "Type of ship": "Tug",
          "Length": 30,
          "Beam": 7,
          "Position reference from Bow": 9,
          "Draft": 4.2,
          "Destination": "BALTIMORE",
          "AIS version indicator": "ITU-R M.1371-1",
          "DTE": "available",
          "Reserved1": "1",
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
          "AIS RAIM Flag": "in use",
          "Time Stamp": "0",
          "AtoN Type": "Fixed beacon: starboard hand",
          "Off Position Indicator": "Yes",
          "Virtual AtoN Flag": "Yes",
          "Assigned Mode Flag": "Assigned mode",
          "AIS Spare": "1",
          "AtoN Name": "78A"
        }
      }]
    }]
  }
}

function generateStatic(vessel, mmsi, delta) {
  var name = _.get(vessel, "name") || findDeltaValue(delta, 'name');
  
  var type = _.get(findDeltaValue(delta, "design.aisShipType"), "id")
  var callsign = findDeltaValue(delta, "communication.callsignVhf")
  var length = _.get(findDeltaValue(delta, 'design.length'), 'overall')
  var beam = findDeltaValue(delta, 'design.beam')
  var fromCenter = findDeltaValue(delta, 'sensors.ais.fromCenter')
  var fromBow = findDeltaValue(delta, 'sensors.ais.fromBow')
  var draft = _.get(findDeltaValue(delta, 'design.draft'), 'maximum')
  var imo = findDeltaValue(delta, 'registrations.imo')
  var dest = findDeltaValue(delta, 'navigation.destination.commonName')
  /*
  type = _.isUndefined(type) ? 0 : type
  callsign = fillASCII(callsign ? callsign : '0', 7)
  name = fillASCII(name ? name : '0', 20)
  length = length ? length * 10 : 0xffff;
  beam = beam ? beam * 10 : 0xffff;
  draft = _.isUndefined(draft) ? 0xffff : draft * 100
  */

  if ( _.isUndefined(imo) ) {
    imo = 0
  } else {
    var parts = imo.split(imo)
    imo = Number(parts[parts.length-1])
  }

  var fromStarboard
  if ( beam && fromCenter ) {
    fromStarboard = (beam / 2 + fromCenter)
  }
  fromBow = fromBow ? fromBow : undefined

  //2017-04-15T14:58:37.625Z,6,129794,43,255,76,05,28,e0,42,0f,0f,ee,8c,00,39,48,41,33,37,39,35,41,54,4c,41,4e,54,49,43,20,50,52,4f,4a,45,43,54,20,49,49,40,4f,8a,07,18,01,8c,00,fe,06,de,44,00,cc,bf,19,e8,03,52,55,20,4c,45,44,20,3e,20,55,53,20,42,41,4c,40,40,40,40,40,04,00,ff

  mmsi = parseInt(mmsi, 10)

  return {
    pgn: static_pgn,
    'Message ID': 5,
    //'Repeat indicator': 0,
    'User ID': mmsi,
    'Callsign': callsign,
    'Name': name,
    'Type of ship': type,
    'Length': length,
    'Beam': beam,
    'Position reference from Starboard': fromStarboard,
    'Position reference from Bow': fromBow,
    'Draft': draft,
    'Destination': dest,
    'AIS version indicator': 0,
    'DTE': 0,
    'AIS Transceiver information': 0
  }

  /*
  var data = Concentrate2()
      .uint8(0x05)
      .uint32(mmsi)
      .uint32(imo)
      .buffer(callsign)
      .buffer(name)
      .uint8(type)
      .uint16(length)
      .uint16(beam)
      .uint16(fromStarboard)
      .uint16(fromBow)
      .buffer(int8buff([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]))
      .uint16(draft)
      .buffer(dest)
      .buffer(int8buff([0x05,0x00,0xff]))
      .result()
  
  return { pgn: static_pgn, buffer:data }
*/
}

function generatePosition(vessel, mmsi, delta) {
  var position = findDeltaValue(delta, 'navigation.position')

  if ( position && position.latitude && position.longitude ) {
    var cog = findDeltaValue(delta, 'navigation.courseOverGroundTrue')
    var sog = findDeltaValue(delta, 'navigation.speedOverGround')
    var heading = findDeltaValue(delta, 'navigation.headingTrue');
    var rot = findDeltaValue(delta, 'navigation.rateOfTurn')
    var status = findDeltaValue(delta, 'navigation.state')

    if ( !_.isUndefined(status) ) {
      status = navStatusMapping[status]
    }
    if ( _.isUndefined(status) ) {
      status = 0
    }

    if ( cog > Math.PI*2 ) {
      cog = undefined
    }

    if ( heading > Math.PI*2 ) {
      heading = undefined
    }
    
    /*
    cog = _.isUndefined(cog) ? 0xffff : (Math.trunc(cog * 10000))
    sog = _.isUndefined(sog) ? 0xffff : (sog*100);
    heading = _.isUndefined(heading) ? 0xffff : (Math.trunc(heading * 10000))
    rot = _.isUndefined(rot) ? 0x7fff : rot

    var latitude = position.latitude * 10000000;
    var longitude = position.longitude * 10000000;
    */

    /*
      2017-04-15T15:06:37.589Z,4,129038,43,255,28,

      01,
      ae,e7,e0,15, mmsi
      36,5c,76,d2, lon
      93,0b,52,17, lat
      94, RAIM/TS
      4d,e9, COG
      39,01, SOG
      7e,05,01,
      ff,ff, heading
      ff,7f, rat
      01,
      00, Nav Status, reserved
      ff reserved
    */

    //console.log(`${mmsi} ${position.longitude} ${position.latitude} ${cog} ${sog} ${heading} ${rot}`)

    return {
      pgn: position_pgn,
      'Message ID': 1,
      //'Repeat Indicator': 0,
      'User ID': mmsi,
      'Longitude': position.longitude,
      'Latitude': position.latitude,
      'Position Accuracy': 0,
      'RAIM': 0,
      'Time Stamp': 0,
      'COG': cog,
      'SOG': sog,
      'AIS Transceiver information': 0,
      'Heading': heading,
      'Rate of Turn': rot,
      'Nav Status': status
    }

    /*
    mmsi = parseInt(mmsi, 10)
    var data = Concentrate2()
        .uint8(0x01)
        .uint32(mmsi)
        .int32(longitude)
        .int32(latitude)
        .uint8(0x94)
        .uint16(cog)
        .uint16(sog)
        .uint8(0x7e)
        .uint8(0x05)
        .uint8(0x01)
        .uint16(heading)
        .int16(rot)
        .uint8(0xff)
        .uint8(0xff)
        .result()
    
    return { pgn: position_pgn, buffer: data }
    */
  } else {
    return null
  }
}

function generateAtoN(vessel, mmsi, delta) {
  var position = findDeltaValue(delta, 'navigation.position')

  if ( position && position.latitude && position.longitude ) {
    var name = _.get(vessel, "name") || findDeltaValue(delta, 'name');
    var type = _.get(findDeltaValue(delta, "atonType"), "id")
    var length = _.get(findDeltaValue(delta, 'design.length'), 'overall')
    var beam = findDeltaValue(delta, 'design.beam')
    var fromCenter = findDeltaValue(delta, 'sensors.ais.fromCenter')
    var fromBow = findDeltaValue(delta, 'sensors.ais.fromBow')
    var latitude = position.latitude * 10000000;
    var longitude = position.longitude * 10000000;

    /*
    type = _.isUndefined(type) ? 0 : type
    name = fillASCII(name ? name : '0', 20)
    length = length ? length * 10 : 0xffff;
    beam = beam ? beam * 10 : 0xffff;
    */

    var fromStarboard
    if ( beam && fromCenter ) {
      fromStarboard = (beam / 2 + fromCenter)
    }
    fromBow = fromBow ? fromBow * 10 : undefined

      /*
  2017-04-15T15:15:08.461Z,4,129041,43,255,49,15,

  77,3c,3a,3b,
  0d,bf,62,d2,
  b3,5e,60,17,
  f5,
  ff,ff,
  ff,ff,
  ff,ff,
  ff,ff, /from True north egde
  4e,
  0e, 
  00,
  01,
  17,01,
  4e,57,
  20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,40
  */
    
    mmsi = parseInt(mmsi, 10)

    return {
      pgn: aton_pgn,
      'Message ID': 0,
      'Repeat Indicator': 0,
      'User ID': mmsi,
      'Longitude': position.longitude,
      'Latitude': position.latitude,
      'Position Accuracy': 0,
      'RAIM': 0,
      'Time Stamp': 0,
      'Length/Diameter': length,
      'Beam/Diameter': beam,
      'Position Reference from Starboard Edge': fromStarboard,
      'Position Reference from True North Facing Edge': fromBow,
      'AtoN Type': type,
      'AtoN Name': name
    }
    /*
    var data = Concentrate2()
        .uint8(0x15)
        .uint32(mmsi)
        .int32(longitude)
        .int32(latitude)
        .uint8(0xf5)
        .uint16(length)
        .uint16(beam)
        .uint16(fromStarboard)
        .uint16(fromBow)
        .tinyInt(type,5)
        .tinyInt(0, 1)
        .tinyInt(0, 1)
        .tinyInt(0, 1)
        .uint8(0x0e)
        .uint8(0x00)
        .uint8(0x01)
        .uint8(0x17)
        .uint8(0x01)
        .buffer(name)
        .uint8(0x40)
        .result()
    return { pgn: aton_pgn, buffer: data }
    */
  } else {
    return null
  }
    
}

function int8buff(array) {
  return new Buffer(new Uint8Array(array).buffer)
}

function hasAnyKeys(delta, keys) {
  if ( delta.updates ) {
    for ( var i = 0; i < delta.updates.length; i++ ) {
      if (Array.isArray(delta.updates[i].values)) {
        for ( var j = 0; j < delta.updates[i].values.length; j++ ) {
          var valuePath = delta.updates[i].values[j].path
          var value = delta.updates[i].values[j].value

          if ( valuePath == '' ) {
            if ( _.intersection(_.keys(value), keys).length > 0 ) {
              return true
            }
          } else if ( keys.includes(valuePath) ) {
            return true
          }
        }
      }
    }
  }
  return false
}

function findDeltaValue(delta, path) {
  if ( delta.updates ) {
    for ( var i = 0; i < delta.updates.length; i++ ) {
      for ( var j = 0; j < delta.updates[i].values.length; j++ ) {
        var valuePath = delta.updates[i].values[j].path
        var value = delta.updates[i].values[j].value
        if ( valuePath == '' && path.indexOf('.') == -1 ) {
          value =  _.get(value, path)
          if ( value ) {
            return value
          }
        } else if ( path == valuePath ) {
          return value
        }
      }
    }
  }
  return undefined
}

function fillASCII(theString, len)
{
  var res = []
  var i
  for ( i = 0; i < len && i < theString.length; i++ )
  {
    res.push(theString.charCodeAt(i))
  }
  for ( ; i < len; i++ )
  {
    res.push(0x40)
  }
  return new Buffer(new Uint8Array(res).buffer);
}

function isN2K(delta) {
  return false
  var res = false
  if ( delta.updates ) {
    delta.updates.forEach(update => {
      var type = _.get(update, 'source.type')
      if ( type && type == 'NMEA2000' ) {
        res = true
      }
    });
  }
  return res
}
