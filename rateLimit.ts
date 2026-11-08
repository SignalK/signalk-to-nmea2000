import { findMatchingDefinition, type Definition } from '@canboat/ts-pgns'

// Each PGN goes out no more often than canboat's transmission interval for
// it, whichever conversion or Signal K source it comes from. Messages that a
// reader on the bus can tell apart are limited apart: a PGN to another bus,
// or for another instance (another battery, tank or temperature). canboat
// marks the fields that tell them apart as its primary key; these PGNs have
// more fields that do so.
const MORE_KEY_FIELDS: Record<number, string[]> = {
  // True and magnetic heading come from separate conversions
  127250: ['reference'],
  // A fuel tank and a water tank can share an instance
  127505: ['type']
}

// A PGN as the conversions give it: a ts-pgns class, or a plain object
interface Pgn {
  pgn: number
  fields?: object
  getDefinition?: () => Definition
}

interface Stream {
  sentAt: number
  // The latest PGN that came too soon, sent when the interval ends
  pending?: { send: () => void; owner: unknown }
  timer?: ReturnType<typeof setTimeout>
}

function definitionOf(pgn: Pgn): Definition | undefined {
  try {
    return typeof pgn.getDefinition === 'function'
      ? pgn.getDefinition()
      : findMatchingDefinition(pgn as any)
  } catch {
    return undefined
  }
}

// The interval a PGN is limited to and the key of its stream, or undefined
// for a PGN that is not limited
export function streamOf(
  pgn: Pgn
): { interval: number; key: string } | undefined {
  const definition = definitionOf(pgn)
  const interval = definition?.TransmissionInterval
  if (
    definition === undefined ||
    interval === undefined ||
    interval <= 0 ||
    definition.TransmissionIrregular
  ) {
    return undefined
  }
  const keyFields = definition.Fields.filter(
    (field) => field.PartOfPrimaryKey
  ).map((field) => field.Id)
  keyFields.push(...(MORE_KEY_FIELDS[pgn.pgn] ?? []))
  const fields = (pgn.fields ?? pgn) as Record<string, unknown>
  const values = keyFields.map((id) => fields[id] ?? null)
  return {
    interval,
    key: `${definition.Id}${JSON.stringify(values)}`
  }
}

export interface RateLimiter {
  // Sends now, or when the stream's interval ends; a later PGN of the same
  // stream replaces one that is waiting. The owner can cancel what waits.
  send(pgn: Pgn, bus: string, send: () => void, owner?: unknown): void
  // Drops the PGNs of an owner that are waiting
  cancel(owner: unknown): void
  stop(): void
}

export function rateLimiter(now: () => number = () => Date.now()): RateLimiter {
  const streams = new Map<string, Stream>()

  function flush(stream: Stream) {
    stream.timer = undefined
    const pending = stream.pending
    if (pending) {
      stream.pending = undefined
      stream.sentAt = now()
      pending.send()
    }
  }

  return {
    send(pgn, bus, send, owner) {
      const limit = streamOf(pgn)
      if (limit === undefined) {
        send()
        return
      }
      const key = `${bus} ${limit.key}`
      const stream = streams.get(key)
      const at = now()
      if (stream === undefined || at - stream.sentAt >= limit.interval) {
        if (stream?.timer) {
          clearTimeout(stream.timer)
        }
        streams.set(key, { sentAt: at })
        send()
        return
      }
      stream.pending = { send, owner }
      if (stream.timer === undefined) {
        stream.timer = setTimeout(
          () => flush(stream),
          stream.sentAt + limit.interval - at
        )
      }
    },
    cancel(owner) {
      streams.forEach((stream) => {
        if (stream.pending && stream.pending.owner === owner) {
          stream.pending = undefined
        }
      })
    },
    stop() {
      streams.forEach((stream) => {
        if (stream.timer) {
          clearTimeout(stream.timer)
        }
      })
      streams.clear()
    }
  }
}
