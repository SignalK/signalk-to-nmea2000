// The Route ID that Route/WP Information (129285) and Route & WP Service
// (130066, 130067) give the active course. A chartplotter keys the routes it
// stores by it: a Garmin GPSMAP replaces the waypoints of the route it has
// under an ID with those that come next under the same ID. So each route gets
// one of its own, the same every time it is sent: from its href, or for a
// single destination from where it is.

interface Position {
  latitude: number
  longitude: number
}

// 0xfffd to 0xffff mean out of range, reserved and not available
const ROUTE_IDS = 0xfffc

// FNV-1a, 32 bits
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/**
 * The Route ID of a route by its href, or of a single destination by its
 * position: from 1 to 65532.
 */
export function routeId(
  route: { href?: string } | undefined,
  destination?: Position
): number {
  const key = route?.href
    ? `route:${route.href}`
    : `destination:${destination?.latitude?.toFixed(7)},${destination?.longitude?.toFixed(7)}`
  return (hash(key) % ROUTE_IDS) + 1
}
