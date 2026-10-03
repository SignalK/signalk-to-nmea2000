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
const ids = {}
const activeAlerts = {}
let resendInterval = null

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
        return []
      }

      const pgns = []

      let alertId
      if (value.state !== 'normal' || ids[value.id] !== undefined) {
        let alertId
        if ( ids[value.id] === undefined ) {
          alertId = ++idCounter
          ids[value.id] = alertId
        } else {
          alertId = ids[value.id]
        }

        const method = value.method || []
        let state
        if (value.state === 'normal') {
          state = 'Normal'
        } else if (method.length == 0) {
          state = 'Acknowledged'
        } else if (method.indexOf('sound') === -1) {
          state = 'Silenced'
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
          'Alert Priority': 0,
          'Alert State': state
        })

        if (state === 'Active') {
          activeAlerts[value.id] = pgns
        } else {
          delete activeAlerts[value.id]
        }

        if (Object.keys(activeAlerts).length > 0) {
          if (resendInterval === null) {
            resendInterval = setInterval(() => {
              Object.values(activeAlerts).forEach(alertPgns => {
                alertPgns.forEach(pgn => {
                  app.emit('nmea2000JsonOut', pgn)
                })
              })
            }, 1000)
          }
        } else {
          if (resendInterval !== null) {
            clearInterval(resendInterval)
            resendInterval = null
          }
        }

        return pgns
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
