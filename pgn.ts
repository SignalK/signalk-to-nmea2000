import { PGN } from '@canboat/ts-pgns'

/**
 * A ts-pgns PGN sent at `prio`. The classes take the PGN's default priority
 * from canboat; the plugin has always sent 2 unless a conversion said
 * otherwise, and keeps doing so.
 */
export function withPriority<T extends PGN> (pgn: T, prio = 2): T {
  pgn.prio = prio
  return pgn
}
