import {
  PGN_65288_SeatalkAlarm,
  SeatalkAlarmStatus,
  SeatalkAlarmId,
  SeatalkAlarmGroup
} from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { withPriority } from '../pgn'

// The alarms sent, each with the notification path it is for.
let alarms: { path: string; pgn: PGN_65288_SeatalkAlarm }[] = []

module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    title: 'Raymarine (Seatalk) Alarms (65288)',
    optionKey: 'RAYMARINE',
    keys: ['notifications.navigation.anchor', 'notifications.mob'],
    context: 'vessels.self',
    sourceType: 'subscription',
    callback: (delta: any): PGN_65288_SeatalkAlarm[] | undefined => {
      const update = delta.updates[0].values[0]
      const path = update.path
      const value = update.value
      const type = value.state

      //dont create a loop by sending out notifications we recieved from NMEA
      if (path.includes('notifications.nmea')) {
        return alarms.map((alarm) => alarm.pgn)
      }

      // remove the pgns and reprocess them for changes
      alarms = alarms.filter(function (obj) {
        return obj.path !== path
      })

      let state: SeatalkAlarmStatus | undefined
      const method = value.method || []
      if (value.state == 'normal') {
        if (method.indexOf('sound') != -1) {
          state = SeatalkAlarmStatus.AlarmConditionNotMet
        }
      } else {
        if (method.indexOf('sound') == -1) {
          state = SeatalkAlarmStatus.AlarmConditionMetAndSilenced
        } else {
          state = SeatalkAlarmStatus.AlarmConditionMetAndNotSilenced
        }
      }

      let alarmId: SeatalkAlarmId | undefined
      if (path.startsWith('notifications.navigation.anchor')) {
        // There should be a better one but not supported by canboatjs yet
        alarmId = SeatalkAlarmId.DeepAnchor
      } else if (path.startsWith('notifications.mob')) {
        alarmId = SeatalkAlarmId.Mob
      }

      if (state && alarmId) {
        alarms.push({
          path,
          pgn: withPriority(
            new PGN_65288_SeatalkAlarm({
              sid: 1,
              alarmStatus: state,
              alarmId: alarmId,
              alarmGroup: SeatalkAlarmGroup.Instrument,
              alarmPriority: 1
              // The class sets Raymarine and Marine Industry itself.
            })
          )
        })
      }

      try {
        return alarms.map((alarm) => alarm.pgn)
      } catch (err) {
        console.error(err)
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
                    path: 'notifications.navigation.anchor',
                    value: {
                      state: 'alert',
                      method: ['sound']
                    }
                  }
                ]
              }
            ]
          }
        ],
        expected: [
          {
            prio: 2,
            pgn: 65288,
            dst: 255,
            fields: {
              'Manufacturer Code': 'Raymarine',
              'Industry Code': 'Marine Industry',
              SID: 1,
              'Alarm Status': 'Alarm condition met and not silenced',
              'Alarm ID': 'Deep Anchor',
              'Alarm Group': 'Instrument',
              'Alarm Priority': 1
            }
          }
        ]
      }
    ]
  }
}
