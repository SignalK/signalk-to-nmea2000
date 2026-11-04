import chai from 'chai'
const assert: Chai.AssertStatic = chai.assert
import { FromPgn, pgnToActisenseSerialFormat } from '@canboat/canboatjs'
import type { Conversion } from '../types'

// Each engine notification, as n2k-signalk names it, and the discrete status
// it sets in 127489, as canboat names it. Written out here rather than taken
// from the conversion, so a mix-up in the conversion's table fails.
const STATUSES: [string, 'Discrete Status 1' | 'Discrete Status 2', string][] =
  [
    ['checkEngine', 'Discrete Status 1', 'Check Engine'],
    ['overTemperature', 'Discrete Status 1', 'Over Temperature'],
    ['lowOilPressure', 'Discrete Status 1', 'Low Oil Pressure'],
    ['lowOilLevel', 'Discrete Status 1', 'Low Oil Level'],
    ['lowFuelPressure', 'Discrete Status 1', 'Low Fuel Pressure'],
    ['lowSystemVoltage', 'Discrete Status 1', 'Low System Voltage'],
    ['lowCoolantLevel', 'Discrete Status 1', 'Low Coolant Level'],
    ['waterFlow', 'Discrete Status 1', 'Water Flow'],
    ['waterInFuel', 'Discrete Status 1', 'Water In Fuel'],
    ['chargeIndicator', 'Discrete Status 1', 'Charge Indicator'],
    ['preheatIndicator', 'Discrete Status 1', 'Preheat Indicator'],
    ['highBoostPressure', 'Discrete Status 1', 'High Boost Pressure'],
    ['revLimitExceeded', 'Discrete Status 1', 'Rev Limit Exceeded'],
    ['eGRSystem', 'Discrete Status 1', 'EGR System'],
    ['throttlePositionSensor', 'Discrete Status 1', 'Throttle Position Sensor'],
    ['emergencyStopMode', 'Discrete Status 1', 'Emergency Stop'],
    ['warningLevel1', 'Discrete Status 2', 'Warning Level 1'],
    ['warningLevel2', 'Discrete Status 2', 'Warning Level 2'],
    ['powerReduction', 'Discrete Status 2', 'Power Reduction'],
    ['maintenanceNeeded', 'Discrete Status 2', 'Maintenance Needed'],
    ['commError', 'Discrete Status 2', 'Engine Comm Error'],
    [
      'subOrSecondaryThrottle',
      'Discrete Status 2',
      'Sub or Secondary Throttle'
    ],
    ['neutralStartProtect', 'Discrete Status 2', 'Neutral Start Protect'],
    ['shuttingDown', 'Discrete Status 2', 'Engine Shutting Down']
  ]

describe('Engine Parameters 127489 discrete status', function () {
  const app: any = { debug: () => {}, getSelfPath: () => undefined }
  const conversions: Conversion[] =
    require('../dist/conversions/engineParameters')(app, {})
  const engine = conversions.find((c) => c.optionKey === 'ENGINE_PARAMETERS')!
  const dynamic = (engine.conversions as (options: unknown) => Conversion[])({
    ENGINE_PARAMETERS: { engines: [{ signalkId: 'port', instanceId: 0 }] }
  }).find((c) => (c.keys as string[]).includes('propulsion.port.oilPressure'))!
  const keys = dynamic.keys as string[]
  // Decoded with display names, which the ts-pgns types don't have
  const parser = new FromPgn({ useCamel: false })

  // The decoded 127489 with only the given notification active
  function sendWithAlarm(path: string): any {
    const inputs = keys.map((key) => (key === path ? { state: 'alarm' } : null))
    const [pgn] = dynamic.callback!(...inputs) as any[]
    return parser.parseString(pgnToActisenseSerialFormat(pgn)!)!.fields
  }

  it('reads all 24 notifications', function () {
    const statusKeys = keys.filter((key) => key.startsWith('notifications.'))
    assert.sameMembers(
      statusKeys,
      STATUSES.map(([key]) => `notifications.propulsion.port.${key}`)
    )
  })

  STATUSES.forEach(([key, field, status]) => {
    it(`sets ${status} for ${key}`, function () {
      const fields = sendWithAlarm(`notifications.propulsion.port.${key}`)
      const other =
        field === 'Discrete Status 1'
          ? 'Discrete Status 2'
          : 'Discrete Status 1'
      assert.deepEqual(fields[field], [status])
      assert.deepEqual(fields[other], [])
    })
  })
})
