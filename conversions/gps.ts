import _ from 'lodash'
import {
  PGN_129025,
  PGN_129029,
  PGN_129540,
  Gns,
  GnsMethod,
  GnsIntegrity
} from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { withPriority } from '../pgn'

// Signal K's navigation.gnss values, as nmea0183-signalk and n2k-signalk set
// them, mapped to the names canboat uses in 129029. A value without a match
// is sent as not available.
const gnssTypes: Record<string, string> = {
  GPS: 'GPS',
  GLONASS: 'GLONASS',
  'Combined GPS/GLONASS': 'GPS+GLONASS',
  Chayka: 'Chayka',
  'Integrated navigation system': 'integrated',
  Surveyed: 'surveyed',
  Galileo: 'Galileo',
  // canboat only
  'GPS+SBAS/WAAS': 'GPS+SBAS/WAAS',
  'GPS+SBAS/WAAS+GLONASS': 'GPS+SBAS/WAAS+GLONASS'
}

const methodQualities: Record<string, string> = {
  'no GPS': 'no GNSS',
  'GNSS Fix': 'GNSS fix',
  'DGNSS fix': 'DGNSS fix',
  'Precise GNSS': 'Precise GNSS',
  'RTK fixed integer': 'RTK Fixed Integer',
  'RTK float': 'RTK float',
  'Estimated (DR) mode': 'Estimated (DR) mode',
  'Manual input': 'Manual Input',
  'Simulator mode': 'Simulate mode'
}

const integrities: Record<string, string> = {
  'no Integrity checking': 'No integrity checking',
  Safe: 'Safe',
  Caution: 'Caution',
  Unsafe: 'Unsafe'
}

// n2k-signalk passes a canboat name through when it has no Signal K name for
// it, e.g. "GPS+SBAS/WAAS", so a canboat name is accepted as it is.
const lookup = (
  table: Record<string, string>,
  value: unknown
): string | undefined =>
  value == null
    ? undefined
    : table[value as string] ||
      (Object.values(table).includes(value as string)
        ? (value as string)
        : undefined)

// The GNSS values come with the fix and are only valid with it
const GNSS_TIMEOUT = 10000 // ms

// 129540 is a single fast packet, which holds at most 18 satellites
const MAX_SATELLITES = 18

interface Satellite {
  id?: number
  elevation?: number
  azimuth?: number
  SNR?: number
}

module.exports = (app: App, plugin: Plugin): Conversion[] => {
  var lastUpdate: Date | null = null
  var lastPosition: unknown = null

  return [
    {
      title: 'Location (129025,129029)',
      optionKey: 'GPS_LOCATIONv2',
      keys: [
        'navigation.position',
        'navigation.gnss.antennaAltitude',
        'navigation.gnss.type',
        'navigation.gnss.methodQuality',
        'navigation.gnss.integrity',
        'navigation.gnss.satellites',
        'navigation.gnss.horizontalDilution',
        'navigation.gnss.positionDilution',
        'navigation.gnss.geoidalSeparation',
        'navigation.gnss.differentialAge',
        'navigation.gnss.differentialReference'
      ],
      timeouts: [undefined, ..._.times(10, () => GNSS_TIMEOUT)],
      // Only a position from NMEA 2000 withholds 129025/129029. GNSS details
      // from NMEA 2000 come from another receiver, so they are left out.
      withholdingKeys: ['navigation.position'],
      callback: (
        position: { latitude: number; longitude: number } | null,
        altitude?: number | null,
        type?: string | null,
        methodQuality?: string | null,
        integrity?: string | null,
        satellites?: number | null,
        hdop?: number | null,
        pdop?: number | null,
        geoidalSeparation?: number | null,
        differentialAge?: number | null,
        differentialReference?: number | null
      ): (PGN_129025 | PGN_129029)[] => {
        if (position == null) {
          return []
        }

        var res: (PGN_129025 | PGN_129029)[] = []

        // The callback also runs when only a GNSS value changed; 129025 is sent
        // for a new position only.
        if (position !== lastPosition) {
          lastPosition = position
          res.push(
            withPriority(
              new PGN_129025({
                latitude: position.latitude,
                longitude: position.longitude
              })
            )
          )
        }

        if (
          lastUpdate == null ||
          new Date().getTime() - lastUpdate.getTime() > 1000
        ) {
          lastUpdate = new Date()

          var dateObj = new Date()
          var date = Math.trunc(dateObj.getTime() / 86400 / 1000)
          var time =
            dateObj.getUTCHours() * (60 * 60) +
            dateObj.getUTCMinutes() * 60 +
            dateObj.getUTCSeconds()

          const gnssType = lookup(gnssTypes, type)
          const hasReference = differentialReference != null

          res.push(
            withPriority(
              new PGN_129029({
                // Days since 1970, as canboatjs takes a DATE; ts-pgns types it
                // as the date string the decoder gives.
                date: date as unknown as string,
                time: time,
                latitude: position.latitude,
                longitude: position.longitude,
                altitude: altitude ?? undefined,
                gnssType: gnssType as Gns | undefined,
                // A position without a reported method is still a fix
                method: (methodQuality == null
                  ? 'GNSS fix'
                  : lookup(methodQualities, methodQuality)) as
                  GnsMethod | undefined,
                // Integrity is two bits, so "not available" would read as Unsafe
                integrity: (lookup(integrities, integrity) ||
                  'No integrity checking') as GnsIntegrity,
                numberOfSvs: satellites ?? undefined,
                hdop: hdop ?? undefined,
                pdop: pdop ?? undefined,
                geoidalSeparation: geoidalSeparation ?? undefined,
                referenceStations: hasReference ? 1 : 0,
                list: hasReference
                  ? [
                      {
                        referenceStationId: differentialReference ?? undefined,
                        ageOfDgnssCorrections: differentialAge ?? undefined
                      }
                    ]
                  : []
              })
            )
          )
        }
        return res
      },
      tests: [
        {
          input: [{ longitude: -75.487264, latitude: 32.0631296 }],
          expected: [
            {
              prio: 2,
              pgn: 129025,
              dst: 255,
              fields: {
                Latitude: 32.0631296,
                Longitude: -75.487264
              }
            },
            {
              __preprocess__: (testResult: any) => {
                //these change every time
                delete testResult.fields.Date
                delete testResult.fields.Time
              },
              prio: 2,
              pgn: 129029,
              dst: 255,
              fields: {
                Latitude: 32.0631296,
                Longitude: -75.487264,
                Method: 'GNSS fix',
                Integrity: 'No integrity checking',
                'Reference Stations': 0,
                list: []
              }
            }
          ]
        }
      ]
    },
    {
      title: 'GNSS Satellites in View (129540)',
      optionKey: 'GNSS_SATELLITES',
      keys: ['navigation.gnss.satellitesInView'],
      timeouts: [GNSS_TIMEOUT],
      callback: (
        satellitesInView?: { satellites?: (Satellite | null)[] } | null
      ): PGN_129540[] => {
        const satellites = (satellitesInView?.satellites || [])
          .filter((sat): sat is Satellite => sat != null && sat.id != null)
          .slice(0, MAX_SATELLITES)
        if (satellites.length == 0) {
          return []
        }
        return [
          withPriority(
            new PGN_129540({
              satsInView: satellites.length,
              list: satellites.map((sat) => ({
                prn: sat.id,
                elevation: sat.elevation ?? undefined,
                azimuth: sat.azimuth ?? undefined,
                snr: sat.SNR ?? undefined
              }))
            })
          )
        ]
      },
      tests: [
        {
          input: [
            {
              count: 2,
              satellites: [
                { id: 5, elevation: 0.7854, azimuth: 3.1416, SNR: 42 },
                { id: 12, elevation: 0.1745, azimuth: 1.0472, SNR: 30 }
              ]
            }
          ],
          expected: [
            {
              prio: 2,
              pgn: 129540,
              dst: 255,
              fields: {
                'Sats in View': 2,
                list: [
                  { PRN: 5, Elevation: 0.7854, Azimuth: 3.1416, SNR: 42 },
                  { PRN: 12, Elevation: 0.1745, Azimuth: 1.0472, SNR: 30 }
                ]
              }
            }
          ]
        },
        {
          input: [{ count: 0, satellites: [] }],
          expected: []
        }
      ]
    }
  ]
}
