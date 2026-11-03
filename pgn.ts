import { PGN } from '@canboat/ts-pgns'

/**
 * A ts-pgns PGN sent at `prio`. The classes take the PGN's default priority
 * from canboat; the plugin sends 2 unless a conversion gives another
 * (#198).
 */
export function withPriority<T extends PGN> (pgn: T, prio = 2): T {
  pgn.prio = prio
  return pgn
}
