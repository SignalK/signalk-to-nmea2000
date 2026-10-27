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
