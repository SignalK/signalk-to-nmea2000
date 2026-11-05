import _ from 'lodash'
import {
  PGN_129794,
  PGN_129038,
  PGN_129041,
  PGN_129793
} from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'

// A Signal K delta and a vessel's tree, as loose as Signal K has them
type Delta = any
type Vessel = any

const static_keys = [
  'name',
  'design.aisShipType',
  'design.draft',
  'design.length',
  'design.beam',
  'sensors.ais.fromCenter',
  'sensors.ais.fromBow',
  'design.draft',
  'registrations.imo'
]

const position_keys = ['navigation.position']

const static_pgn = 129794
const position_pgn = 129038
const aton_pgn = 129041
const base_station_pgn = 129793

const navStatusMapping: Record<string, number> = {
  'not under command': 2,
  anchored: 1,
  moored: 5,
  sailing: 8,
  motoring: 0,
  'towing < 200m': 3,
  'towing > 200m': 3,
  pushing: 3,
  fishing: 7,
  'fishing-hampered': 7,
  trawling: 7,
  'trawling-shooting': 7,
  'trawling-hauling': 7,
  'not-under-way': 2,
  aground: 6,
  'restricted manouverability': 3,
  'restricted manouverability towing < 200m': 3,
  'restricted manouverability towing > 200m': 3,
  'restricted manouverability underwater operations': 3,
  'constrained by draft': 4,
  'ais-sart': 14,
  'hazardous material high speed': 9,
  'hazardous material wing in ground': 10
}

module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    title: `AIS (${static_pgn}, ${position_pgn}, ${aton_pgn}, ${base_station_pgn})`,
    sourceType: 'onDelta',
    //outputType: 'buffer',
    optionKey: 'AISv2',
    callback: (delta: Delta) => {
      var selfContext = 'vessels.' + app.selfId

      if (delta.context == selfContext) {
        return null
      }

      if (delta.context.startsWith('vessels.')) {
        var hasStatic = hasAnyKeys(delta, static_keys)
        var hasPosition = hasAnyKeys(delta, position_keys)

        if (!hasStatic && !hasPosition) {
          return null
        }

        var vessel = app.getPath(delta.context)
        var mmsi = findDeltaValue(vessel, delta, 'mmsi')

        if (!mmsi) {
          return null
        }

        var res: (PGN_129038 | PGN_129794 | null)[] = []
        if (hasPosition) {
          res.push(generatePosition(vessel, mmsi, delta))
        }

        if (hasStatic) {
          res.push(generateStatic(vessel, mmsi, delta))
        }
        return res
      } else if (delta.context.startsWith('atons.')) {
        var vessel = app.getPath(delta.context)
        var mmsi = findDeltaValue(vessel, delta, 'mmsi')

        if (!mmsi) {
          return
        }

        return [generateAtoN(vessel, mmsi, delta)]
      } else if (delta.context.startsWith('shore.basestations.')) {
        if (!hasAnyKeys(delta, position_keys)) {
          return null
        }
        var station = app.getPath(delta.context)
        var mmsi = findDeltaValue(station, delta, 'mmsi')

        if (!mmsi) {
          return null
        }

        const report = generateBaseStation(station, mmsi, delta)
        return report ? [report] : null
      }
    },
    tests: [
      {
        input: [
          {
            context: 'vessels.urn:mrn:imo:mmsi:367301250',
            updates: [
              {
                values: [
                  {
                    path: 'navigation.position',
                    value: { longitude: -76.3947165, latitude: 39.1296167 }
                  },
                  { path: 'navigation.courseOverGroundTrue', value: 1.501 },
                  { path: 'navigation.speedOverGround', value: 0.05 },
                  { path: 'navigation.headingTrue', value: 5.6199 },
                  { path: 'navigation.rateOfTurn', value: 0 },
                  { path: 'navigation.state', value: 'motoring' },
                  {
                    path: 'navigation.destination.commonName',
                    value: 'BALTIMORE'
                  },
                  { path: 'sensors.ais.fromBow', value: 9 },
                  { path: 'sensors.ais.fromCenter', value: 1.5 },
                  { path: 'design.draft', value: { maximum: 4.2 } },
                  { path: 'design.length', value: { overall: 30 } },
                  {
                    path: 'design.aisShipType',
                    value: { id: 52, name: 'Tug' }
                  },
                  { path: 'design.beam', value: 7 },
                  { path: 'registrations.imo', value: 'IMO 9074729' },
                  { path: '', value: { mmsi: '367301250' } },
                  { path: '', value: { name: 'SOME BOAT' } }
                ]
              }
            ]
          }
        ],
        expected: [
          {
            prio: 4,
            pgn: 129038,
            dst: 255,
            fields: {
              'Message ID': 'Scheduled Class A position report',
              'User ID': 367301250,
              Longitude: -76.3947165,
              Latitude: 39.1296167,
              'Position Accuracy': 'Low',
              RAIM: 'not in use',
              'Time Stamp': 0,
              COG: 1.501,
              SOG: 0.05,
              'AIS Transceiver information': 'Channel A VDL reception',
              Heading: 5.6199,
              'Rate of Turn': 0,
              'Nav Status': 'Under way using engine',
              'Repeat Indicator': 'Final retransmission',
              'Special Maneuver Indicator': 'Reserved'
            }
          },
          {
            prio: 6,
            pgn: 129794,
            dst: 255,
            fields: {
              'Message ID': 'Static and voyage related data',
              'User ID': 367301250,
              'IMO number': 9074729,
              Name: 'SOME BOAT',
              'Type of ship': 'Tug',
              Length: 30,
              Beam: 7,
              'Position reference from Bow': 9,
              'Position reference from Starboard': 2,
              Draft: 4.2,
              Destination: 'BALTIMORE',
              'AIS version indicator': 'ITU-R M.1371-1',
              DTE: 'Available',
              'AIS Transceiver information': 'Channel A VDL reception',
              'Repeat Indicator': 'Final retransmission'
            }
          }
        ]
      },
      {
        input: [
          {
            context: 'vessels.urn:mrn:imo:mmsi:367301250',
            updates: [
              {
                values: [
                  {
                    path: 'navigation.position',
                    value: { longitude: -76.3947165, latitude: 39.1296167 }
                  },
                  { path: 'navigation.courseOverGroundTrue', value: 1.501 },
                  { path: 'navigation.speedOverGround', value: 0.05 },
                  { path: 'navigation.headingTrue', value: 5.6199 },
                  { path: 'navigation.rateOfTurn', value: 0 },
                  { path: 'navigation.state', value: 'motoring' },
                  {
                    path: 'navigation.destination.commonName',
                    value: 'BALTIMORE'
                  },
                  // At the bow, on the starboard rail
                  { path: 'sensors.ais.fromBow', value: 0 },
                  { path: 'sensors.ais.fromCenter', value: 3.5 },
                  { path: 'design.draft', value: { maximum: 4.2 } },
                  { path: 'design.length', value: { overall: 30 } },
                  {
                    path: 'design.aisShipType',
                    value: { id: 52, name: 'Tug' }
                  },
                  { path: 'design.beam', value: 7 },
                  { path: '', value: { mmsi: '367301250' } },
                  { path: '', value: { name: 'SOME BOAT' } }
                ]
              }
            ]
          }
        ],
        expected: [
          {
            prio: 4,
            pgn: 129038,
            dst: 255,
            fields: {
              'Message ID': 'Scheduled Class A position report',
              'User ID': 367301250,
              Longitude: -76.3947165,
              Latitude: 39.1296167,
              'Position Accuracy': 'Low',
              RAIM: 'not in use',
              'Time Stamp': 0,
              COG: 1.501,
              SOG: 0.05,
              'AIS Transceiver information': 'Channel A VDL reception',
              Heading: 5.6199,
              'Rate of Turn': 0,
              'Nav Status': 'Under way using engine',
              'Repeat Indicator': 'Final retransmission',
              'Special Maneuver Indicator': 'Reserved'
            }
          },
          {
            prio: 6,
            pgn: 129794,
            dst: 255,
            fields: {
              'Message ID': 'Static and voyage related data',
              'User ID': 367301250,
              Name: 'SOME BOAT',
              'Type of ship': 'Tug',
              Length: 30,
              Beam: 7,
              'Position reference from Bow': 0,
              'Position reference from Starboard': 0,
              Draft: 4.2,
              Destination: 'BALTIMORE',
              'AIS version indicator': 'ITU-R M.1371-1',
              DTE: 'Available',
              'AIS Transceiver information': 'Channel A VDL reception',
              'Repeat Indicator': 'Final retransmission'
            }
          }
        ]
      },
      {
        input: [
          {
            context: 'atons.urn:mrn:imo:mmsi:993672085',
            updates: [
              {
                values: [
                  { path: '', value: { name: '78A' } },
                  {
                    path: 'navigation.position',
                    value: {
                      longitude: -76.4313882,
                      latitude: 38.5783333
                    }
                  },
                  {
                    path: 'atonType',
                    value: {
                      id: 14,
                      name: 'Beacon, Starboard Hand'
                    }
                  },
                  {
                    path: '',
                    value: {
                      mmsi: '993672085'
                    }
                  },
                  {
                    path: 'sensors.ais.class',
                    value: 'ATON'
                  }
                ]
              }
            ]
          }
        ],
        expected: [
          {
            prio: 4,
            pgn: 129041,
            dst: 255,
            fields: {
              'Message ID': 0,
              'Repeat Indicator': 'Initial',
              'User ID': 993672085,
              Longitude: -76.4313882,
              Latitude: 38.5783333,
              'Position Accuracy': 'Low',
              RAIM: 'not in use',
              'Time Stamp': 0,
              'AtoN Type': 'Fixed beacon: starboard hand',
              'Off Position Indicator': 'Yes',
              'Virtual AtoN Flag': 'Yes',
              'Assigned Mode Flag': 'Assigned mode',
              'AtoN Name': '78A'
            }
          }
        ]
      },
      {
        input: [
          {
            context: 'atons.urn:mrn:imo:mmsi:993672085',
            updates: [
              {
                values: [
                  { path: '', value: { name: '78A' } },
                  {
                    path: 'navigation.position',
                    value: { longitude: -76.4313882, latitude: 38.5783333 }
                  },
                  {
                    path: 'atonType',
                    value: { id: 14, name: 'Beacon, Starboard Hand' }
                  },
                  { path: '', value: { mmsi: '993672085' } },
                  { path: 'design.length', value: { overall: 2 } },
                  { path: 'design.beam', value: 2 },
                  { path: 'sensors.ais.fromCenter', value: 0.5 },
                  // Not sent for an AtoN
                  { path: 'sensors.ais.fromBow', value: 1 }
                ]
              }
            ]
          }
        ],
        expected: [
          {
            prio: 4,
            pgn: 129041,
            dst: 255,
            fields: {
              'Message ID': 0,
              'Repeat Indicator': 'Initial',
              'User ID': 993672085,
              Longitude: -76.4313882,
              Latitude: 38.5783333,
              'Position Accuracy': 'Low',
              RAIM: 'not in use',
              'Time Stamp': 0,
              'Length/Diameter': 2,
              'Beam/Diameter': 2,
              'Position Reference from Starboard Edge': 0.5,
              'AtoN Type': 'Fixed beacon: starboard hand',
              'Off Position Indicator': 'Yes',
              'Virtual AtoN Flag': 'Yes',
              'Assigned Mode Flag': 'Assigned mode',
              'AtoN Name': '78A'
            }
          }
        ]
      },
      {
        input: [
          {
            context: 'atons.urn:mrn:imo:mmsi:993672085',
            updates: [
              {
                values: [
                  { path: '', value: { name: '78A' } },
                  {
                    path: 'navigation.position',
                    value: { longitude: -76.4313882, latitude: 38.5783333 }
                  },
                  {
                    path: 'atonType',
                    value: { id: 14, name: 'Beacon, Starboard Hand' }
                  },
                  { path: '', value: { mmsi: '993672085' } },
                  { path: 'design.length', value: { overall: 2 } },
                  { path: 'design.beam', value: 2 },
                  // 3 m to starboard is off the structure: left out, not wrapped around
                  { path: 'sensors.ais.fromCenter', value: 3 }
                ]
              }
            ]
          }
        ],
        expected: [
          {
            prio: 4,
            pgn: 129041,
            dst: 255,
            fields: {
              'Message ID': 0,
              'Repeat Indicator': 'Initial',
              'User ID': 993672085,
              Longitude: -76.4313882,
              Latitude: 38.5783333,
              'Position Accuracy': 'Low',
              RAIM: 'not in use',
              'Time Stamp': 0,
              'Length/Diameter': 2,
              'Beam/Diameter': 2,
              'AtoN Type': 'Fixed beacon: starboard hand',
              'Off Position Indicator': 'Yes',
              'Virtual AtoN Flag': 'Yes',
              'Assigned Mode Flag': 'Assigned mode',
              'AtoN Name': '78A'
            }
          }
        ]
      },
      {
        input: [
          {
            context: 'atons.urn:mrn:imo:mmsi:993672085',
            updates: [
              {
                values: [
                  { path: '', value: { name: '78A' } },
                  {
                    path: 'navigation.position',
                    value: { longitude: -76.4313882, latitude: 38.5783333 }
                  },
                  {
                    path: 'atonType',
                    value: { id: 14, name: 'Beacon, Starboard Hand' }
                  },
                  { path: '', value: { mmsi: '993672085' } },
                  { path: 'design.length', value: { overall: NaN } },
                  { path: 'design.beam', value: 2 },
                  // canboatjs would send NaN as 0: left out
                  { path: 'sensors.ais.fromCenter', value: NaN }
                ]
              }
            ]
          }
        ],
        expected: [
          {
            prio: 4,
            pgn: 129041,
            dst: 255,
            fields: {
              'Message ID': 0,
              'Repeat Indicator': 'Initial',
              'User ID': 993672085,
              Longitude: -76.4313882,
              Latitude: 38.5783333,
              'Position Accuracy': 'Low',
              RAIM: 'not in use',
              'Time Stamp': 0,
              'Beam/Diameter': 2,
              'AtoN Type': 'Fixed beacon: starboard hand',
              'Off Position Indicator': 'Yes',
              'Virtual AtoN Flag': 'Yes',
              'Assigned Mode Flag': 'Assigned mode',
              'AtoN Name': '78A'
            }
          }
        ]
      },
      {
        // On the prime meridian: a longitude of 0 is still a position
        input: [
          {
            context: 'vessels.urn:mrn:imo:mmsi:235000001',
            updates: [
              {
                values: [
                  {
                    path: 'navigation.position',
                    value: { longitude: 0, latitude: 51.4769 }
                  },
                  { path: '', value: { mmsi: '235000001' } }
                ]
              }
            ]
          }
        ],
        expected: [
          {
            prio: 4,
            pgn: 129038,
            dst: 255,
            fields: {
              'Message ID': 'Scheduled Class A position report',
              'User ID': 235000001,
              Longitude: 0,
              Latitude: 51.4769,
              'Position Accuracy': 'Low',
              RAIM: 'not in use',
              'Time Stamp': 0,
              'AIS Transceiver information': 'Channel A VDL reception',
              'Nav Status': 'Under way using engine',
              'Repeat Indicator': 'Final retransmission',
              'Special Maneuver Indicator': 'Reserved'
            }
          }
        ]
      },
      {
        // On the equator: a latitude of 0 is still a position
        input: [
          {
            context: 'vessels.urn:mrn:imo:mmsi:235000002',
            updates: [
              {
                values: [
                  {
                    path: 'navigation.position',
                    value: { longitude: -29.3456, latitude: 0 }
                  },
                  { path: '', value: { mmsi: '235000002' } }
                ]
              }
            ]
          }
        ],
        expected: [
          {
            prio: 4,
            pgn: 129038,
            dst: 255,
            fields: {
              'Message ID': 'Scheduled Class A position report',
              'User ID': 235000002,
              Longitude: -29.3456,
              Latitude: 0,
              'Position Accuracy': 'Low',
              RAIM: 'not in use',
              'Time Stamp': 0,
              'AIS Transceiver information': 'Channel A VDL reception',
              'Nav Status': 'Under way using engine',
              'Repeat Indicator': 'Final retransmission',
              'Special Maneuver Indicator': 'Reserved'
            }
          }
        ]
      },
      {
        // On the prime meridian: an AtoN at longitude 0 is still sent
        input: [
          {
            context: 'atons.urn:mrn:imo:mmsi:993672085',
            updates: [
              {
                values: [
                  { path: '', value: { name: '78A' } },
                  {
                    path: 'navigation.position',
                    value: { longitude: 0, latitude: 38.5783333 }
                  },
                  {
                    path: 'atonType',
                    value: { id: 14, name: 'Beacon, Starboard Hand' }
                  },
                  { path: '', value: { mmsi: '993672085' } },
                  { path: 'design.length', value: { overall: NaN } },
                  { path: 'design.beam', value: 2 },
                  // canboatjs would send NaN as 0: left out
                  { path: 'sensors.ais.fromCenter', value: NaN }
                ]
              }
            ]
          }
        ],
        expected: [
          {
            prio: 4,
            pgn: 129041,
            dst: 255,
            fields: {
              'Message ID': 0,
              'Repeat Indicator': 'Initial',
              'User ID': 993672085,
              Longitude: 0,
              Latitude: 38.5783333,
              'Position Accuracy': 'Low',
              RAIM: 'not in use',
              'Time Stamp': 0,
              'Beam/Diameter': 2,
              'AtoN Type': 'Fixed beacon: starboard hand',
              'Off Position Indicator': 'Yes',
              'Virtual AtoN Flag': 'Yes',
              'Assigned Mode Flag': 'Assigned mode',
              'AtoN Name': '78A'
            }
          }
        ]
      },
      {
        // A base station (AIS message 4), its delta with a meta update
        input: [
          {
            context: 'shore.basestations.urn:mrn:imo:mmsi:002442000',
            updates: [
              {
                meta: [{ path: 'navigation.position', value: { units: 'deg' } }]
              },
              {
                values: [
                  {
                    path: 'navigation.position',
                    value: { longitude: 4.7731667, latitude: 52.9578333 }
                  },
                  { path: '', value: { mmsi: '002442000' } },
                  { path: 'sensors.ais.class', value: 'BASE' }
                ]
              }
            ]
          }
        ],
        expected: [
          {
            prio: 7,
            pgn: 129793,
            dst: 255,
            fields: {
              'Message ID': 'Base station report',
              'Repeat Indicator': 'Initial',
              'User ID': 2442000,
              Longitude: 4.7731667,
              Latitude: 52.9578333,
              'Position Accuracy': 'Low',
              RAIM: 'not in use'
            }
          }
        ]
      },
      {
        // A base station without a position sends nothing
        input: [
          {
            context: 'shore.basestations.urn:mrn:imo:mmsi:002442000',
            updates: [
              {
                values: [
                  { path: 'navigation.position', value: null },
                  { path: '', value: { mmsi: '002442000' } }
                ]
              }
            ]
          }
        ],
        expected: []
      }
    ]
  }
}

function generateStatic(vessel: Vessel, mmsi: any, delta: Delta): PGN_129794 {
  var name = findDeltaValue(vessel, delta, 'name')
  var type = _.get(findDeltaValue(vessel, delta, 'design.aisShipType'), 'id')
  var callsign = findDeltaValue(vessel, delta, 'communication.callsignVhf')
  var length = finite(
    _.get(findDeltaValue(vessel, delta, 'design.length'), 'overall')
  )
  var beam = finite(findDeltaValue(vessel, delta, 'design.beam'))
  var fromCenter = findDeltaValue(vessel, delta, 'sensors.ais.fromCenter')
  var fromBow = findDeltaValue(vessel, delta, 'sensors.ais.fromBow')
  var draft = _.get(findDeltaValue(vessel, delta, 'design.draft'), 'maximum')
  var imo = imoNumber(findDeltaValue(vessel, delta, 'registrations.imo'))
  var dest = findDeltaValue(vessel, delta, 'navigation.destination.commonName')

  var fromStarboard = distanceFromStarboard(fromCenter, beam)
  fromBow = distanceOnHull(fromBow, length)

  return new PGN_129794({
    messageId: 5,
    //repeatIndicator: 0,
    userId: String(mmsi),
    imoNumber: imo,
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
    aisTransceiverInformation: 0
  })
}

// Signal K gives the IMO number as "IMO 1234567"; take its digits
function imoNumber(imo: unknown): number | undefined {
  const digits = /(\d+)\s*$/.exec(String(imo ?? ''))
  return digits ? Number(digits[1]) : undefined
}

// A latitude or longitude of 0 is a position too: on the equator or the
// prime meridian
function hasPosition(position: any): boolean {
  return (
    Number.isFinite(position?.latitude) && Number.isFinite(position?.longitude)
  )
}

// fromCenter is positive to starboard, as n2k-signalk and nmea0183-signalk
// decode it
function distanceFromStarboard(fromCenter: any, beam: number | undefined) {
  if (!Number.isFinite(beam) || !Number.isFinite(fromCenter)) {
    return undefined
  }
  return distanceOnHull((beam as number) / 2 - fromCenter, beam)
}

// The reference fields are unsigned: a point off the hull would wrap around
// to a huge distance, so leave it out instead
function distanceOnHull(distance: any, size: number | undefined) {
  if (!Number.isFinite(distance) || distance < 0) {
    return undefined
  }
  if (Number.isFinite(size) && distance > (size as number)) {
    return undefined
  }
  return distance
}

// canboatjs encodes NaN as 0, which is a real distance: leave it out instead
function finite(value: unknown): number | undefined {
  return Number.isFinite(value) ? (value as number) : undefined
}

function generatePosition(
  vessel: Vessel,
  mmsi: any,
  delta: Delta
): PGN_129038 | null {
  var position = findDeltaValue(vessel, delta, 'navigation.position')

  if (hasPosition(position)) {
    var cog = findDeltaValue(vessel, delta, 'navigation.courseOverGroundTrue')
    var sog = findDeltaValue(vessel, delta, 'navigation.speedOverGround')
    var heading = findDeltaValue(vessel, delta, 'navigation.headingTrue')
    var rot = findDeltaValue(vessel, delta, 'navigation.rateOfTurn')
    var status = findDeltaValue(vessel, delta, 'navigation.state')

    if (!_.isUndefined(status)) {
      status = navStatusMapping[status]
    }
    if (_.isUndefined(status)) {
      status = 0
    }

    if (cog > Math.PI * 2) {
      cog = undefined
    }

    if (heading > Math.PI * 2) {
      heading = undefined
    }

    return new PGN_129038({
      messageId: 1,
      //repeatIndicator: 0,
      userId: String(mmsi),
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
      navStatus: status
    })
  } else {
    return null
  }
}

function generateAtoN(
  vessel: Vessel,
  mmsi: any,
  delta: Delta
): PGN_129041 | null {
  var position = findDeltaValue(vessel, delta, 'navigation.position')

  if (hasPosition(position)) {
    var name = _.get(vessel, 'name') || findDeltaValue(vessel, delta, 'name')
    var type = _.get(findDeltaValue(vessel, delta, 'atonType'), 'id')
    var length = finite(
      _.get(findDeltaValue(vessel, delta, 'design.length'), 'overall')
    )
    var beam = finite(findDeltaValue(vessel, delta, 'design.beam'))
    var fromCenter = findDeltaValue(vessel, delta, 'sensors.ais.fromCenter')
    var fromStarboard = distanceFromStarboard(fromCenter, beam)
    // No fromBow: an AtoN has no bow, and 129041 measures from its true north
    // facing edge instead. n2k-signalk does not map that field either.

    return new PGN_129041({
      messageId: 0,
      repeatIndicator: 0,
      userId: String(mmsi),
      longitude: position.longitude,
      latitude: position.latitude,
      positionAccuracy: 0,
      raim: 0,
      timeStamp: 0,
      lengthDiameter: length,
      beamDiameter: beam,
      positionReferenceFromStarboardEdge: fromStarboard,
      atonType: type,
      atonName: name,
      // Not available: Signal K has no value for it
      offPositionIndicator: undefined as unknown as number,
      virtualAtonFlag: undefined as unknown as number,
      assignedModeFlag: undefined as unknown as number
    })
  } else {
    return null
  }
}

// AIS message 4. The UTC time a base station reports is not in Signal K, so
// it is left out.
function generateBaseStation(
  station: Vessel,
  mmsi: any,
  delta: Delta
): PGN_129793 | null {
  var position = findDeltaValue(station, delta, 'navigation.position')
  if (!hasPosition(position)) {
    return null
  }
  return new PGN_129793({
    messageId: 4,
    repeatIndicator: 0,
    userId: String(mmsi),
    longitude: position.longitude,
    latitude: position.latitude,
    positionAccuracy: 0,
    raim: 0
  })
}

function hasAnyKeys(delta: Delta, keys: string[]) {
  if (delta.updates) {
    for (var i = 0; i < delta.updates.length; i++) {
      if (Array.isArray(delta.updates[i].values)) {
        for (var j = 0; j < delta.updates[i].values.length; j++) {
          var valuePath = delta.updates[i].values[j].path
          var value = delta.updates[i].values[j].value

          if (valuePath == '') {
            if (_.intersection(_.keys(value), keys).length > 0) {
              return true
            }
          } else if (keys.includes(valuePath)) {
            return true
          }
        }
      }
    }
  }
  return false
}

function findDeltaValue(vessel: Vessel, delta: Delta, path: string): any {
  if (delta.updates) {
    for (var i = 0; i < delta.updates.length; i++) {
      // A meta update has no values
      if (!Array.isArray(delta.updates[i].values)) {
        continue
      }
      for (var j = 0; j < delta.updates[i].values.length; j++) {
        var valuePath = delta.updates[i].values[j].path
        var value = delta.updates[i].values[j].value
        if (valuePath == '' && path.indexOf('.') == -1) {
          value = _.get(value, path)
          if (value) {
            return value
          }
        } else if (path == valuePath) {
          return value
        }
      }
    }
  }
  let val = _.get(vessel, path)
  return val && !_.isUndefined(val.value) ? val.value : val
}
