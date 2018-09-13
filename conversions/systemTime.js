const Concentrate2 = require("concentrate2");

module.exports = (app, plugin) => {
  return {
    title: 'System Time (126992)',
    pgns: [ 126992 ],
    sourceType: 'timer',
    interval: 1000,
    optionKey: 'SYSTEM_TIMEv2',
    callback: (app) => {
      var dateObj = new Date();
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
    }
  }
}
