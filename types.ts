import type { ConversionProperties, PluginOptions } from './schema'

// The parts of the Signal K server's app the plugin uses. @signalk/server-api
// declares them, but wants baconjs 1 as a peer and this plugin uses 3.
export interface App {
  selfId?: string
  signalk?: any
  streambundle?: any
  subscriptionmanager?: any
  courseApi?: any
  resourcesApi?: any
  getSelfPath(path: string): any
  getPath(path: string): any
  debug: { (...args: unknown[]): void; enabled?: boolean }
  error(...args: unknown[]): void
  emit(event: string, ...args: unknown[]): boolean | void
  setPluginError?(msg: string): void
  reportOutputMessages?(count?: number): void
  onPropertyValues?(
    name: string,
    cb: (values: ({ value: any } | undefined)[]) => void
  ): () => void
}

/** The plugin object a conversion module is given. */
export type Plugin = Record<string, any>

/** A conversion's test: the values its callback gets and the PGNs expected. */
export interface ConversionTest {
  input?: unknown[]
  skSelfData?: Record<string, unknown>
  skData?: Record<string, unknown>
  expected?: unknown[]
  [key: string]: unknown
}

/**
 * One conversion, as a conversions/ module returns it (or an array of them).
 * A sub-conversion, in another's `conversions`, has no title or option key.
 */
export interface Conversion {
  title?: string
  optionKey?: string
  keys?: string[]
  context?: string
  sourceType?: string
  outputType?: string
  callback?: (...values: any[]) => unknown
  tests?: ConversionTest[]
  testOptions?: unknown
  conversions?:
    | Conversion[]
    // An undefined entry is a mapping that gives no conversion
    | ((
        options: PluginOptions
      ) => (Conversion | undefined)[] | undefined | null)
  properties?: ConversionProperties
  [key: string]: unknown
}
