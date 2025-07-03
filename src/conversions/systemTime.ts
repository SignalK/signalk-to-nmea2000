import { ServerAPI, Plugin} from '@signalk/server-api'
import {
  PGN_126992,
  PGN_126992Defaults,
  SystemTime
} from '@canboat/ts-pgns'

module.exports = (app:ServerAPI, plugin:Plugin) => {
  return {
    title: 'System Time (126992)',
    sourceType: 'timer',
    interval: 1000,
    optionKey: 'SYSTEM_TIMEv2',
    callback: (app:ServerAPI, date:Date): PGN_126992[] => {
      var dateObj = date ? date : new Date();

      const pad = (num:number) => num.toString().padStart(2, '0')
      const dateString = `${dateObj.getUTCFullYear()}.${pad(dateObj.getUTCMonth() + 1)}.${pad(dateObj.getUTCDate())}`
      
      const time = `${pad(dateObj.getUTCHours())}:${pad(dateObj.getUTCMinutes())}:${pad(Math.floor(dateObj.getUTCSeconds()))}`
      
      return [
        {
          ...PGN_126992Defaults,
          fields: {
            source: SystemTime.Gps,
            date: dateString,
            time: time
          }
        }
      ]
    },
    tests: [{
      input: [ undefined, new Date('2017-04-15T14:59:53.123Z') ],
      expected: [{
        "prio": 3,
        "pgn": 126992,
        "dst": 255,
        "fields": {
          "Source": "GPS",
          "Date": "2017.04.15",
          "Time": "14:59:53"
        }
      }]
    }]
  }
}
