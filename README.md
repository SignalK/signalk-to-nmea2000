# signalk-to-nmea2000
Plugin to convert Signal K to NMEA2000

Currently only support apparent wind data

Requires that toChildProcess be set to nmea2000out for the actisense execute provider:

{
      "id": "actisense",
      "pipeElements": [{
        "type": "providers/execute",
        "options": {
          "command": "actisense-serial /dev/ttyUSB0",
          "toChildProcess": "nmea2000out"
        }
      }
