import { PGN } from '@canboat/ts-pgns'

/**
 * A ts-pgns PGN sent at `prio` rather than the default priority canboat gives
 * that PGN, which the classes use (#198).
 */
export function withPriority<T extends PGN>(pgn: T, prio: number): T {
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
