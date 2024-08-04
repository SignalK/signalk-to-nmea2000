module.exports = (app, plugin) => {
  return [{
    pgn: 129025,
    title: 'Position (129025)',
    optionKey: 'position',
    keys: ["navigation.position"],
    callback: (position) => {
      return [
        {
          pgn: 129025,
          Latitude: position.latitude,
          Longitude: position.longitude
        }
      ]
    },
    tests: [{
      input: [{
        longitude: -75.487264,
        latitude: 32.0631296
      }],
      expected: [{
        "prio": 2,
        "pgn": 129025,
        "dst": 255,
        "fields": {
          "Latitude": 32.0631296,
          "Longitude": -75.487264
        }
      }]
    }]
  },
  {
    pgn: 129029,
    title: 'GNSS position data (129029)',
    optionKey: 'gnssPositionData',
    keys: [
      "navigation.datetime",
      'navigation.position',
      'navigation.gnss.antennaAltitude',
      'navigation.gnss.type',
      "navigation.gnss.methodQuality",
      'navigation.gnss.integrity',
      "navigation.gnss.satellites",
      'navigation.gnss.horizontalDilution',
      'navigation.gnss.positionDilution',
      'navigation.gnss.geoidalSeparation',
      // 'navigation.gnss.differentialAge',
      // 'navigation.gnss.differentialReference'
    ],
    callback: (datetime, position, altitude, gnss_type, quality, integrity, satellites, hdop, pdop, separation) => {
      var dateObj = new Date(datetime);
      var date = Math.trunc(dateObj.getTime() / 86400 / 1000);
      var time = dateObj.getUTCHours() * (60 * 60) +
        dateObj.getUTCMinutes() * 60 +
        dateObj.getUTCSeconds();
      return [{
        pgn: 129029,
        Date: date,
        Time: time,
        Latitude: position.latitude,
        Longitude: position.longitude,
        Altitude: altitude,
        'GNSS type': typeMap[gnss_type] || gnss_type,
        Method: methodQualityMap[quality] || quality,
        Integrity: integrityMap[integrity] || integrity,
        'Number of SVs': satellites,
        HDOP: hdop,
        PDOP: pdop,
        'Geoidal Separation': separation,
      }]
    },
    tests: [{
      input: [new Date('2017-04-15T14:59:53.123Z'), { longitude: -75.487264, latitude: 32.0631296 }, 0, 'GPS+SBAS/WAAS', "GNSS Fix", 'No integrity checking', 12, 0.46, 0.1, -0.01],
      expected: [{
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
          "Altitude": 0,
          "GNSS type": 'GPS+SBAS/WAAS',
          "Method": "GNSS fix",
          "Integrity": "No integrity checking",
          "Number of SVs": 12,
          "HDOP": 0.46,
          "PDOP": 0.1,
          "Geoidal Separation": -0.01,
          list: []
        }
      }]
    }]
  }, {
    pgn: 129539,
    title: 'GNSS DOPs (129539)',
    optionKey: 'gnssDops',
    keys: ["navigation.gnss.horizontalDilution", "navigation.gnss.verticalDilution", "navigation.gnss.timeDilution"],
    callback: (hdop, vdop, tdop) => {
      return [
        {
          pgn: 129539,
          "Desired Mode": "3D",
          "Actual Mode": "Auto",
          "HDOP": hdop,
          "VDOP": vdop,
          "TDOP": tdop
        }
      ]
    },
    tests: [{
      input: [0.77, 1.38, 0.89],
      expected: [{
        "prio": 2,
        "pgn": 129539,
        "dst": 255,
        "fields": {
          "Desired Mode": "3D",
          "Actual Mode": "Auto",
          "HDOP": 0.77,
          "VDOP": 1.38,
          "TDOP": 0.89
        }
      }]
    }]
  }, {
    pgn: 129540,
    title: 'GNSS Sats in View (129539)',
    optionKey: 'satsInView',
    keys: ["navigation.gnss.satellitesInView"],
    callback: (sats) => {
      return [
        {
          pgn: 129540,
          "Sats in View": sats.count,
          "Actual Mode": "Auto",
          list: sats.satellites.reduce((acc, satInfo) => {
            if (Object.keys(satInfo).length >= 4) {
              acc.push({
                PRN: satInfo.id,
                Elevation: satInfo.elevation,
                Azimuth: satInfo.azimuth,
                SNR: satInfo.SNR,
                Status: "Used"
              })
            }
            return acc
          }, [])
        }
      ]
    },
    tests: [{
      input: [{
        "count": 2,
        "satellites": [
          {
            "id": 15,
            "elevation": 1.0,
            "azimuth": 2.0,
            "SNR": 30.00
          },
          {
            "id": 88,
            "elevation": 1.0,
            "azimuth": 2.0,
            "SNR": 30.00
          }]
      }],
      expected: [{
        "prio": 2,
        "pgn": 129540,
        "dst": 255,
        "fields": {
          "Sats in View": 2,
          "list": [
            {
              "PRN": 15,
              "Elevation": 1.0,
              "Azimuth": 2.0,
              "SNR": 30.00,
              "Status": "Used"
            },
            {
              "PRN": 88,
              "Elevation": 1.0,
              "Azimuth": 2.0,
              "SNR": 30.00,
              "Status": "Used"
            }
          ]
        }
      }]
    }]
  }]
}

var typeMap = {
  'Combined GPS/GLONASS': 'GPS+GLONASS',
  'Integrated navigation system': 'integrated',
  'Surveyed': 'surveyed'
}

var methodQualityMap = {
  'no GPS': 'no GNSS',
  'GNSS Fix': 'GNSS fix',
  'RTK fixed integer': 'RTK Fixed Integer',
  'Simulator mode': 'Simulate mode'
}

var integrityMap = {
  'no Integrity checking': 'No integrity checking'
}
