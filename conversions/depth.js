const Concentrate = require("concentrate");
const _ = require('lodash')

module.exports = (app, plugin) => {
  return {
    title: 'Depth (128267)',
    type: 'toN2K',
    optionKey: 'DEPTH',
    keys: ["environment.depth.belowTransducer"],
    callback: (belowTransducer) => {
      var surfaceToTransducer = _.get(app.signalk.self,
                                      'environment.depth.surfaceToTransducer.value')
      var transducerToKeel = _.get(app.signalk.self,
                                   'environment.depth.transducerToKeel.value')
      var offset = _.isUndefined(surfaceToTransducer) ? (_.isUndefined(transducerToKeel) ? 0 : transducerToKeel) : surfaceToTransducer
      try {
        return [
          {
            pgn: 128267,
            buffer: Concentrate()
              .uint8(0xff)
              .uint32(belowTransducer * 100)
              .uint16(offset * 1000)
              .result()
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    }
  }
}

