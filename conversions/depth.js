const _ = require('lodash')

module.exports = (app, plugin) => {
  return {
    title: 'Depth (128267)',
    optionKey: 'DEPTHv2',
    pgns: [ 128267 ],
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
            SID: 0xff,
            Depth: belowTransducer,
            Offset: offset
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    }
  }
}

