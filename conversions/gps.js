const _ = require('lodash')

// Signal K's navigation.gnss values, as nmea0183-signalk and n2k-signalk set
// them, mapped to the names canboat uses in 129029. A value without a match
// is sent as not available.
const gnssTypes = {
  'GPS': 'GPS',
  'GLONASS': 'GLONASS',
  'Combined GPS/GLONASS': 'GPS+GLONASS',
  'Chayka': 'Chayka',
  'Integrated navigation system': 'integrated',
  'Surveyed': 'surveyed',
  'Galileo': 'Galileo',
  // canboat only
  'GPS+SBAS/WAAS': 'GPS+SBAS/WAAS',
  'GPS+SBAS/WAAS+GLONASS': 'GPS+SBAS/WAAS+GLONASS'
}

const methodQualities = {
  'no GPS': 'no GNSS',
  'GNSS Fix': 'GNSS fix',
  'DGNSS fix': 'DGNSS fix',
  'Precise GNSS': 'Precise GNSS',
  'RTK fixed integer': 'RTK Fixed Integer',
  'RTK float': 'RTK float',
  'Estimated (DR) mode': 'Estimated (DR) mode',
  'Manual input': 'Manual Input',
  'Simulator mode': 'Simulate mode'
}

const integrities = {
  'no Integrity checking': 'No integrity checking',
  'Safe': 'Safe',
  'Caution': 'Caution',
  'Unsafe': 'Unsafe'
}

// n2k-signalk passes a canboat name through when it has no Signal K name for
// it, e.g. "GPS+SBAS/WAAS", so a canboat name is accepted as it is.
const lookup = (table, value) =>
  value == null ? undefined : table[value] || (Object.values(table).includes(value) ? value : undefined)

// The GNSS values come with the fix and are only valid with it
const GNSS_TIMEOUT = 10000  // ms

// 129540 is a single fast packet, which holds at most 18 satellites
const MAX_SATELLITES = 18

module.exports = (app, plugin) => {
  var lastUpdate = null
  var lastPosition = null

  return [{
    title: 'Location (129025,129029)',
    optionKey: 'GPS_LOCATIONv2',
    keys: [
      'navigation.position',
      'navigation.gnss.antennaAltitude',
      'navigation.gnss.type',
      'navigation.gnss.methodQuality',
      'navigation.gnss.integrity',
      'navigation.gnss.satellites',
      'navigation.gnss.horizontalDilution',
      'navigation.gnss.positionDilution',
      'navigation.gnss.geoidalSeparation',
      'navigation.gnss.differentialAge',
      'navigation.gnss.differentialReference'
    ],
    timeouts: [
      undefined, ..._.times(10, () => GNSS_TIMEOUT)
    ],
    callback: (position, altitude, type, methodQuality, integrity, satellites,
               hdop, pdop, geoidalSeparation, differentialAge, differentialReference) => {
      if (position == null) {
        return []
      }

      var res = []

      // The callback also runs when only a GNSS value changed; 129025 is sent
      // for a new position only.
      if (position !== lastPosition) {
        lastPosition = position
        res.push({
          pgn: 129025,
          Latitude: position.latitude,
          Longitude: position.longitude
        })
      }

      if (
        lastUpdate == null ||
          (new Date().getTime() - lastUpdate.getTime()) > 1000
      )  {
        lastUpdate = new Date()

        var dateObj = new Date();
        var date = Math.trunc(dateObj.getTime() / 86400 / 1000);
        var time =
            dateObj.getUTCHours() * (60 * 60) +
            dateObj.getUTCMinutes() * 60 +
            dateObj.getUTCSeconds();

        const gnssType = lookup(gnssTypes, type)
        const hasReference = differentialReference != null

        res.push({
          pgn: 129029,
          Date: date,
          Time: time,
          Latitude: position.latitude,
          Longitude: position.longitude,
          Altitude: altitude ?? undefined,
          'GNSS type': gnssType,
          // A position without a reported method is still a fix
          Method: methodQuality == null ? 'GNSS fix' : lookup(methodQualities, methodQuality),
          // Integrity is two bits, so "not available" would read as Unsafe
          Integrity: lookup(integrities, integrity) || 'No integrity checking',
          'Number of SVs': satellites ?? undefined,
          HDOP: hdop ?? undefined,
          PDOP: pdop ?? undefined,
          'Geoidal Separation': geoidalSeparation ?? undefined,
          'Reference Stations': hasReference ? 1 : 0,
          list: hasReference ? [{
            'Reference Station ID': differentialReference,
            'Age of DGNSS Corrections': differentialAge ?? undefined
          }] : []
        })
      }
      return res
    },
    tests: [{
      input: [ { longitude: -75.487264, latitude: 32.0631296 } ],
      expected: [{
        "prio": 2,
        "pgn": 129025,
        "dst": 255,
        "fields": {
          "Latitude": 32.0631296,
          "Longitude": -75.487264
        }
      },{
        "__preprocess__": (testResult) => {
          //these change every time
          delete testResult.fields.Date
          delete testResult.fields.Time
        },
        "prio": 2,
        "pgn": 129029,
        "dst": 255,
        "fields": {
          "Latitude": 32.0631296,
          "Longitude": -75.487264,
          "Method": "GNSS fix",
          "Integrity": "No integrity checking",
          "Reference Stations": 0,
          "list": []
        }
      }]
    }]
  }, {
    title: 'GNSS Satellites in View (129540)',
    optionKey: 'GNSS_SATELLITES',
    keys: [ 'navigation.gnss.satellitesInView' ],
    timeouts: [ GNSS_TIMEOUT ],
    callback: (satellitesInView) => {
      const satellites = (satellitesInView?.satellites || [])
        .filter(sat => sat && sat.id != null)
        .slice(0, MAX_SATELLITES)
      if (satellites.length == 0) {
        return []
      }
      return [{
        pgn: 129540,
        'Sats in View': satellites.length,
        list: satellites.map(sat => ({
          PRN: sat.id,
          Elevation: sat.elevation ?? undefined,
          Azimuth: sat.azimuth ?? undefined,
          SNR: sat.SNR ?? undefined
        }))
      }]
    },
    tests: [{
      input: [ {
        count: 2,
        satellites: [
          { id: 5, elevation: 0.7854, azimuth: 3.1416, SNR: 42 },
          { id: 12, elevation: 0.1745, azimuth: 1.0472, SNR: 30 }
        ]
      } ],
      expected: [{
        "prio": 2,
        "pgn": 129540,
        "dst": 255,
        "fields": {
          "Sats in View": 2,
          "list": [
            { "PRN": 5, "Elevation": 0.7854, "Azimuth": 3.1416, "SNR": 42 },
            { "PRN": 12, "Elevation": 0.1745, "Azimuth": 1.0472, "SNR": 30 }
          ]
        }
      }]
    }, {
      input: [ { count: 0, satellites: [] } ],
      expected: []
    }]
  }]
}
