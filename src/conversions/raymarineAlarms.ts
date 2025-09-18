import { ServerAPI, Plugin, Delta, Update, PathValue, hasValues} from '@signalk/server-api'
import {
  PGN_65288_SeatalkAlarm,
  SeatalkAlarmStatus,
  SeatalkAlarmId,
  SeatalkAlarmGroup,
  ManufacturerCode,
  IndustryCode
} from '@canboat/ts-pgns'

let pgns: PGN_65288_SeatalkAlarm[] = []

module.exports = (app:ServerAPI, plugin:Plugin) => {
  return {
    title: 'Raymarine (Seatalk) Alarms (65288)',
    optionKey: 'RAYMARINE',
    keys: ['notifications.navigation.anchor',
           'notifications.mob'],
    context: 'vessels.self',
    sourceType: 'subscription',
    callback: (delta:any): PGN_65288_SeatalkAlarm[]|undefined => {

      const update = delta.updates[0].values[0]
      const path = update.path
      const value = update.value
      const type = value.state

      //dont create a loop by sending out notifications we recieved from NMEA
      if (path.includes('notifications.nmea')) {
        return pgns
      }

      // remove the pgns and reprocess them for changes
      pgns = pgns.filter(function(obj:any) {
        return obj.path !== path
      });

      let state: SeatalkAlarmStatus|undefined
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

      let alarmId: SeatalkAlarmId|undefined
      if (path.startsWith('notifications.navigation.anchor')) {
        // There should be a better one but not supported by canboatjs yet
        alarmId = SeatalkAlarmId.DeepAnchor
      } else if (path.startsWith('notifications.mob')) {
        alarmId = SeatalkAlarmId.Mob
      }

      if ((state) && (alarmId)) {
        const pgn = new PGN_65288_SeatalkAlarm({
	  sid: 1,
          alarmStatus: state,
          alarmId,
	  alarmGroup: SeatalkAlarmGroup.Instrument,
	  alarmPriority: 1,
        })
        ;(pgn as any).path = path
        pgns.push(pgn)
      }

      try {
        return pgns
      } catch (err) {
        console.error(err)
      }

    },
    tests: [{
      input: [ {
        "context":"vessels.urn:mrn:imo:mmsi:367301250",
        "updates":[{"values":[
          {
            "path":"notifications.navigation.anchor",
            "value": {
              "state": "alert",
              "method": [ "sound" ]
            }
          }
        ]}]
      }],
      expected: [{
        "__preprocess__": (testResult:any) => {
          //remove camelCase keys (MatchFields)
          delete testResult.fields.manufacturerCode
          delete testResult.fields.industryCode
        },
        "prio": 7,
        "pgn": 65288,
        "dst": 255,
        "fields": {
          "Manufacturer Code": "Raymarine",
          "Industry Code": "Marine Industry",
          "SID": 1,
          "Alarm Status": "Alarm condition met and not silenced",
          "Alarm ID": "Deep Anchor",
          "Alarm Group": "Instrument",
          "Alarm Priority": 1
        }
      }]
    }]
  }
}
