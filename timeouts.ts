// How long an input of a PGN built from several values is used after its
// last update. Past it the field is sent as not available, while the other
// values still update the PGN (#7). An input whose value seldom changes,
// such as the magnetic variation, has no timeout.

// Values that a working sensor updates at least every second or so
export const NAVIGATION_TIMEOUT = 10000 // ms

// Weather sensors may report only once a minute
export const ENVIRONMENT_TIMEOUT = 300000 // ms
