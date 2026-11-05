# signalk-to-nmea2000

[![Greenkeeper badge](https://badges.greenkeeper.io/sbender9/signalk-to-nmea2000.svg)](https://greenkeeper.io/)

Plugin to convert Signal K to NMEA2000

Requires that toChildProcess be set to nmea2000out for the actisense execute provider:

```
     {
      "id": "actisense",
      "pipeElements": [{
        "type": "providers/execute",
        "options": {
          "command": "actisense-serial /dev/ttyUSB0",
          "toChildProcess": "nmea2000out"
        }
      }
```

or you can configure your N2K connection to use canboatjs in the server admin user interface:
![image](https://user-images.githubusercontent.com/1049678/41557237-ac2e2eea-7345-11e8-8719-bbd18ef832cb.png)

Note that if you're using an NGT-1 to transmit AIS, then you need to use their Windows [NMEA Reader](https://www.actisense.com/wp-content/uploads/2017/07/Actisense-NMEA-Reader-v1.517-Setup.exe_.zip) software to add the pgns (129794, 129038, 129041) in the transmitted list.

## Data that came from NMEA 2000

Values whose source is NMEA 2000 are not sent. The plugin's output goes to every NMEA 2000 connection, so sending them would echo data back onto the bus it came from, as a second copy competing with the device that sent it. A PGN built from several paths is not sent at all if any of its inputs came from NMEA 2000.

The same holds for the active course. When a chartplotter on NMEA 2000 sets the destination, the server's Course API publishes it with that chartplotter as its source, and Cross Track Error (129283), Navigation Data (129284), Route/WP Information (129285) and the Raymarine route and waypoint PGNs (130848, 130918) are not sent until a course from another source replaces it. Servers since 2.12.0 publish this source; on older ones the course is always sent. The plugin learns the source when the course is set or changes, so after the plugin starts with such a course already active, it can be sent until the course next changes.

Two settings change this per conversion:

- **Source for …**: a source chosen here is always used, including an NMEA 2000 one.
- **Also send data that came from NMEA 2000**: turns the check off. Only useful for bridging between separate NMEA 2000 networks, with each connection's output event configured so data does not go back to the network it came from.

## More than one NMEA 2000 bus

By default the plugin sends every PGN to every NMEA 2000 connection, on `nmea2000out`. On a server that can send to one connection at a time (SignalK/signalk-server#3283), the plugin's settings list the NMEA 2000 connections that write, and a PGN can go to some of them only:

- **Output to NMEA 2000 → Send to these NMEA 2000 buses**: the buses every conversion sends to.
- **Send to these NMEA 2000 buses**, in a conversion: that conversion's own choice, instead of the one above.

With none chosen, a PGN goes to every bus, as before. A connection whose **Send broadcast N2K output** setting is off in the server gets only what is sent to it by name, so choose it here to send to it. On an older server the settings don't show, and everything goes to every bus.

A bus is chosen by the connection's ID in the server's admin UI. A chosen connection that is removed, or renamed, gets nothing until the setting is changed.

### Bridging between buses

**Output to NMEA 2000 → Bridge NMEA 2000 data between buses** sends data that came from one NMEA 2000 bus to the others, and never back to the bus it came from. It is off by default, and has no effect on a server that does not list its buses.

- The bus a value came from is the connection at the start of its `$source`. A PGN built from values from several buses goes to none of them. NMEA 2000 data whose bus is not known, or that came from a connection that only reads (which may be a second gateway on a listed bus), is not sent.
- AIS goes to every bus but the one the update came from. Fields missing from the update are filled in from what the server last had for that vessel or AtoN, which may have come from another bus.
- The PGN goes to the chosen buses, or to every bus that takes broadcasts, minus the buses its data came from. A bus whose **Send broadcast N2K output** is off gets bridged data only when it is chosen.
- Leave it off when two connections are gateways on the same physical bus: data from one would go back onto that bus through the other.
- The course PGNs (129283, 129284, 129285, 130848 and 130918) are not bridged: a course set on an NMEA 2000 chartplotter still withholds them everywhere.
- A source chosen under **Source for …**, and a conversion with **Also send data that came from NMEA 2000**, are sent to every chosen bus as before, including the one the data came from. The exception is an NMEA 2000 source chosen for an engine's notifications: it withholds 127489 as before, and with bridging the PGN goes to the other buses only.
