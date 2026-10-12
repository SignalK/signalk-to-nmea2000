const _ = require('lodash')

// The AC values per phase, as the Signal K specification defines them for
// electrical.ac.<id>.phase.<phase> and electrical.inverters.<id>.ac
const acKeys = [
  'lineNeutralVoltage',
  'current',
  'frequency',
  'realPower',
  'reactivePower',
  'powerFactor'
]

// A phase of an AC bus is "single", or A, B and C; in NMEA 2000 they are
// lines 1 to 3
const phases = [ 'single', 'A', 'B', 'C' ]

const AC_TIMEOUT = 10000  // ms

const idsUnder = (app, path) =>
  typeof app.getSelfPath === 'function'
    ? Object.keys(app.getSelfPath(path) || {}).filter(id => id !== 'meta')
    : []

const mappingProperty = (title, idTitle, idDescription, ids) => ({
  title,
  type: 'array',
  items: {
    type: 'object',
    properties: {
      signalkId: {
        title: idTitle,
        description: idDescription,
        type: 'string',
        examples: ids
      },
      instanceId: {
        title: 'NMEA2000 AC Instance Id',
        type: 'number'
      }
    }
  }
})

// One line of 127503/127504 from the values of a phase, or null without any
const acLine = (line, [voltage, current, frequency, realPower, reactivePower, powerFactor]) => {
  if ( [voltage, current, frequency, realPower, reactivePower, powerFactor].every(v => v == null) ) {
    return null
  }
  return {
    'Line': line,
    'Voltage': voltage ?? undefined,
    'Current': current ?? undefined,
    'Frequency': frequency ?? undefined,
    'Real Power': realPower ?? undefined,
    'Reactive Power': reactivePower ?? undefined,
    'Power factor': powerFactor ?? undefined
  }
}

module.exports = (app, plugin) => {
  return [{
    title: 'AC Input (127503 & 127744)',
    optionKey: 'AC_INPUT',
    context: 'vessels.self',
    properties: () => ({
      buses: mappingProperty(
        'AC Bus Mapping',
        'Signal K AC bus id',
        'Pick an AC bus id currently present under electrical.ac or enter one manually',
        idsUnder(app, 'electrical.ac')
      ),
      phaseA: {
        title: 'Also send 127744 (AC Power / Current - Phase A)',
        description: 'For displays that read the current and power of phase A (or a single phase) from 127744',
        type: 'boolean',
        default: false
      }
    }),

    testOptions: {
      AC_INPUT: {
        buses: [{ signalkId: 'shore', instanceId: 2 }],
        phaseA: true
      }
    },

    conversions: (options) => {
      if ( !_.get(options, 'AC_INPUT.buses') ) {
        return null
      }
      return options.AC_INPUT.buses.map(bus => {
        const keys = phases.flatMap(phase =>
          acKeys.map(key => `electrical.ac.${bus.signalkId}.phase.${phase}.${key}`))
        return {
          keys,
          timeouts: keys.map(() => AC_TIMEOUT),
          callback: (...values) => {
            const byPhase = _.chunk(values, acKeys.length)
            const single = acLine('Line 1', byPhase[0])
            const threePhase = [
              acLine('Line 1', byPhase[1]),
              acLine('Line 2', byPhase[2]),
              acLine('Line 3', byPhase[3])
            ]
            // A bus is either single phase or has phases A to C
            const lines = threePhase.some(line => line) ? threePhase.filter(line => line) : [ single ].filter(line => line)
            if ( lines.length == 0 ) {
              return []
            }

            const res = [{
              pgn: 127503,
              'Instance': bus.instanceId,
              'Number of Lines': lines.length,
              // Signal K has no acceptability; this two-bit field reads as
              // "Good" when it is not set
              list: lines
            }]

            const phaseA = lines.find(line => line.Line == 'Line 1')
            if ( options.AC_INPUT.phaseA && phaseA ) {
              res.push({
                pgn: 127744,
                'Connection Number': bus.instanceId,
                'AC RMS Current': phaseA.Current,
                'Power': phaseA['Real Power']
              })
            }
            return res
          },
          tests: [{
            // single phase shore power
            input: [ 230.1, 12.3, 50, 2800, 150, 0.98, ..._.times(18, () => null) ],
            expected: [{
              "prio": 2,
              "pgn": 127503,
              "dst": 255,
              "fields": {
                "Instance": 2,
                "Number of Lines": 1,
                "list": [{
                  "Line": "Line 1",
                  "Acceptability": "Good",
                  "Voltage": 230.1,
                  "Current": 12.3,
                  "Frequency": 50,
                  "Real Power": 2800,
                  "Reactive Power": 150,
                  "Power factor": 0.98
                }]
              }
            }, {
              "prio": 2,
              "pgn": 127744,
              "dst": 255,
              "fields": {
                "Connection Number": 2,
                "AC RMS Current": 12.3,
                "Power": 2800
              }
            }]
          }, {
            // three phases, with only voltage and current
            input: [
              ..._.times(6, () => null),
              400.1, 5.1, null, null, null, null,
              400.2, 5.2, null, null, null, null,
              400.3, 5.3, null, null, null, null
            ],
            expected: [{
              "prio": 2,
              "pgn": 127503,
              "dst": 255,
              "fields": {
                "Instance": 2,
                "Number of Lines": 3,
                "list": [
                  { "Line": "Line 1", "Acceptability": "Good", "Voltage": 400.1, "Current": 5.1 },
                  { "Line": "Line 2", "Acceptability": "Good", "Voltage": 400.2, "Current": 5.2 },
                  { "Line": "Line 3", "Acceptability": "Good", "Voltage": 400.3, "Current": 5.3 }
                ]
              }
            }, {
              "prio": 2,
              "pgn": 127744,
              "dst": 255,
              "fields": {
                "Connection Number": 2,
                "AC RMS Current": 5.1
              }
            }]
          }, {
            // nothing known
            input: _.times(24, () => null),
            expected: []
          }]
        }
      })
    }
  }, {
    title: 'AC Output (127504)',
    optionKey: 'AC_OUTPUT',
    context: 'vessels.self',
    properties: () => ({
      inverters: mappingProperty(
        'Inverter Mapping',
        'Signal K inverter id',
        'Pick an inverter id currently present under electrical.inverters or enter one manually',
        idsUnder(app, 'electrical.inverters')
      )
    }),

    testOptions: {
      AC_OUTPUT: {
        inverters: [{ signalkId: 'main', instanceId: 1 }]
      }
    },

    conversions: (options) => {
      if ( !_.get(options, 'AC_OUTPUT.inverters') ) {
        return null
      }
      return options.AC_OUTPUT.inverters.map(inverter => {
        const keys = acKeys.map(key => `electrical.inverters.${inverter.signalkId}.ac.${key}`)
        return {
          keys,
          timeouts: keys.map(() => AC_TIMEOUT),
          callback: (...values) => {
            const line = acLine('Line 1', values)
            if ( !line ) {
              return []
            }
            return [{
              pgn: 127504,
              'Instance': inverter.instanceId,
              'Number of Lines': 1,
              list: [ line ]
            }]
          },
          tests: [{
            input: [ 229.8, 4.2, 50.01, 950, null, 0.95 ],
            expected: [{
              "prio": 2,
              "pgn": 127504,
              "dst": 255,
              "fields": {
                "Instance": 1,
                "Number of Lines": 1,
                "list": [{
                  "Line": "Line 1",
                  "Voltage": 229.8,
                  "Current": 4.2,
                  "Frequency": 50.01,
                  "Real Power": 950,
                  "Power factor": 0.95
                }]
              }
            }]
          }, {
            input: [ null, null, null, null, null, null ],
            expected: []
          }]
        }
      })
    }
  }]
}
