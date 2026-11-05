import * as Bacon from 'baconjs'
import _ from 'lodash'
import path from 'path'
import fs from 'fs'
import { pgnToActisenseSerialFormat } from '@canboat/canboatjs'
import { PGN } from '@canboat/ts-pgns'
import { isNmea2000Update } from './nmea2000Source'
import { Type, type TProperties } from 'typebox'
import { Value } from 'typebox/value'
import { App, Conversion, Plugin } from './types'
import {
  savedBuses,
  busEvents,
  busesProperty,
  busList,
  chosenBuses,
  conversionBusesDescription,
  OUTPUT_KEY,
  outputDescription
} from './buses'
import {
  allowNmea2000SourcesProperty,
  conversionProperties,
  type ConversionSettings,
  type PluginOptions,
  sourceProperty
} from './schema'

// What a conversion's callback gives: PGNs, possibly promised.
type Output = unknown

type Unsubscribe = () => void

// A conversion while it runs: the plugin keeps its resend timer on it.
type RunningConversion = Conversion & {
  resendTimer?: ReturnType<typeof setInterval>
  withheld?: () => boolean
  interval?: number
  timeouts?: (number | undefined)[]
  withholdingKeys?: string[]
  withholdingSourceKeys?: string[]
  initialValueKeys?: string[]
  sourceSelectors?: Record<string, string | undefined>
  preventsNmea2000Echo?: boolean
  // The NMEA 2000 buses its PGNs go to; empty for every bus
  buses?: string[]
}

interface Delta {
  updates?: { source?: { type?: string }; $source?: string }[]
  [key: string]: unknown
}

module.exports = function (app: App) {
  var plugin: Plugin = {}
  var unsubscribes: Unsubscribe[] = []
  var timers: ReturnType<typeof setInterval>[] = []
  var conversions: RunningConversion[] = ([] as RunningConversion[]).concat(
    ...load_conversions(app, plugin)
  )

  /*
    Each conversion can specify the sourceType and outputType.

    Source type can be:

      onDelta - You will get all deltas via app.signalk.on('delta', ...). Please do no use this unless absolutely necessary.

      onValueChange - The conversion should specify a variable called 'keys' which is an array of the Signal K paths that the convesion needs

      timer - The conversions callback will get called per the givien 'interval' variable

    Output type can be:

      'to-n2k' - The output will be sent through the to-n2k package (https://github.com/tkurki/to-n2k)

    sourceType defaults to 'onValueChange'
    outputType defaults to 'to-n2k'

    Data whose source is NMEA 2000 is not sent unless the conversion's
    allowNmea2000Sources option is set: the output goes to every NMEA 2000
    connection, so it would be echoed back onto the bus it came from.
    A conversion that sets preventsNmea2000Echo keeps its own loops out
    (notifications skips notifications.nmea.*) and gets all its data.
    A conversion can limit the keys whose NMEA 2000 data withholds its PGNs
    with withholdingKeys; NMEA 2000 data for its other keys is ignored.
    NMEA 2000 data from a source the user picked is sent, except for the keys
    in withholdingSourceKeys, where a value from it withholds the PGN instead
    (engine notifications: an NMEA 2000 engine already sends 127489). With
    allowNmea2000Sources set, none of this applies and everything is sent.
    A conversion whose output depends on more than its inputs gives a
    withheld function; resending stops once it returns true.
   */

  var sourceTypes: Record<
    string,
    (conversion: RunningConversion, options: ConversionSettings) => void
  > = {
    onDelta: mapOnDelta,
    onValueChange: mapBaconjs,
    subscription: mapSubscription,
    timer: mapTimer
  }

  var outputTypes: Record<
    string,
    (values: Output, conversion: RunningConversion) => void
  > = {
    'to-n2k': processToN2K
  }

  plugin.id = 'sk-to-nmea2000'
  plugin.name = 'Signal K to NMEA 2000'
  plugin.description = 'Plugin to convert Signal K to NMEA2000'

  const buses = busList(app)

  // The buses offered in the admin UI's form, none on a server that cannot
  // send to one bus; any, when the saved settings are checked. A saved bus
  // that is not listed now stays a choice, or the form could not be saved.
  function busChoices(liveData: boolean) {
    return liveData
      ? _.uniq([...buses.keys(), ...savedBuses(app.readPluginOptions?.())])
      : undefined
  }
  const offersBuses = (liveData: boolean) => !liveData || buses.size > 0

  // The plugin's schema; liveData offers the ids in the Signal K data as
  // choices, for the admin UI's form
  function pluginSchema(liveData: boolean) {
    const properties: TProperties = {}
    if (offersBuses(liveData)) {
      properties[OUTPUT_KEY] = Type.Optional(
        Type.Object(
          {
            nmea2000Buses: busesProperty(
              busChoices(liveData),
              outputDescription
            )
          },
          { title: 'Output to NMEA 2000' }
        )
      )
    }
    conversions.forEach((conversion) => {
      properties[conversion.optionKey!] = Type.Optional(
        conversionSchema(conversion, liveData)
      )
    })
    return Type.Object(properties, {
      title: 'Conversions to NMEA2000',
      description:
        'If there is SignalK data for the conversion generate the following NMEA2000 pgns from Signal K data:'
    })
  }

  function conversionSchema(conversion: RunningConversion, liveData: boolean) {
    const sources: TProperties = {}
    ;(conversion.keys || []).forEach((key) => {
      sources[pathToPropName(key)] = sourceProperty(key)
    })
    const own =
      typeof conversion.properties === 'function'
        ? conversion.properties({ liveData })
        : conversion.properties
    return Type.Object(
      {
        ...conversionProperties,
        ...(conversion.preventsNmea2000Echo
          ? {}
          : allowNmea2000SourcesProperty),
        ...sources,
        ...own,
        ...(offersBuses(liveData)
          ? {
              nmea2000Buses: busesProperty(
                busChoices(liveData),
                conversionBusesDescription
              )
            }
          : {})
      },
      { title: conversion.title }
    )
  }

  plugin.schema = function () {
    return pluginSchema(true)
  }

  // The bus choices as checkboxes, easier than a multiple select, above all
  // on a touch screen
  plugin.uiSchema = function () {
    const checkboxes = {
      nmea2000Buses: {
        'ui:widget': 'checkboxes',
        'ui:options': { inline: true }
      }
    }
    const uiSchema: Record<string, unknown> = { [OUTPUT_KEY]: checkboxes }
    conversions.forEach((conversion) => {
      uiSchema[conversion.optionKey!] = checkboxes
    })
    return uiSchema
  }

  // Fill in the defaults of an enabled conversion's settings, and report the
  // ones that do not match the schema. The conversion still starts: the
  // settings were saved by an earlier version, or edited by hand.
  function checkedSettings(
    conversion: RunningConversion,
    settings: ConversionSettings
  ): ConversionSettings {
    const schema = conversionSchema(conversion, false)
    const filled = Value.Default(schema, settings) as ConversionSettings
    for (const error of Value.Errors(schema, filled)) {
      app.error(
        `${conversion.title}: setting ${error.instancePath || '/'} ${error.message}`
      )
    }
    return filled
  }

  plugin.start = function (options: PluginOptions) {
    conversions.forEach((entry: RunningConversion | RunningConversion[]) => {
      const list = _.isArray(entry) ? entry : [entry]
      list.forEach((conversion) => {
        const optionKey = conversion.optionKey!
        const settings = options[optionKey]
        if (settings && settings.enabled) {
          app.debug(`${conversion.title} is enabled`)
          options[optionKey] = checkedSettings(conversion, settings)

          var subConversions:
            (RunningConversion | undefined)[] | undefined | null
          if (_.isUndefined(conversion.conversions)) {
            subConversions = [conversion]
          } else if (_.isFunction(conversion.conversions)) {
            subConversions = conversion.conversions(options)
          } else {
            subConversions = conversion.conversions
          }
          if (subConversions != null) {
            subConversions.forEach((subConversion) => {
              if (!_.isUndefined(subConversion)) {
                var type = _.isUndefined(subConversion.sourceType)
                  ? 'onValueChange'
                  : subConversion.sourceType
                var mapper = sourceTypes[type]
                if (_.isUndefined(mapper)) {
                  console.error(`Unknown conversion type: ${type}`)
                } else {
                  if (_.isUndefined(subConversion.outputType)) {
                    subConversion.outputType = 'to-n2k'
                  }
                  subConversion.buses = chosenBuses(options, optionKey)
                  mapper(subConversion, options[optionKey]!)
                }
              }
            })
          }
        }
      })
    })
  }

  plugin.stop = function () {
    unsubscribes.forEach((f) => f())
    unsubscribes = []
    timers.forEach((timer) => clearInterval(timer))
    timers = []
  }

  return plugin

  function load_conversions(
    app: App,
    plugin: Plugin
  ): (RunningConversion | RunningConversion[])[] {
    const fpath = path.join(__dirname, 'conversions')
    // Only the modules: the build puts declarations and source maps beside them
    const files = fs.readdirSync(fpath).filter((fname) => fname.endsWith('.js'))
    return files
      .map((fname) => {
        let pgn = path.basename(fname, '.js')
        return require(path.join(fpath, pgn))(app, plugin)
      })
      .filter((converter) => {
        return typeof converter !== 'undefined'
      })
  }

  // The conversions give values in SI, as Signal K has them. Encode them
  // here with this plugin's own canboatjs (4 or later, which takes SI) and
  // send the frame as an Actisense line, which every NMEA 2000 connection
  // handles as it does a PGN object. The server's canboatjs, of whatever
  // version, then only passes the frame on and never sees the values.
  // A PGN that cannot be encoded here is dropped, not handed to the server
  // as JSON: a server on canboatjs 3 would read its SI values in the old
  // units and put wrong values on the bus.
  function emitPgn(pgn: PGN, chosen: string[] = []) {
    let line
    try {
      line = pgnToActisenseSerialFormat(pgn)
    } catch (err: any) {
      app.error(`cannot encode PGN ${pgn.pgn}: ${err.message}`)
      return
    }
    if (!line) {
      app.error(`cannot encode PGN ${pgn.pgn}`)
      return
    }
    busEvents(buses, chosen).forEach((event) => {
      app.debug(`emit ${event} ${line}`)
      app.emit(event, line)
    })
  }

  function processToN2K(values: Output, conversion: RunningConversion) {
    if (values) {
      Promise.all(values as (PGN | null | Promise<PGN | null>)[]).then(
        (pgns) => {
          pgns
            .filter((pgn) => pgn != null)
            .forEach((pgn) => {
              try {
                emitPgn(pgn, conversion.buses)
              } catch (err: any) {
                console.error(`error writing pgn ${JSON.stringify(pgn)}`)
                console.error(err.stack)
              }
            })
          if (app.reportOutputMessages) {
            app.reportOutputMessages(pgns.length)
          }
        }
      )
    }
  }

  function clearResendInterval(
    timer: ReturnType<typeof setInterval> | undefined
  ) {
    if (timer === undefined) {
      return
    }
    let idx = timers.indexOf(timer)
    if (idx != -1) {
      timers.splice(idx, 1)
    }
    clearInterval(timer)
  }

  function processOutput(
    conversion: RunningConversion,
    options: ConversionSettings | null,
    output: Output
  ) {
    if (options && options.resend && options.resend > 0) {
      if (conversion.resendTimer) {
        clearResendInterval(conversion.resendTimer)
      }
      const startedAt = Date.now()
      conversion.resendTimer = setInterval(() => {
        // The inputs can stop the PGN while it is being resent: the active
        // course can turn out to come from NMEA 2000 without a new value
        // replacing the one being resent
        if (conversion.withheld && conversion.withheld()) {
          clearResendInterval(conversion.resendTimer)
          conversion.resendTimer = undefined
          return
        }
        Promise.resolve(output).then((values) => {
          outputTypes[conversion.outputType!](values, conversion)
        })
        if (Date.now() - startedAt > (options.resendTime || 30) * 1000) {
          clearResendInterval(conversion.resendTimer)
        }
      }, options.resend * 1000)
      timers.push(conversion.resendTimer)
    }
    Promise.resolve(output).then((values) => {
      outputTypes[conversion.outputType!](values, conversion)
    })
  }

  function mapBaconjs(
    conversion: RunningConversion,
    options: ConversionSettings
  ) {
    unsubscribes.push(
      timeoutingArrayStream(
        conversion.keys!,
        conversion.timeouts,
        app.streambundle,
        unsubscribes,
        options,
        sendsNmea2000Data(conversion, options),
        conversion.withholdingKeys,
        conversion.initialValueKeys,
        conversion.sourceSelectors,
        conversion.withholdingSourceKeys
      ).onValue((values) => {
        if (values === WITHHELD) {
          // The last PGN no longer reflects the inputs; stop resending it
          if (conversion.resendTimer) {
            clearResendInterval(conversion.resendTimer)
            conversion.resendTimer = undefined
          }
          return
        }
        processOutput(
          conversion,
          options,
          conversion.callback!(...(values as unknown[]))
        )
      })
    )
  }

  function mapOnDelta(
    conversion: RunningConversion,
    options: ConversionSettings
  ) {
    app.signalk.on('delta', (delta: Delta) => {
      let input: Delta | undefined = delta
      if (!sendsNmea2000Data(conversion, options)) {
        input = withoutNmea2000Updates(app, delta)
        if (!input) {
          return
        }
      }
      try {
        processOutput(conversion, options, conversion.callback!(input))
      } catch (err: any) {
        app.error(err)
        console.error(err.stack)
      }
    })
  }

  function mapTimer(
    conversion: RunningConversion,
    options: ConversionSettings
  ) {
    timers.push(
      setInterval(() => {
        let values =
          conversion.keys?.map((key) => {
            let update = app.getSelfPath(key)
            if (update && 'value' in update) return update.value
            else return update
          }) || []
        processOutput(conversion, null, conversion.callback!(app, ...values))
      }, conversion.interval as number)
    )
  }

  function subscription_error(err: unknown) {
    app.error((err as Error).toString())
  }

  function mapSubscription(
    mapping: RunningConversion,
    options: ConversionSettings
  ) {
    var subscription: { context?: string; subscribe: { path: string }[] } = {
      context: mapping.context,
      subscribe: []
    }

    var keys: string[] = _.isFunction(mapping.keys)
      ? (mapping.keys as (options: ConversionSettings) => string[])(options)
      : mapping.keys!
    keys.forEach((key) => {
      subscription.subscribe.push({ path: key })
    })

    app.debug('subscription: ' + JSON.stringify(subscription))

    app.subscriptionmanager.subscribe(
      subscription,
      unsubscribes,
      subscription_error,
      (delta: Delta) => {
        let input: Delta | undefined = delta
        if (!sendsNmea2000Data(mapping, options)) {
          input = withoutNmea2000Updates(app, delta)
          if (!input) {
            return
          }
        }
        try {
          processOutput(mapping, options, mapping.callback!(input))
        } catch (err) {
          app.error(err)
        }
      }
    )
  }

  function timeoutingArrayStream(
    keys: string[],
    timeouts: (number | undefined)[] = [],
    streambundle: any,
    unsubscribes: Unsubscribe[],
    options: ConversionSettings,
    allowNmea2000: boolean,
    withholdingKeys: string[] = keys,
    initialValueKeys: string[] = [],
    sourceSelectors: Record<string, string | undefined> = {},
    withholdingSourceKeys: string[] = []
  ): Bacon.EventStream<unknown[] | typeof WITHHELD> {
    app.debug(`keys:${keys}`)
    app.debug(`timeouts:${timeouts}`)
    type LastValue = {
      timestamp: number
      value: unknown
      fromNmea2000: boolean
    }
    const lastValues = keys.reduce((acc: Record<string, LastValue>, key) => {
      acc[key] = {
        timestamp: new Date().getTime(),
        value: null,
        fromNmea2000: false
      }
      return acc
    }, {})
    const combinedBus = new Bacon.Bus<unknown[] | typeof WITHHELD>()
    let hasInitialValue = false
    keys.map((skKey) => {
      const sourceRef = sourceSelectors[skKey] ?? options[pathToPropName(skKey)]
      app.debug(`${skKey} ${sourceRef}`)

      if (initialValueKeys.includes(skKey)) {
        const current = app.getSelfPath(skKey)
        if (current && typeof current === 'object' && 'value' in current) {
          const currentSourceId = current.$source
          const selectedSourceMatches =
            !sourceRef || currentSourceId === sourceRef
          const isNmea2000Source =
            !allowNmea2000 &&
            isNmea2000Update(app, { $source: currentSourceId })
          const fromNmea2000 =
            isNmea2000Source &&
            (!sourceRef || withholdingSourceKeys.includes(skKey))
          const ignoreNmea2000Source =
            isNmea2000Source && !sourceRef && !withholdingKeys.includes(skKey)
          if (selectedSourceMatches && !ignoreNmea2000Source) {
            lastValues[skKey] = {
              timestamp: new Date().getTime(),
              value: current.value,
              fromNmea2000
            }
            hasInitialValue = true
          }
        }
      }

      let bus = streambundle.getSelfBus(skKey)
      if (sourceRef) {
        bus = bus.filter((x: { $source?: string }) => x.$source === sourceRef)
      }
      unsubscribes.push(
        bus.onValue(
          ({
            value,
            source,
            $source
          }: {
            value: unknown
            source?: { type?: string }
            $source?: string
          }) => {
            const isNmea2000Source =
              !allowNmea2000 && isNmea2000Update(app, { source, $source })
            if (
              isNmea2000Source &&
              !sourceRef &&
              !withholdingKeys.includes(skKey)
            ) {
              return
            }
            const fromNmea2000 =
              isNmea2000Source &&
              (!sourceRef || withholdingSourceKeys.includes(skKey))
            lastValues[skKey] = {
              timestamp: new Date().getTime(),
              value,
              fromNmea2000
            }
            const now = new Date().getTime()

            const current = keys.map((key, i) =>
              notDefined(timeouts[i]) ||
              lastValues[key].timestamp + timeouts[i]! > now
                ? lastValues[key]
                : null
            )
            // One NMEA 2000 input withholds the whole PGN: sending the others with
            // that field unavailable would compete with the device already on the bus
            if (
              current.some(
                (entry) => entry && entry.value != null && entry.fromNmea2000
              )
            ) {
              combinedBus.push(WITHHELD)
              return
            }
            combinedBus.push(
              current.map((entry) => (entry ? entry.value : null))
            )
          }
        )
      )
    })
    const initialValuesWithheld = keys.some(
      (key) => lastValues[key].value != null && lastValues[key].fromNmea2000
    )
    const result = hasInitialValue
      ? Bacon.once(
          initialValuesWithheld
            ? WITHHELD
            : keys.map((key) => lastValues[key].value)
        )
          .concat(combinedBus)
          .debounce(10)
      : combinedBus.debounce(10)
    if (app.debug.enabled) {
      unsubscribes.push(
        result.onValue((x) => app.debug(`${keys}:${String(x)}`))
      )
    }
    return result
  }
}

function pathToPropName(path: string) {
  return path.replace(/\./g, '')
}

const sendsNmea2000Data = (
  conversion: { preventsNmea2000Echo?: boolean },
  options: ConversionSettings
) => Boolean(options.allowNmea2000Sources || conversion.preventsNmea2000Echo)

// Pushed instead of values when an NMEA 2000 input withholds the PGN
const WITHHELD = Symbol('withheld')

// The delta with its NMEA 2000 updates removed, or undefined if none remain
function withoutNmea2000Updates(app: App, delta: Delta): Delta | undefined {
  if (!delta.updates) {
    return delta
  }
  const updates = delta.updates.filter(
    (update) => !isNmea2000Update(app, update)
  )
  if (updates.length === 0) {
    return undefined
  }
  return updates.length === delta.updates.length ? delta : { ...delta, updates }
}

const notDefined = (x: unknown) => typeof x === 'undefined'
