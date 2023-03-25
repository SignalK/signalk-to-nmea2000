const _ = require('lodash')


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

      // remove the pgns and reprocess them for changes
      pgns = pgns.filter(function(obj) {
        return obj['path'] !== path
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
	  'path': path,
	  'SID': 1,
          'Alarm Status': state,
          'Alarm ID': alarmId,
	  'Alarm Group': 'Instrument',
	  'Alarm Priority': 1,
	  'Manufacturer Code': 'Raymarine',
	  'Industry Code': 'Marine Industry'
        })
      }

      try {
        return pgns
      } catch (err) {
        console.error(err)
      }

    }
  }
}
