import { ServerAPI, Plugin, Delta, Update, PathValue, hasValues} from '@signalk/server-api'
import {
  PGN,
  PGN_126983,
  PGN_126985,
  AlertType,
  AlertCategory,
  AlertState
} from '@canboat/ts-pgns'

const alertTypes: {[key:string]: AlertType} = {
  "emergency":  AlertType.EmergencyAlarm,
  "alarm": AlertType.Alarm,
  "warn": AlertType.Warning,
  "alert": AlertType.Caution
}

const alertCategory = AlertCategory.Technical
const alertSystem = 5

let idCounter = 0
let ids: {[key:string]: number} = {}
let pgns: PGN[] = []

module.exports = (app:ServerAPI, plugin:Plugin) => {
  return {
    title: 'Notifications (126983, 126985)',
    optionKey: 'NOTIFICATIONS',
    keys: ["notifications.*"],
    context: 'vessels.self',
    'sourceType': 'subscription',
    callback: (delta:any): PGN[]|undefined => {

      const update = delta.updates[0].values[0]
      const value = update.value
      const type = alertTypes[value.state]

      //dont create a loop by sending out notifications we recieved from NMEA
      if (update.path.includes('notifications.nmea')) {
        return pgns
      }

      if (value.hasOwnProperty('alertId')) {
        const alertId = value.alertId
        app.debug(`Using existing alertId ${alertId} for ${update.path}`)

        //remove the pgns and reprocess them for changes
        pgns = pgns.filter(function(obj:any) {
          return obj.alertId !== alertId;
        });

        if (value.state !== 'normal') {

          const method = value.method || []
          let state: AlertState
          if (value.state === 'normal') {
            state = AlertState.Normal
          } else if (method.length == 0) {
            state = AlertState.Acknowledged
          } else if (method.indexOf('sound') === -1) {
              state = AlertState.Silenced
          } else {
            state = AlertState.Active
          }

          let idName = alertId.toString().padStart(16, '0')
          const pgn1 = new PGN_126985({
            alertId,
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
          })
          pgns.push(pgn1)

          const pgn2 = new PGN_126983({
            alertId,
            alertType: type,
            alertState: state,
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
            alertPriority: 0
          })
          pgns.push(pgn2)
        }
      } else {
        //add nmea2000 alert info so that the alarm can be silenced from a NMEA source
        let alertId: number
        if (ids[update.path] !== undefined) {
          alertId = ids[update.path]
          app.debug(`Assiging existing alertId ${alertId} to ${update.path}`)
        } else {
          alertId = ++idCounter
          ids[update.path] = alertId
          app.debug(`Assigning new alertId ${alertId} to ${update.path}`)
        }

        //send delta with alert details
        delta.updates[0].values[0].value.alertType = type
        delta.updates[0].values[0].value.alertCategory = alertCategory
        delta.updates[0].values[0].value.alertSystem = alertSystem
        delta.updates[0].values[0].value.alertId = alertId
        app.debug("New delta with alertId: " + JSON.stringify(delta))

        app.handleMessage(plugin.id, delta)
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
            "path":"notifications.environment.inside.refrigerator.temperature",
            "value": {
              "state": "alert",
              "message": "The Fridge Temperature is high",
              "alertId": 1
            }
          }
        ]}]
      }],
      expected: [{
        "prio": 3,
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
        "prio": 3,
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
