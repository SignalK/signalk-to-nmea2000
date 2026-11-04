import { Type, type Static, type TProperties, type TSchema } from 'typebox'

// The plugin's configuration schema, in TypeBox: plain JSON Schema that the
// admin UI renders as a form, and from which the options get their types.

// The settings every conversion has, under its optionKey
export const conversionProperties = {
  enabled: Type.Optional(Type.Boolean({ title: 'Enabled', default: false })),
  resend: Type.Optional(
    Type.Number({
      title: 'Resend (seconds)',
      description: 'If non-zero, the msg will be periodically resent',
      default: 0
    })
  ),
  resendTime: Type.Optional(
    Type.Number({
      title: 'Resend Duration (seconds)',
      description: 'The value will be resent for the given #number of seconds',
      default: 30
    })
  )
}

// For conversions that leave NMEA 2000 data out (all but those that set
// preventsNmea2000Echo)
export const allowNmea2000SourcesProperty = {
  allowNmea2000Sources: Type.Optional(
    Type.Boolean({
      title: 'Also send data that came from NMEA 2000',
      description:
        'Leave off unless bridging separate NMEA 2000 networks: the output goes to every NMEA 2000 connection, including the one the data came from',
      default: false
    })
  )
}

// The source to take a key's data from, as the property pathToPropName names
export const sourceProperty = (key: string) =>
  Type.Optional(
    Type.String({
      title: `Source for ${key}`,
      description:
        'Use data only from this source (leave blank to ignore source)'
    })
  )

const ConversionSettings = Type.Object({
  ...conversionProperties,
  ...allowNmea2000SourcesProperty
})

/**
 * A conversion's settings, under its optionKey in the plugin's options: the
 * shared ones, a source per key, and the conversion's own properties.
 */
export type ConversionSettings = Static<typeof ConversionSettings> & {
  [key: string]: unknown
}

/** The plugin's options, as plugin.start gets them. */
export type PluginOptions = Record<string, ConversionSettings | undefined>

/**
 * A conversion's own properties. A function builds them when the plugin
 * schema is asked for: with liveData, it may offer the ids present in the
 * Signal K data, which the admin UI shows as choices; without, it gives the
 * schema the saved settings are checked against.
 */
export type ConversionProperties =
  TProperties | ((context: { liveData: boolean }) => TProperties | undefined)

/**
 * The settings of the conversion under optionKey, typed by the schema of its
 * own properties
 */
export const settingsOf = <T extends TSchema>(
  options: PluginOptions,
  optionKey: string,
  _schema: T
) => options[optionKey] as (Static<T> & ConversionSettings) | undefined
