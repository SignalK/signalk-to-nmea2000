const { pgnToActisenseSerialFormat, FromPgn } = require("@canboat/canboatjs");
const path = require('path')
const fs = require('fs')
const chai = require('chai')
chai.Should()
//chai.use(require('chai-things'))
chai.use(require('chai-json-equal'));

const parser = new FromPgn()

function load_conversions (app, plugin) {
  fpath = path.join(__dirname, '../conversions')
  files = fs.readdirSync(fpath)
  return files.map(fname => {
    pgn = path.basename(fname, '.js')
    let c = require(path.join(fpath, pgn))(app, plugin);
    if ( !Array.isArray(c) ) {
      c = [ c ]
      return c
    }
  }).filter(converter => { return typeof converter !== 'undefined'; });
}

const conversions = load_conversions()

describe('conversions work', () => {
  conversions.forEach(conversionArray => {
    conversionArray.forEach(conversion => {
      if ( conversion.tests ) {
        conversion.tests.forEach((test, idx) => {
          it(`${conversion.title} test # ${idx} works`, function (done) {
            let results = conversion.callback.call(null, ...test.input)
            results.forEach((res, i) => {
              let encoded = pgnToActisenseSerialFormat(res)
              let pgn = parser.parseString(encoded)
              delete pgn.description
              delete pgn.src
              delete pgn.timestamp
              delete pgn.input
              //console.log(JSON.stringify(pgn, null, 2))
              pgn.should.jsonEqual(test.expected[i])
            })
            done()
          })
        })
      }
    })
  })
  
})
      
