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

## Battery mapping by source

`BATTERYv2.batteries` now supports an optional `source` field so you can map multiple Signal K battery IDs from different sources to different N2K instances.

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
        "source": "",
        "instanceId": 2
      }
    ]
  }
}
```

With this setup, each mapping only listens to updates from its own `source`, so source + Signal K battery ID selects the N2K battery instance.
