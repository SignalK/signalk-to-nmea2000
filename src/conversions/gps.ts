import { ServerAPI, Plugin} from '@signalk/server-api'
import {
  PGN,
  PGN_129025,
  PGN_129025Defaults,
  PGN_129029,
  PGN_129029Defaults,
  Gns,
  GnsMethod,
  GnsIntegrity
} from '@canboat/ts-pgns'

module.exports = (app:ServerAPI, plugin:Plugin) => {
  let lastUpdate:Date|null = null
  
  return {
    title: 'Location (129025,129029)',
    optionKey: 'GPS_LOCATIONv2',
    keys: ["navigation.position"],
    callback: (position:any): PGN[] => {
      //app.debug(`position: ${JSON.stringify(position)}`)

      const res: PGN[] = []
      const pos: PGN_129025 = {
        ...PGN_129025Defaults, 
        fields: {
          latitude: position.latitude,
          longitude: position.longitude
        }
      }
      res.push(pos)

      if (
        lastUpdate == null ||
          (new Date().getTime() - lastUpdate.getTime()) > 1000
      )  {
        lastUpdate = new Date()

        const pad = (num:number) => num.toString().padStart(2, '0')
        const dateObj = new Date();
        const date = `${dateObj.getUTCFullYear()}.${pad(dateObj.getUTCMonth() + 1)}.${pad(dateObj.getUTCDate())}`

        const time = `${pad(dateObj.getUTCHours())}:${pad(dateObj.getUTCMinutes())}:${pad(Math.floor(dateObj.getUTCSeconds()))}`
        
        const posData: PGN_129029 = {
          ...PGN_129029Defaults,
          fields: {
            date: date,
            time: time,
            latitude: position.latitude,
            longitude: position.longitude,
            gnssType: Gns.GpsPlussbaswaas,
            method: GnsMethod.DgnssFix,
            integrity: GnsIntegrity.NoIntegrityChecking,
            numberOfSvs: 16,
            hdop:0.64,
            geoidalSeparation: -0.01,
            referenceStations: 1,
            list: [{
              referenceStationType: Gns.GpsPlussbaswaas,
              referenceStationId: 7
            }]
          }
        }
        res.push(posData)
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
        "__preprocess__": (testResult:any) => {
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
