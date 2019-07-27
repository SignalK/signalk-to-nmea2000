const { DateTime } = require('luxon')

module.exports = (app, plugin) => {
  return {
    title: 'System Time (126992 & 129033)',
    sourceType: 'timer',
    interval: 1000,
    optionKey: 'SYSTEM_TIMEv2',
    callback: (app) => {
      const now = DateTime.local()
      const startOfDay = now.startOf('day')

      // For 126992
      const date = Math.trunc(now.toMillis() / 86400 / 1000)
      const time =
          now.toUTC().hour * (60 * 60) +
          now.toUTC().minute * 60 +
          now.toUTC().second
      
      return [
        {
          pgn: 126992,
          Date: date,
          Time: time
        },
        {
          pgn: 129033,
          Date: Math.floor(now.toMillis() / 86400000), // Days since January 1, 1970
          Time: Math.floor(now.diff(startOfDay).as('seconds')), // Seconds since midnight
          'Local Offset': now.offset // Minutes (difference between UTC & local time?)
        }
      ]
    }
  }
}
