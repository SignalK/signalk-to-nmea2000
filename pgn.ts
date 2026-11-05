import { PGN } from '@canboat/ts-pgns'

/**
 * A ts-pgns PGN sent at `prio`. The classes take the PGN's default priority
 * from canboat; the plugin sends 2 unless a conversion gives another
 * (#198).
 */
export function withPriority<T extends PGN>(pgn: T, prio = 2): T {
  pgn.prio = prio
  return pgn
}

/**
 * The instance of a mapping in the plugin's settings. The schema does not
 * require it; a mapping saved without one is sent with the instance not
 * available (0xff), as canboatjs encodes a missing field.
 */
export const mappedInstance = (instance: number | undefined): number =>
  instance as number
