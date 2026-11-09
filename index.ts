import * as Bacon from 'baconjs'
import _ from 'lodash'
import path from 'path'
import fs from 'fs'
import { pgnToActisenseSerialFormat } from '@canboat/canboatjs'
import { PGN } from '@canboat/ts-pgns'
import { isNmea2000Update, sourceConnection } from './nmea2000Source'
import { Type, type TProperties } from 'typebox'
import { Value } from 'typebox/value'
import { App, Conversion, Plugin } from './types'
import {
  rateLimiter,
  type RateLimiter,
  SEND_RATE_KEY,
  type SendRateSettings,
  sendRateProperty
} from './rateLimit'
import {
  savedBuses,
  bridgeProperty,
  bridges,
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
  // Counts the times its output was dropped: output built before is not sent
  generation?: number
}

interface Delta {
  updates?: { source?: { type?: string }; $source?: string }[]
  [key: string]: unknown
}

// The server passes the app only; a test can pass a limiter of its own
module.exports = function (app: App, limiter: RateLimiter = rateLimiter()) {
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
    With bridging on (OUTPUT.bridgeNmea2000), on a server that lists its
    buses, NMEA 2000 data that would withhold a PGN sends it to the other
    buses instead: never to the bus the data came from.
    A conversion whose output depends on more than its inputs gives a
    withheld function; resending stops once it returns true. It is not
    bridged: the buses the rest of its output came from are not known.
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
    (
      values: Output,
      conversion: RunningConversion,
      exclude: string[],
      expiresAt: number,
      // Whether the output is still to be sent
      current: () => boolean
    ) => void
  > = {
    'to-n2k': processToN2K
  }

  plugin.id = 'sk-to-nmea2000'
  plugin.name = 'Signal K to NMEA 2000'
  plugin.description = 'Plugin to convert Signal K to NMEA2000'

  const buses = busList(app)
  // Set on start from the plugin-wide settings
  let pluginOptions: PluginOptions = {}
  // Read when data arrives: the buses may be listed after the plugin starts
  const bridging = () => bridges(pluginOptions, buses)

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
            ),
            bridgeNmea2000: bridgeProperty
          },
          { title: 'Output to NMEA 2000' }
        )
      )
    }
    properties[SEND_RATE_KEY] = sendRateProperty
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
  // on a touch screen. One per line: the admin UI has no style for inline
  // checkboxes, which run into each other.
  plugin.uiSchema = function () {
    const checkboxes = {
      nmea2000Buses: { 'ui:widget': 'checkboxes' }
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

  // Counts the starts and stops: output still being built when the plugin
  // stops is not sent, even once it has started again
  let run = 0

  plugin.start = function (options: PluginOptions) {
    pluginOptions = options
    run++
    limiter.configure(
      (options as Record<string, unknown>)[SEND_RATE_KEY] as
        SendRateSettings | undefined
    )
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
    run++
    unsubscribes.forEach((f) => f())
    unsubscribes = []
    timers.forEach((timer) => clearInterval(timer))
    timers = []
    limiter.stop()
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
  // Each bus gets it no more often than its transmission interval: see
  // rateLimit.ts. What waits for that is not sent once expiresAt passes.
  function emitPgn(
    pgn: PGN,
    chosen: string[] = [],
    exclude: string[] = [],
    owner?: RunningConversion,
    expiresAt = Infinity
  ) {
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
    limiter.send(
      pgn,
      busEvents(buses, chosen, exclude),
      // Possibly later, from a timer: not where the caller catches errors
      (event) => {
        try {
          app.debug(`emit ${event} ${line}`)
          app.emit(event, line)
        } catch (err: any) {
          app.error(`error sending PGN ${pgn.pgn}: ${err.message}`)
        }
      },
      owner,
      expiresAt
    )
  }

  function processToN2K(
    values: Output,
    conversion: RunningConversion,
    exclude: string[],
    expiresAt: number,
    current: () => boolean
  ) {
    if (values) {
      Promise.all(values as (PGN | null | Promise<PGN | null>)[]).then(
        (pgns) => {
          if (!current()) {
            return
          }
          pgns
            .filter((pgn) => pgn != null)
            .forEach((pgn) => {
              try {
                emitPgn(pgn, conversion.buses, exclude, conversion, expiresAt)
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
    output: Output,
    // The NMEA 2000 buses the inputs came from, which the PGN is not sent to
    exclude: string[] = [],
    // When the first input it was built from times out
    expiresAt = Infinity
  ) {
    const generation = conversion.generation ?? 0
    const startedIn = run
    const deliver = (values: Output) =>
      outputTypes[conversion.outputType!](
        values,
        conversion,
        exclude,
        expiresAt,
        () => run === startedIn && (conversion.generation ?? 0) === generation
      )
    if (options && options.resend && options.resend > 0) {
      if (conversion.resendTimer) {
        clearResendInterval(conversion.resendTimer)
      }
      const startedAt = Date.now()
      conversion.resendTimer = setInterval(() => {
        // The inputs can stop the PGN while it is being resent: the active
        // course can turn out to come from NMEA 2000 without a new value
        // replacing the one being resent. An input it was built from can
        // also time out, when a newer update of another input restarted the
        // resend; the PGN is not rebuilt, as some callbacks keep state.
        if (
          (conversion.withheld && conversion.withheld()) ||
          Date.now() >= expiresAt
        ) {
          clearResendInterval(conversion.resendTimer)
          conversion.resendTimer = undefined
          dropWaiting(conversion)
          return
        }
        Promise.resolve(output).then(deliver)
        if (Date.now() - startedAt > (options.resendTime || 30) * 1000) {
          clearResendInterval(conversion.resendTimer)
        }
      }, options.resend * 1000)
      timers.push(conversion.resendTimer)
    }
    Promise.resolve(output).then(deliver)
  }

  // Drops the conversion's PGNs that wait for their interval, and those
  // still being built
  function dropWaiting(conversion: RunningConversion) {
    limiter.cancel(conversion)
    conversion.generation = (conversion.generation ?? 0) + 1
  }

  function mapBaconjs(
    conversion: RunningConversion,
    options: ConversionSettings
  ) {
    // A resend says how long the user takes a value to hold, so no input
    // times out before the resend is over
    const resendMs =
      options.resend && options.resend > 0
        ? (options.resendTime || 30) * 1000
        : 0
    const timeouts = conversion.timeouts?.map((timeout) =>
      timeout === undefined ? undefined : Math.max(timeout, resendMs)
    )
    unsubscribes.push(
      timeoutingArrayStream(
        conversion.keys!,
        timeouts,
        app.streambundle,
        unsubscribes,
        options,
        sendsNmea2000Data(conversion, options),
        conversion.withholdingKeys,
        conversion.initialValueKeys,
        conversion.sourceSelectors,
        conversion.withholdingSourceKeys,
        bridged(conversion)
      ).onValue((values) => {
        if (values === WITHHELD) {
          // The last PGN no longer reflects the inputs; stop resending it,
          // and do not send one that waits for its interval
          if (conversion.resendTimer) {
            clearResendInterval(conversion.resendTimer)
            conversion.resendTimer = undefined
          }
          dropWaiting(conversion)
          return
        }
        processOutput(
          conversion,
          options,
          conversion.callback!(...values.values),
          values.exclude,
          values.expiresAt
        )
      })
    )
  }

  function mapOnDelta(
    conversion: RunningConversion,
    options: ConversionSettings
  ) {
    app.signalk.on('delta', (delta: Delta) => {
      try {
        processDelta(conversion, options, delta)
      } catch (err: any) {
        app.error(err)
        console.error(err.stack)
      }
    })
  }

  // When bridging, one delta can give a PGN for each bus its data came from.
  // A group that gives nothing does not stop another group's resends.
  function processDelta(
    conversion: RunningConversion,
    options: ConversionSettings,
    delta: Delta
  ) {
    const outputs = deltaInputs(conversion, options, delta).map(
      ({ input, exclude }) => ({ output: conversion.callback!(input), exclude })
    )
    const sending = outputs.filter(({ output }) => output != null)
    ;(sending.length > 0 ? sending : outputs.slice(0, 1)).forEach(
      ({ output, exclude }) =>
        processOutput(conversion, options, output, exclude)
    )
  }

  // What a conversion that takes whole deltas is given. NMEA 2000 updates are
  // left out, unless the conversion takes them; when bridging, each bus's go
  // on their own, to be sent to the other buses.
  function deltaInputs(
    conversion: RunningConversion,
    options: ConversionSettings,
    delta: Delta
  ): { input: Delta; exclude: string[] }[] {
    if (sendsNmea2000Data(conversion, options)) {
      return [{ input: delta, exclude: [] }]
    }
    const input = withoutNmea2000Updates(app, delta)
    const inputs = input ? [{ input, exclude: [] as string[] }] : []
    if (!bridged(conversion) || !delta.updates) {
      return inputs
    }
    // An update from a connection that is not a listed bus is withheld: one
    // that only reads may be a second gateway on a bus that is listed
    const byBus = _.groupBy(
      delta.updates.filter((update) => {
        const bus = sourceConnection(update)
        return (
          isNmea2000Update(app, update) && bus !== undefined && buses.has(bus)
        )
      }),
      (update) => sourceConnection(update)
    )
    Object.entries(byBus).forEach(([bus, updates]) => {
      inputs.push({ input: { ...delta, updates }, exclude: [bus] })
    })
    return inputs
  }

  // A conversion with a withheld function is not bridged: the buses the rest
  // of its output came from are not known
  function bridged(conversion: RunningConversion) {
    return bridging() && !conversion.withheld
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
        try {
          processDelta(mapping, options, delta)
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
    withholdingSourceKeys: string[] = [],
    bridged = false
  ): Bacon.EventStream<Inputs | typeof WITHHELD> {
    app.debug(`keys:${keys}`)
    app.debug(`timeouts:${timeouts}`)
    type LastValue = {
      timestamp: number
      value: unknown
      fromNmea2000: boolean
      // The connection the value came from
      bus?: string
    }
    const lastValues = keys.reduce((acc: Record<string, LastValue>, key) => {
      acc[key] = {
        timestamp: new Date().getTime(),
        value: null,
        fromNmea2000: false
      }
      return acc
    }, {})
    const combinedBus = new Bacon.Bus<Inputs | typeof WITHHELD>()
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
              fromNmea2000,
              bus: sourceConnection({ $source: currentSourceId })
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
              fromNmea2000,
              bus: sourceConnection({ source, $source })
            }
            const now = new Date().getTime()

            const current = keys.map((key, i) =>
              notDefined(timeouts[i]) ||
              lastValues[key].timestamp + timeouts[i]! > now
                ? lastValues[key]
                : null
            )
            combinedBus.push(inputsOf(current))
          }
        )
      )
    })
    // One NMEA 2000 input withholds the whole PGN: sending the others with
    // that field unavailable would compete with the device already on the
    // bus. When bridging, the PGN goes to the other buses instead.
    function inputsOf(entries: (LastValue | null)[]): Inputs | typeof WITHHELD {
      const fromBuses = entries.filter(
        (entry) => entry && entry.value != null && entry.fromNmea2000
      ) as LastValue[]
      const exclude = _.uniq(
        fromBuses.map((entry) => entry.bus).filter((bus) => bus !== undefined)
      )
      if (
        fromBuses.length > 0 &&
        (!bridged ||
          fromBuses.some(
            (entry) => entry.bus === undefined || !buses.has(entry.bus)
          ))
      ) {
        return WITHHELD
      }
      return {
        values: entries.map((entry) => (entry ? entry.value : null)),
        exclude,
        expiresAt: Math.min(
          ...entries.map((entry, i) =>
            entry && entry.value != null && !notDefined(timeouts[i])
              ? entry.timestamp + timeouts[i]!
              : Infinity
          )
        )
      }
    }
    const result = hasInitialValue
      ? Bacon.once(inputsOf(keys.map((key) => lastValues[key])))
          .concat(combinedBus)
          .debounce(10)
      : combinedBus.debounce(10)
    if (app.debug.enabled) {
      unsubscribes.push(
        result.onValue((x) =>
          app.debug(
            x === WITHHELD
              ? `${keys}: withheld`
              : `${keys}:${String(x.values)}${x.exclude.length ? ` not to ${x.exclude}` : ''}`
          )
        )
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

// A conversion's input values, the NMEA 2000 buses they came from, and when
// the first of them times out
interface Inputs {
  values: unknown[]
  exclude: string[]
  expiresAt: number
}

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
