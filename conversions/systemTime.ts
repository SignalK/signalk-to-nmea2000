import { PGN_126992, PGN_126992Fields } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'

module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    title: 'System Time (126992)',
    sourceType: 'timer',
    interval: 1000,
    optionKey: 'SYSTEM_TIMEv2',
    callback: (app: App, date?: Date): PGN_126992[] => {
      var dateObj = date ? date : new Date()
      var days = Math.trunc(dateObj.getTime() / 86400 / 1000)
      var time =
        dateObj.getUTCHours() * (60 * 60) +
        dateObj.getUTCMinutes() * 60 +
        dateObj.getUTCSeconds()

      // The date goes as days since 1970, which the encoder takes as well as
      // ts-pgns's date string. Source is not set, so it goes out as not
      // available (#197).
      const fields = {
        date: days as unknown as string,
        time: time
      } as PGN_126992Fields
      return [new PGN_126992(fields)]
    },
    tests: [
      {
        input: [undefined, new Date('2017-04-15T14:59:53.123Z')],
        expected: [
          {
            prio: 3,
            pgn: 126992,
            dst: 255,
            fields: {
              Date: '2017.04.15',
              Time: 53993
            }
          }
        ]
      }
    ]
  }
}
