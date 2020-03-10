## Change Log

### v2.8.0 (2020/03/10 18:53 +00:00)
- [#40](https://github.com/SignalK/signalk-to-nmea2000/pull/40) Added Atmospheric Pressure using Environmental Parameters PGN 130311. (@htool)
- [#44](https://github.com/SignalK/signalk-to-nmea2000/pull/44) feture: add a setting to configure how to resend (@sbender9)
- [#42](https://github.com/SignalK/signalk-to-nmea2000/pull/42) fix: show an error message for unknown tank types (@sbender9)
- [#41](https://github.com/SignalK/signalk-to-nmea2000/pull/41) feature: add support for conversions to use subscriptions (@sbender9)

### v2.7.0 (2020/03/03 17:21 +00:00)
- [#39](https://github.com/SignalK/signalk-to-nmea2000/pull/39) feature: add option to periodically resend data to the bus (@sbender9)

### v2.6.0 (2020/02/22 19:36 +00:00)
- [#37](https://github.com/SignalK/signalk-to-nmea2000/pull/37) Feature: Extend support for other PGN 130312 temperature sources (@jncarter123)

### v2.5.0 (2019/07/27 18:43 +00:00)
- [#30](https://github.com/SignalK/signalk-to-nmea2000/pull/30) chore: update to latest canboatjs (@sbender9)
- [#29](https://github.com/SignalK/signalk-to-nmea2000/pull/29) feature: support "greyWater"  keys (@sbender9)

### v2.4.1 (2019/06/04 17:32 +00:00)
- [#26](https://github.com/SignalK/signalk-to-nmea2000/pull/26) fix: bad heading values causing ais encoding to fail (@sbender9)

### v2.4.0 (2019/05/29 12:48 +00:00)
- [#25](https://github.com/SignalK/signalk-to-nmea2000/pull/25)  feature: add Speed Through Water PGN (@jtroyer76)

### v2.3.0 (2019/05/02 12:13 +00:00)
- [#24](https://github.com/SignalK/signalk-to-nmea2000/pull/24) feature: add engine parameters rapid update 127488 (@sbender9)

### v2.2.4 (2018/11/06 20:01 +00:00)
- [#23](https://github.com/SignalK/signalk-to-nmea2000/pull/23) fix; update to support changes to the Instance field names in canboat (@sbender9)

### v2.2.3 (2018/09/13 23:30 +00:00)
- [#22](https://github.com/SignalK/signalk-to-nmea2000/pull/22) fix: alternator voltage is getting set to the wrong value (@sbender9)

### v2.2.2 (2018/09/13 16:31 +00:00)
- [#19](https://github.com/SignalK/signalk-to-nmea2000/pull/19) fix: Engine Parameters, Dynamic not getting generated correctly (@sbender9)

### v2.2.1 (2018/08/10 01:18 +00:00)
- [#18](https://github.com/SignalK/signalk-to-nmea2000/pull/18) fix: saving configuration fails when there is no tank data in signalk (@sbender9)

### v2.2.0 (2018/07/14 17:35 +00:00)
- [#12](https://github.com/SignalK/signalk-to-nmea2000/pull/12) [WIP] chore: update to use the latest plugin api (@sbender9)
- [#16](https://github.com/SignalK/signalk-to-nmea2000/pull/16) feature: implement temperature and dynamic engine parameter sending (@mairas)
- [#15](https://github.com/SignalK/signalk-to-nmea2000/pull/15) doc: add reference to canboatjs & admin ui (@tkurki)
- [#13](https://github.com/SignalK/signalk-to-nmea2000/pull/13) doc: note adding pgns to allowed tx list of ntg-1 (@webmasterkai)

### v2.1.0 (2018/02/06 04:03 +00:00)
- [#11](https://github.com/SignalK/signalk-to-nmea2000/pull/11) feature: add conversion for tank level and capacity (@sbender9)

### v2.0.1 (2018/02/05 23:44 +00:00)
- [#10](https://github.com/SignalK/signalk-to-nmea2000/pull/10) fix: battery conversion not working (@sbender9)

### v2.0.0 (2018/01/30 00:42 +00:00)
- [#8](https://github.com/SignalK/signalk-to-nmea2000/pull/8)  refactor: break conversion out into separate files and use canboatjs (@sbender9)
- [#6](https://github.com/SignalK/signalk-to-nmea2000/pull/6) fix: ais PGNs (@sbender9)
- [#5](https://github.com/SignalK/signalk-to-nmea2000/pull/5) Update dependencies to enable Greenkeeper 🌴 (@greenkeeper[bot])
- [#2](https://github.com/SignalK/signalk-to-nmea2000/pull/2) Add 127250 heading (magnetic) conversion (@tkurki)
- [#1](https://github.com/SignalK/signalk-to-nmea2000/pull/1) Formatting & titles to the ui (@tkurki)