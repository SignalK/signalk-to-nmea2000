
module.exports = (app, plugin) => {
  return {
    title: 'System Time (126992)',
    sourceType: 'timer',
    interval: 1000,
    optionKey: 'SYSTEM_TIMEv2',
    callback: (app, date) => {
      var dateObj = date ? date : new Date();
      var date = Math.trunc(dateObj.getTime() / 86400 / 1000);
      var time =
          dateObj.getUTCHours() * (60 * 60) +
          dateObj.getUTCMinutes() * 60 +
          dateObj.getUTCSeconds();
      
      return [
        {
          pgn: 126992,
          Date: date,
          Time: time
        }
      ]
    },
    tests: [{
      input: [ undefined, new Date('2017-04-15T14:59:53.123Z') ],
      expected: [{
        "prio": 2,
        "pgn": 126992,
        "dst": 255,
        "fields": {
          "Date": "2017.04.15",
          "Time": "14:59:53"
        }
      }]
    }]
  }
}
