import {
  PGN_127233,
  MobStatus,
  MobPositionSource,
  DirectionReference
} from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'

// A person overboard raised in Signal K, sent as 127233 while it lasts. The
// server's MOB (POST /signalk/v2/api/notifications/mob) raises it at
// notifications.mob.<id>, with the vessel's position and the time; others
// raise notifications.mob itself.

// An active MOB is repeated this often, so that a device joining the bus
// later still learns about it.
const REPEAT_MS = 1000

// A cleared MOB is sent as not active for this long, so that a device that
// misses one message still learns that it is over.
const REPEAT_CLEARED_MS = 10000

interface Mob {
  emitterId: number
  value: any
  // When the MOB was cleared
  clearedAt?: number
}

const isMob = (path: string) =>
  path === 'notifications.mob' || path.startsWith('notifications.mob.')

const isActive = (value: any) =>
  value != null && value.state != null && value.state !== 'normal'

// Seconds since midnight UTC, and days since 1970, of an ISO timestamp
function timeOfDay(timestamp: unknown): number | undefined {
  const date = new Date(String(timestamp))
  if (timestamp == null || isNaN(date.getTime())) return undefined
  return (
    date.getUTCHours() * 3600 +
    date.getUTCMinutes() * 60 +
    date.getUTCSeconds() +
    date.getUTCMilliseconds() / 1000
  )
}

function daysSince1970(timestamp: unknown): string | undefined {
  const date = new Date(String(timestamp))
  if (timestamp == null || isNaN(date.getTime())) return undefined
  return Math.trunc(date.getTime() / 86400000) as unknown as string
}

const finite = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const selfValue = (app: App, path: string) => {
  const update = app.getSelfPath(path)
  return update && typeof update === 'object' && 'value' in update
    ? update.value
    : update
}

// What the tests check of a cleared MOB
const NOT_ACTIVE = {
  prio: 3,
  pgn: 127233,
  dst: 255,
  fields: {
    'MOB Emitter ID': 1,
    'Man Overboard Status': 'MOB Not Active'
  }
}
const notActiveOnly = (result: any) => {
  result.fields = {
    'MOB Emitter ID': result.fields['MOB Emitter ID'],
    'Man Overboard Status': result.fields['Man Overboard Status']
  }
}

module.exports = (app: App, plugin: Plugin): Conversion => {
  let mobs: Record<string, Mob> = {}
  let lastEmitterId = 0

  function pgns(): PGN_127233[] {
    const now = Date.now()
    Object.entries(mobs).forEach(([path, mob]) => {
      if (
        mob.clearedAt !== undefined &&
        now - mob.clearedAt > REPEAT_CLEARED_MS
      )
        delete mobs[path]
    })
    const mmsi = selfValue(app, 'mmsi')
    const cog = finite(selfValue(app, 'navigation.courseOverGroundTrue'))
    const sog = finite(selfValue(app, 'navigation.speedOverGround'))
    return Object.values(mobs).map(({ emitterId, value, clearedAt }) => {
      const position = value?.position
      const hasPosition =
        finite(position?.latitude) !== undefined &&
        finite(position?.longitude) !== undefined
      return new PGN_127233({
        mobEmitterId: emitterId,
        manOverboardStatus:
          clearedAt === undefined
            ? MobStatus.ManualOnBoardMobButtonActivation
            : MobStatus.MobNotActive,
        activationTime: timeOfDay(value?.createdAt),
        positionSource: MobPositionSource.PositionEstimatedByTheVessel,
        ...(hasPosition
          ? {
              positionDate: daysSince1970(value.createdAt),
              positionTime: timeOfDay(value.createdAt),
              latitude: position.latitude,
              longitude: position.longitude
            }
          : {}),
        cogReference: cog !== undefined ? DirectionReference.True : undefined,
        cog,
        sog,
        mmsiOfVesselOfOrigin: mmsi != null ? String(mmsi) : undefined!
      })
    })
  }

  return {
    title: 'Man Overboard (127233)',
    optionKey: 'MOB',
    pgn: 127233,
    conversions: (): Conversion[] => {
      mobs = {}
      return [
        {
          keys: ['notifications.mob*'],
          context: 'vessels.self',
          sourceType: 'subscription',
          callback: (delta: any): PGN_127233[] | null => {
            let changed = false
            ;(delta.updates || []).forEach((update: any) =>
              (update.values || []).forEach(
                ({ path, value }: { path: string; value: any }) => {
                  if (!isMob(path)) return
                  const mob = mobs[path]
                  if (isActive(value)) {
                    mobs[path] = {
                      emitterId: mob?.emitterId ?? ++lastEmitterId,
                      value
                    }
                    changed = true
                  } else if (mob && mob.clearedAt === undefined) {
                    mob.clearedAt = Date.now()
                    changed = true
                  }
                }
              )
            )
            return changed ? pgns() : null
          },
          tests: [
            {
              input: [
                {
                  updates: [
                    {
                      values: [
                        {
                          path: 'notifications.mob.8a5f3c1e',
                          value: {
                            state: 'emergency',
                            method: ['visual', 'sound'],
                            message: 'Person Overboard!',
                            position: { latitude: 52.37, longitude: 4.89 },
                            createdAt: '2026-11-05T18:30:15.000Z'
                          }
                        }
                      ]
                    }
                  ]
                }
              ],
              expected: [
                {
                  prio: 3,
                  pgn: 127233,
                  dst: 255,
                  fields: {
                    'MOB Emitter ID': 1,
                    'Man Overboard Status':
                      'Manual on-board MOB Button Activation',
                    'Activation Time': 66615,
                    'Position Source': 'Position estimated by the vessel',
                    'Position Date': '2026.11.05',
                    'Position Time': 66615,
                    Latitude: 52.37,
                    Longitude: 4.89
                  }
                }
              ]
            },
            {
              // Another notification sends nothing
              input: [
                {
                  updates: [
                    {
                      values: [
                        {
                          path: 'notifications.mobile',
                          value: { state: 'alarm' }
                        }
                      ]
                    }
                  ]
                }
              ],
              expected: []
            },
            {
              // Cleared: sent as not active
              input: [
                {
                  updates: [
                    {
                      values: [
                        {
                          path: 'notifications.mob.8a5f3c1e',
                          value: null
                        }
                      ]
                    }
                  ]
                }
              ],
              expected: [{ __preprocess__: notActiveOnly, ...NOT_ACTIVE }]
            }
          ]
        },
        {
          sourceType: 'timer',
          interval: REPEAT_MS,
          callback: (): PGN_127233[] | null =>
            Object.keys(mobs).length > 0 ? pgns() : null,
          tests: [
            {
              // The cleared MOB above is repeated for a while
              input: [{}],
              expected: [{ __preprocess__: notActiveOnly, ...NOT_ACTIVE }]
            }
          ]
        }
      ]
    }
  }
}
