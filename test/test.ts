import { pgnToActisenseSerialFormat, FromPgn } from '@canboat/canboatjs'
import path from 'path'
import fs from 'fs'
import chai from 'chai'
import type { Conversion, ConversionTest } from '../types'
import type { PluginOptions } from '../schema'
const assert: Chai.AssertStatic = chai.assert
chai.should()
//chai.use(require('chai-things'))
chai.use(require('chai-json-equal'))

// A PGN decoded with display names, which the ts-pgns types don't have
function normalizeMmsi(pgn: any) {
  const fields = pgn && pgn.fields
  if (fields && typeof fields['User ID'] === 'number') {
    fields['User ID'] = String(fields['User ID']).padStart(9, '0')
  }
}

// Reserved and spare fields are filled in by the encoder, not by the
// conversions, so compare without them.
function dropReservedAndSpare(pgn: any) {
  const fields = pgn && pgn.fields
  if (fields) {
    Object.keys(fields)
      .filter((key) => /^(Reserved|Spare)\d*$/i.test(key))
      .forEach((key) => delete fields[key])
  }
}

const parser = new FromPgn({ useCamel: false })

let skSelfData: Record<string, unknown> = {}
let skData: Record<string, unknown> = {}

const app = {
  getSelfPath: (path: string) => {
    return skSelfData[path]
  },
  getPath: (path: string) => {
    return skData[path]
  },
  debug: (msg: unknown) => {}
}

function load_conversions(): (Conversion | Conversion[])[] {
  const fpath = path.join(__dirname, '../dist/conversions')
  const files = fs.readdirSync(fpath).filter((fname) => fname.endsWith('.js'))
  return files
    .map((fname) => {
      const pgn = path.basename(fname, '.js')
      return require(path.join(fpath, pgn))(app, {})
    })
    .filter((converter) => {
      return typeof converter !== 'undefined'
    })
}

const conversions = load_conversions()

// Test options are untyped: each conversion's are written for its own schema
function subConversionsOf(conversion: Conversion, options: unknown) {
  const sub = conversion.conversions
  if (typeof sub === 'undefined') {
    return [conversion]
  }
  return typeof sub === 'function' ? sub(options as PluginOptions) : sub
}

describe('every conversion has a test', () => {
  conversions.forEach((conversion) => {
    if (!Array.isArray(conversion)) {
      conversion = [conversion]
    }

    conversion.forEach((conversion) => {
      it(`${conversion.title} has a test`, function (done) {
        const subConversions = subConversionsOf(
          conversion,
          Array.isArray(conversion.testOptions)
            ? conversion.testOptions[0]
            : conversion.testOptions
        )
        assert(subConversions != undefined)
        subConversions!.forEach((subConv) => {
          subConv!.should.have.property('tests')
        })
        done()
      })
    })
  })
})

describe('conversions work', () => {
  conversions.forEach((conversion) => {
    if (!Array.isArray(conversion)) {
      conversion = [conversion]
    }

    conversion.forEach((conversion) => {
      let optionsList: unknown[] = Array.isArray(conversion.testOptions)
        ? conversion.testOptions
        : [conversion.testOptions]

      optionsList.forEach((options, oidx) => {
        const subConversions = subConversionsOf(conversion, options || {})
        subConversions!.forEach((subConv) => {
          if (subConv?.tests) {
            subConv.tests.forEach((test: ConversionTest, idx: number) => {
              it(`${conversion.title} test # ${oidx}/${idx} works`, function (done) {
                skData = test.skData || {}
                skSelfData = test.skSelfData || {}
                let result = subConv.callback!.call(null, ...test.input!)
                Promise.resolve(result).then((results: any) => {
                  results = results || []
                  Promise.all(results as unknown[]).then((pgns) => {
                    let error
                    assert.equal(
                      pgns.length,
                      test.expected!.length,
                      'number of results returned does not match the number of expected results'
                    )
                    pgns.forEach((res, idx) => {
                      try {
                        let encoded = pgnToActisenseSerialFormat(res as any)
                        let pgn: any = parser.parseString(encoded!)
                        delete pgn.description
                        delete pgn.src
                        delete pgn.timestamp
                        delete pgn.input
                        delete pgn.id

                        let expected: any = test.expected![idx]
                        if (typeof expected === 'function') {
                          expected = expected(options)
                        }
                        let preprocess = expected['__preprocess__']
                        if (preprocess) {
                          preprocess(pgn)
                          delete expected['__preprocess__']
                        }
                        //console.log('parsed: ' + JSON.stringify(pgn, null, 2))
                        // canboatjs decodes an MMSI as a 9-digit string from
                        // canboat/canboatjs#394 on, as a number before; compare
                        // it as the string either way.
                        normalizeMmsi(pgn)
                        normalizeMmsi(expected)
                        dropReservedAndSpare(pgn)
                        pgn.should.jsonEqual(expected)
                      } catch (e) {
                        error = e
                      }
                    })
                    done(error)
                  })
                })
              })
            })
          }
        })
      })
    })
  })
})
