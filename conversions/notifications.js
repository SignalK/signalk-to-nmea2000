const _ = require('lodash')

const alertTypes = {
  "emergency": "Emergency Alarm",
  "alarm": "Alarm",
  "warn": "Warning",
  "alert": "Caution"
}

const alertCategory = 'Technical'
const alertSystem = 5

// An unchanged alert is repeated no more often than this, so that a device
// joining the bus later still learns about it. NMEA 2000 sources repeat their
// notifications with every message, e.g. 26 of them twice a second for 127489.
const REPEAT_UNCHANGED_MS = 5000

module.exports = (app, plugin) => {
  let idCounter = 0
  let ids = {}
  let pgns = []
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
    callback: (delta) => {

      const update = delta.updates[0].values[0]
      const value = update.value
      const type = alertTypes[value.state]

      //dont create a loop by sending out notifications we recieved from NMEA
      if (update.path.includes('notifications.nmea')) {
        return []
      }

      let alertId
      if (value.hasOwnProperty('alertId')) {
        alertId = value.alertId
        app.debug(`Using existing alertId ${alertId} for ${update.path}`)

        const before = pgns.filter(obj => obj['Alert ID'] === alertId)

        //remove the pgns and reprocess them for changes
        pgns = pgns.filter(function(obj) {
          return obj['Alert ID'] !== alertId;
        });

        if (value.state !== 'normal') {

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
        }

        const after = pgns.filter(obj => obj['Alert ID'] === alertId)
        if (_.isEqual(before, after) && Date.now() - lastSent < REPEAT_UNCHANGED_MS) {
          return []
        }
        lastSent = Date.now()
      } else {
        // Nothing to alert on, and no alert of this path to clear
        if (value.state === 'normal' && !ids[update.path]) {
          return []
        }

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

        // The PGNs are sent for this delta, which comes back with the alertId
        app.handleMessage(plugin.id, delta)
        return []
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
