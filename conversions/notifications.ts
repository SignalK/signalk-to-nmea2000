import _ from 'lodash'
import {
  PGN_126983,
  PGN_126985,
  AlertType,
  AlertCategory,
  AlertState
} from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { withPriority } from '../pgn'

type AlertPgn = PGN_126983 | PGN_126985

const alertTypes: Record<string, AlertType> = {
  "emergency": AlertType.EmergencyAlarm,
  "alarm": AlertType.Alarm,
  "warn": AlertType.Warning,
  "alert": AlertType.Caution
}

const alertCategory = AlertCategory.Technical
const alertSystem = 5

// An unchanged alert is repeated no more often than this, so that a device
// joining the bus later still learns about it. NMEA 2000 sources repeat their
// notifications with every message, e.g. 26 of them twice a second for 127489.
const REPEAT_UNCHANGED_MS = 5000

// A cleared alert is sent as Normal along with the alerts for this long, so
// that a device that misses one message still learns that it is over.
const REPEAT_CLEARED_MS = 15000

module.exports = (app: App, plugin: Plugin): Conversion => {
  let idCounter = 0
  let ids: Record<string, number> = {}
  let pgns: AlertPgn[] = []
  let cleared: Record<number, { pgn: PGN_126983, until: number }> = {}
  let lastSent = 0

  return {
    title: 'Notifications (126983, 126985)',
    optionKey: 'NOTIFICATIONS',
    keys: ["notifications.*"],
    context: 'vessels.self',
    'sourceType': 'subscription',
    // Alerts received from the bus land in notifications.nmea.*, which the
    // callback skips, so sending one back cannot loop; alerts made from
    // other NMEA 2000 data (engine status, DSC) are new to the bus.
    preventsNmea2000Echo: true,
    callback: (delta: any): AlertPgn[] | undefined => {

      const update = delta.updates[0].values[0]
      const value = update.value
      const type = alertTypes[value.state]

      //dont create a loop by sending out notifications we recieved from NMEA
      if (update.path.includes('notifications.nmea')) {
        return []
      }

      // Nothing to alert on, and no alert of this path to clear
      if (value.state === 'normal' && ids[update.path] === undefined) {
        return []
      }

      let alertId = ids[update.path]
      if (alertId === undefined) {
        alertId = ++idCounter
        ids[update.path] = alertId
        app.debug(`Assigning new alertId ${alertId} to ${update.path}`)
      }

      const before = pgns.filter(obj => obj.fields.alertId === alertId)

      //remove the pgns and reprocess them for changes
      pgns = pgns.filter(function(obj) {
        return obj.fields.alertId !== alertId;
      });

      if (value.state !== 'normal') {
        delete cleared[alertId]

        const method = value.method || []
        let state: AlertState
        if (method.length == 0) {
          state = AlertState.Acknowledged
        } else if (method.indexOf('sound') === -1) {
          state = AlertState.Silenced
        } else {
          state = AlertState.Active
        }

        // The NAME as a 16-digit string, which the encoder writes as is.
        let idName = alertId.toString().padStart(16, '0') as unknown as number
        pgns.push(withPriority(new PGN_126985({
          alertId: alertId,
          alertType: type,
          alertCategory: alertCategory,
          alertSystem: alertSystem,
          alertSubSystem: 0,
          dataSourceNetworkIdName: idName,
          dataSourceInstance: 0,
          dataSourceIndexSource: 0,
          alertOccurrenceNumber: 0,
          languageId: 0,
          alertTextDescription: value.message
        })))
        pgns.push(withPriority(new PGN_126983({
          alertId: alertId,
          alertType: type,
          alertCategory: alertCategory,
          alertSystem: alertSystem,
          alertSubSystem: 0,
          dataSourceNetworkIdName: idName,
          dataSourceInstance: 0,
          dataSourceIndexSource: 0,
          alertOccurrenceNumber: 0,
          temporarySilenceStatus: value.method && value.method.indexOf('sound') === -1 ? 1 : 0,
          acknowledgeStatus: !value.method || value.method.length == 0 ? 1 : 0,
          escalationStatus: 0,
          temporarySilenceSupport: 1,
          acknowledgeSupport: 1,
          escalationSupport: 0,
          triggerCondition: 1,
          thresholdStatus: 1,
          alertPriority: 0,
          alertState: state
        })))
      } else {
        const active = before.find(obj => obj.pgn === 126983) as PGN_126983 | undefined
        if (active) {
          cleared[alertId] = {
            pgn: withPriority(new PGN_126983({
              ...active.fields,
              alertState: AlertState.Normal,
              temporarySilenceStatus: 0,
              acknowledgeStatus: 0
            })),
            until: Date.now() + REPEAT_CLEARED_MS
          }
        }
      }

      const after = pgns.filter(obj => obj.fields.alertId === alertId)
      if (_.isEqual(before, after) && Date.now() - lastSent < REPEAT_UNCHANGED_MS) {
        return []
      }
      lastSent = Date.now()

      try {
        const now = Date.now()
        cleared = _.pickBy(cleared, c => c.until > now)
        return pgns.concat(_.map(cleared, 'pgn'))
      } catch (err) {
        console.error(err)
      }
    },
    tests: [{
      input: [ {
        "context":"vessels.urn:mrn:imo:mmsi:367301250",
        "updates":[{"values":[
          {
            "path":"notifications.environment.inside.refrigerator.temperature",
            "value": {
              "state": "alert",
              "message": "The Fridge Temperature is high"
            }
          }
        ]}]
      }],
      expected: [{
        "prio": 2,
        "pgn": 126985,
        "dst": 255,
        "fields": {
          "Alert Type": "Caution",
          "Alert Category": "Technical",
          "Alert System": 5,
          "Alert Sub-System": 0,
          "Alert ID": 1,
          "Data Source Network ID NAME": 1,
          "Data Source Instance": 0,
          "Data Source Index-Source": 0,
          "Alert Occurrence Number": 0,
          "Language ID": "English (US)",
          "Alert Text Description": "The Fridge Temperature is high"
        }
      },{
        "prio": 2,
        "pgn": 126983,
        "dst": 255,
        "fields": {
          "Alert Type": "Caution",
          "Alert Category": "Technical",
          "Alert System": 5,
          "Alert Sub-System": 0,
          "Alert ID": 1,
          "Data Source Network ID NAME": 1,
          "Data Source Instance": 0,
          "Data Source Index-Source": 0,
          "Alert Occurrence Number": 0,
          "Temporary Silence Status": "No",
          "Acknowledge Status": "Yes",
          "Escalation Status": "No",
          "Temporary Silence Support": "Yes",
          "Acknowledge Support": "Yes",
          "Escalation Support": "No",
          "Trigger Condition": "Auto",
          "Threshold Status": "Threshold Exceeded",
          "Alert Priority": 0,
          "Alert State": "Acknowledged"
        }
      }]
    }]
  }
}
