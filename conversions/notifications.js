const _ = require('lodash')

const alertTypes = {
  "emergency": "Emergency Alarm",
  "alarm": "Alarm",
  "warn": "Warning",
  "alert": "Caution"
}

const alertCategory = 'Technical'
const alertSystem = 5

let idCounter = 0
let ids = {}
let pgns = []

module.exports = (app, plugin) => {
  return {
    title: 'Notifications (126983, 126985)',
    optionKey: 'NOTIFICATIONS',
    keys: ["notifications.*"],
    context: 'vessels.self',
    'sourceType': 'subscription',
    callback: (delta) => {

      const update = delta.updates[0].values[0]
      const value = update.value
      const type = alertTypes[value.state]

      //dont create a loop by sending out notifications we recieved from NMEA
      if (update.path.includes('notifications.nmea')) {
        return pgns
      }

      let alertId
      if (value.hasOwnProperty('alertId')) {
        alertId = value.alertId
        app.debug(`Using existing alertId ${alertId} for ${update.path}`)

        //remove the pgns and reprocess them for changes
        pgns = pgns.filter(function(obj) {
          return obj['Alert ID'] !== alertId;
        });

        if (value.state !== 'normal') {

          const method = value.method || []
          let state
          if (value.state === 'normal') {
            state = 'Normal'
          } else if (method.indexOf('sound') === -1) {
            state = 'Silenced'
          } else if (method.length == 0) {
            state = 'Acknowledged'
          } else {
            state = 'Active'
          }

          let idName = alertId.toString().padStart(16, '0')
          pgns.push({
            pgn: 126985,
            'Alert ID': alertId,
            'Alert Type': type,
            'Alert Category': alertCategory,
            'Alert System': alertSystem,
            'Alert Sub-System': 0,
            'Data Source Network ID NAME': idName,
            'Data Source Instance': 0,
            'Data Source Index-Source': 0,
            'Alert Occurrence Number': 0,
            'Language ID': 0,
            'Alert Text Description': value.message
          })
          pgns.push({
            pgn: 126983,
            'Alert ID': alertId,
            'Alert Type': type,
            'Alert State': state,
            'Alert Category': alertCategory,
            'Alert System': alertSystem,
            'Alert Sub-System': 0,
            'Data Source Network ID NAME': idName,
            'Data Source Instance': 0,
            'Data Source Index-Source': 0,
            'Alert Occurrence Number': 0,
            'Temporary Silence Status': value.method && value.method.indexOf('sound') === -1 ? 1 : 0,
            'Acknowledge Status': !value.method || value.method.length == 0 ? 1 : 0,
            'Escalation Status': 0,
            'Temporary Silence Support': 1,
            'Acknowledge Support': 1,
            'Escalation Support': 0,
            'Trigger Condition': 1,
            'Threshold Status': 1,
            'Alert Priority': 0
          })
        }
      } else {
        //add nmea2000 alert info so that the alarm can be silenced from a NMEA source
        if (ids[update.path] && ids[update.path].alertId) {
          alertId = ids[update.path].alertId
          app.debug(`Assiging existing alertId ${alertId} to ${update.path}`)
        } else {
          alertId = ++idCounter
          ids[update.path] = {
            "alertId": alertId
          }
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
    }
  }
}
