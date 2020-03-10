const _ = require('lodash')

const alertTypes = {
  "emergency": "Emergency Alarm",
  "alarm": "Alarm",
  "warn": "Warning",
  "alert": "Caution"
}

let idCounter = 0

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
      if ( ! type || update.pgn ) {
        return
      }

      const method = value.method || []
      let state
      if ( value.state === 'normal' ) {
        state = 'Normal'
      } else if ( method.indexOf('sound') === -1 ) {
        state = 'Silenced'
      } else if ( method.length == 0 ) {
        state = 'Acknowledged'
      } else {
        state = 'Active'
      }

      idCounter++
      
      try {
        return [
          {
            pgn: 126985,
            'Alert ID': idCounter,
            'Alert Type': type,
            'Alert Category': 'Technical',
            'Alert System': 5,
            'Alert Sub-System': 0,
            'Data Source Network ID NAME': 166725416,
            'Data Source Instance': 0,
            'Data Source Index-Source': 0,
            'Alert Occurrence Number': 0,
            'Language ID': 0,
            'Alert Text Description': value.message
          },
          {
            pgn: 126983,
            'Alert ID': idCounter,
            'Alert Type': type,
            'Alert State': state,
            'Alert Category': 'Technical',
            'Alert System': 5,
            'Alert Sub-System': 0,
            'Data Source Network ID NAME': 166725416,
            'Data Source Instance': 0,
            'Data Source Index-Source': 0,
            'Alert Occurrence Number': 0,
            'Temporary Silence Status': value.method && value.method.indexOf('sound') === -1 ? 1 : 0,
            'Acknowledge Status': !value.method ||  value.method.length == 0 ? 1 : 0,
            'Escalation Status': 0,
            'Temporary Silence Support': 1,
            'Acknowledge Support': 1,
            'Escalation Support': 0,
            'Trigger Condition': 1,
            'Threshold Status': 1,
            'Alert Priority': 0
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    }
  }
}

