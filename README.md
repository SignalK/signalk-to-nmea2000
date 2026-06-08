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

Two settings change this per conversion:

- **Source for …**: a source chosen here is always used, including an NMEA 2000 one.
- **Also send data that came from NMEA 2000**: turns the check off. Only useful for bridging between separate NMEA 2000 networks, with each connection's output event configured so data does not go back to the network it came from.

## Battery mapping by source

Each entry in `BATTERYv2.batteries` can set an optional `source`, so the same Signal K battery id published by different sources can be sent as different NMEA 2000 battery instances.

Example:

```json
{
  "BATTERYv2": {
    "enabled": true,
    "batteries": [
      {
        "signalkId": "house",
        "source": "venus.com.ttyO1",
        "instanceId": 1
      },
      {
        "signalkId": "house",
        "source": "bmv.ttyUSB0",
        "instanceId": 2
      }
    ]
  }
}
```

With this setup instance 1 only carries data from `venus.com.ttyO1` and instance 2 only data from `bmv.ttyUSB0`.

- An empty `source` means no filtering: that entry takes the battery's data from every source. Give each entry its own `source` when several entries share a Signal K battery id, or the entry without one will also send the other entries' data.
- The `source` applies to all of the battery's values (voltage, current, temperature, state of charge, time remaining, state of health and ripple). If one source sends the voltage and another the state of charge, setting a `source` leaves the other source's values out, and they are sent as not available.
- A `source` that is an NMEA 2000 device is not sent back to the bus, the same as any other data that came from NMEA 2000 (see above). Use the device's own configuration to change its battery instance.
