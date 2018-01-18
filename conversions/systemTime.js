const Concentrate2 = require("concentrate2");

module.exports = (app, plugin) => {
  return {
    title: 'System Time (126992)',
    type: 'timer',
    interval: 1000,
    optionKey: 'SYSTEM_TIME',
    callback: (app) => {
      var dateObj = new Date();
      var date = Math.trunc(dateObj.getTime() / 86400 / 1000);
      var time =
          dateObj.getUTCHours() * (60 * 60) +
          dateObj.getUTCMinutes() * 60 +
          dateObj.getUTCSeconds();
      time = time * 10000;
      
      return [
        {
          pgn: 126992,
          buffer: Concentrate2()
            .uint8(0xff)
            .uint8(0xff)
            .uint16(date)
            .uint32(time)
            .result()
        }
      ]
    }
  }
}
