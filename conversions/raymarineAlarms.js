const _ = require('lodash')

const alertCategory = 'Technical'
const alertSystem = 5

let idCounter = 0
let ids = {}
let pgns = []

module.exports = (app, plugin) => {
  return {
    title: 'Raymarine (Seatalk) Alarms (65288)',
    optionKey: 'RAYMARINE',
    keys: ['notifications.navigation.anchor',
           'notifications.mob'],
    context: 'vessels.self',
    sourceType: 'subscription',
    callback: (delta) => {

      const update = delta.updates[0].values[0]
      const path = update.path
      const value = update.value
      const type = value.state

      //dont create a loop by sending out notifications we recieved from NMEA
      if (path.includes('notifications.nmea')) {
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

        let state
        const method = value.method || []
        if (value.state == 'normal') {
          if (method.indexOf('sound') != -1) {
            state = 'Alarm condition not met'
	  }
	} else {
          if (method.indexOf('sound') == -1) {
            state = 'Alarm condition met and silenced'
          } else {
            state = 'Alarm condition met and not silenced'
          }
        }

	let alarmId
	if (path.startsWith('notifications.navigation.anchor')) {
	  // There should be a better one but not supported by canboatjs yet
	  alarmId = 'Deep Anchor'
	} else if (path.startsWith('notifications.mob')) {
	  alarmId = 'MOB'
	}
	if ((state) && (alarmId)) {
          pgns.push({
            'pgn': 65288,
	    'Alert ID': alertId,
	    'SID': 1,
            'Alarm Status': state,
            'Alarm ID': alarmId,
	    'Alarm Group': 'Instrument',
	    'Alarm Priority': 1,
	    'Manufacturer Code': 'Raymarine',
	    'Industry Code': 'Marine Industry'
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
