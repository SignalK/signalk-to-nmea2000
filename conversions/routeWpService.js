'use strict'

const _ = require('lodash')
const path = require('node:path')

/**
 * Route & WP Service (130066, 130067) from Course API (production-ready)
 *
 * - Sends only on change (polls courseApi every 1s, but emits only when state changes)
 * - NO retry, NO periodic resend from this conversion
 * - Fixed IDs for Garmin-friendliness:
 *   - Database ID = 1
 *   - Route ID = 1
 *
 * Behavior:
 * - If activeRoute.href exists and can be resolved via resourcesApi, send that route's WPs (limited).
 * - Else: send a pseudo-route built from previousPoint (if present) + nextPoint ("GoTo").
 */

const WPS_PER_PACKET = 3

// Fixed for stability (avoid Garmin "route storage full" from changing IDs)
const FIXED_DATABASE_ID = 1
const FIXED_ROUTE_ID = 1

// Fixed defaults (kept out of GUI)
const INCLUDE_TIME = true
const MAX_ROUTE_WPS = 20

let lastHash = null

function secondsSinceMidnightUtc() {
    const d = new Date()
    return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()
}

function daysSinceEpochUtc() {
    return Math.floor(Date.now() / 86400000)
}

function isNum(x) {
    return typeof x === 'number' && Number.isFinite(x)
}

function posOk(pos) {
    return pos && isNum(pos.latitude) && isNum(pos.longitude)
}

function stableHash(course) {
    // Only use stable fields that reflect nav state changes
    return JSON.stringify({
        ar: course?.activeRoute?.href || null,
        idx: course?.activeRoute?.pointIndex ?? null,
        total: course?.activeRoute?.pointTotal ?? null,
        prev: course?.previousPoint?.position ?? null,
        next: course?.nextPoint?.position ?? null
    })
}

function buildMsgs({ routeName, wpList }) {
    const msg130066 = {
        pgn: 130066,
        dst: 255,
        'Database ID': FIXED_DATABASE_ID,
        'Route ID': FIXED_ROUTE_ID,
        'Route/WP-List Name': routeName,
        'Change at Last Timestamp': [],
        'Number of WPs in the Route/WP-List': wpList.length,
        'Critical supplementary parameters': []
    }

    if (INCLUDE_TIME) {
        msg130066['Route/WP-List Timestamp'] = secondsSinceMidnightUtc()
        msg130066['Route/WP-List Datestamp'] = daysSinceEpochUtc()
    }

    const chunks = _.chunk(wpList, WPS_PER_PACKET)
    const msg130067s = chunks.map((chunk, chunkIndex) => ({
        pgn: 130067,
        dst: 255,
        'Start RPS#': chunkIndex * WPS_PER_PACKET,
        'nItems': chunk.length,
        'Number of WPs in the Route/WP-List': wpList.length,
        'Database ID': FIXED_DATABASE_ID,
        'Route ID': FIXED_ROUTE_ID,
        list: chunk.map(wp => ({
            'WP ID': wp.id,
            'WP Name': wp.name,
            'WP Latitude': wp.lat,
            'WP Longitude': wp.lon
        }))
    }))

    return [msg130066, ...msg130067s]
}

async function resolveActiveRouteWpList(app, course) {
    const href = course?.activeRoute?.href
    if (!href) return null

    // href typically ends in /routes/<id>
    const routeResId = path.basename(href)
    if (!routeResId) return null

    const route = await app.resourcesApi.getResource('routes', routeResId)
    const coords = route?.feature?.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length === 0) return null

    // GeoJSON coordinates: [lon, lat]
    const wpList = coords.slice(0, MAX_ROUTE_WPS).map((c, idx) => ({
        id: idx,
        name: `WP-${idx + 1}`,
        lat: c[1],
        lon: c[0]
    }))

    const filtered = wpList.filter(wp => isNum(wp.lat) && isNum(wp.lon))
    return filtered.length ? filtered : null
}

module.exports = (app, plugin) => {
    return [{
        title: 'Route & WP Service (130066, 130067) from Course API',
        optionKey: 'ROUTEWPSERVICE',

        conversions: (options) => ([
            {
                sourceType: 'timer',
                interval: 1000,
                callback: async (app) => {
                    const routeNameBase = (options?.routeName || 'SK').trim() || 'SK'

                    let course
                    try {
                        course = await app.courseApi.getCourse()
                    } catch (e) {
                        app.error(`ROUTEWPSERVICE: getCourse() failed: ${e.message || e}`)
                        return null
                    }

                    const nextPos = course?.nextPoint?.position
                    if (!posOk(nextPos)) {
                        // navigation inactive -> reset state
                        lastHash = null
                        return null
                    }

                    const hash = stableHash(course)
                    if (hash === lastHash) return null
                    lastHash = hash

                    // Determine WP list: activeRoute if available, else pseudo GoTo route (prev + next)
                    let wpList = null
                    let routeName = routeNameBase

                    if (course?.activeRoute?.href) {
                        try {
                            const resolved = await resolveActiveRouteWpList(app, course)
                            if (resolved && resolved.length >= 1) {
                                wpList = resolved
                                routeName = `${routeNameBase}-ROUTE`
                            }
                        } catch (e) {
                            app.debug(`ROUTEWPSERVICE: activeRoute resolve failed, fallback to GOTO: ${e.message || e}`)
                        }
                    }

                    if (!wpList) {
                        const prevPos = course?.previousPoint?.position
                        const hasPrev = posOk(prevPos)

                        wpList = []
                        if (hasPrev) {
                            wpList.push({ id: 0, name: 'WP-START', lat: prevPos.latitude, lon: prevPos.longitude })
                        }
                        wpList.push({
                            id: hasPrev ? 1 : 0,
                            name: 'WP-DEST',
                            lat: nextPos.latitude,
                            lon: nextPos.longitude
                        })
                        routeName = `${routeNameBase}-GOTO`
                    }

                    const msgs = buildMsgs({ routeName, wpList })
                    app.debug(`ROUTEWPSERVICE: SEND burst 130066 + ${msgs.length - 1}x130067 (wps=${wpList.length}) name=${routeName}`)

                    return msgs
                }
            }
        ]),

        properties: {
            routeName: { type: 'string', title: 'Route Name base', default: 'SK' }
        }
    }]
}