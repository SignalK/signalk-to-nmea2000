# signalk-to-nmea2000

[![Greenkeeper badge](https://badges.greenkeeper.io/sbender9/signalk-to-nmea2000.svg)](https://greenkeeper.io/)

Plugin to convert Signal K to NMEA2000

Currently only support apparent wind, gps location and system time.

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
