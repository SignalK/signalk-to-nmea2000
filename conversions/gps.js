const _ = require('lodash')

module.exports = (app, plugin) => {
  var lastUpdate = null
  
  return {
    title: 'Location (129025,129029)',
    optionKey: 'GPS_LOCATIONv2',
    keys: ["navigation.position"],
    callback: (position) => {
      //app.debug(`position: ${JSON.stringify(position)}`)
      var res = [
        {
          pgn: 129025,
          Latitude: position.latitude,
          Longitude: position.longitude
        }
      ]


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
        
        res.push({
          pgn: 129029,
          Date: date,
          Time: time,
          Latitude: position.latitude,
          Longitude: position.longitude,
          'GNSS type': 'GPS+SBAS/WAAS',
          Method: 'DGNSS fix',
          Integrity: 'No integrity checking',
          'Number of SVs': 16,
          HDOP:0.64,
          'Geoidal Separation': -0.01,
          'Reference Stations': 1,
          list: [{
            'Reference Station Type': 'GPS+SBAS/WAAS',
            'Reference Station ID': 7
          }]
          //'Age of DGNSS Corrections': 
        })
      }
      return res
    },
    tests: [{
      input: [ { longitude: -75.487264,
                 latitude: 32.0631296 } ],
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
          "GNSS type": "GPS+SBAS/WAAS",
          "Method": "DGNSS fix",
          "Integrity": "No integrity checking",
          "Number of SVs": 16,
          "HDOP": 0.64,
          "Geoidal Separation": -0.01,
          "Reference Stations": 1,
          "list": [
            {
              "Reference Station Type": "GPS+SBAS/WAAS",
              "Reference Station ID": 7
            }
          ]
        }
      }]
    }]
  }
}
