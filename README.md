# saxi
##### make plot good

saxi is a command-line tool and Scala library for interacting with the [AxiDraw
drawing machine](https://axidraw.com/) by Evil Mad Scientist. It's simple to
use from the command line, and is exactingly precise.

### Usage

```
$ saxi plot --paper-size A4 drawing.svg
$ saxi info --paper-size 5x4in --margin 0.5in --portrait drawing.svg
Estimated duration: 20m55s
Drawing bounds:
  12.70 - 88.90 mm in X
  41.21 - 85.79 mm in Y
```

### Info

saxi makes use of the low-level `LM` command introduced in EBB firmware version
2.5.3 to carry out highly accurate constant-acceleration motion plans. If your
AxiDraw is running an older version of the firmware, saxi will fall back to the
less-accurate (but still pretty accurate) `XM` command.

To check what version of the EBB firmware your AxiDraw is running, run `saxi version`:

```
$ saxi version
EBBv13_and_above EB Firmware Version 2.5.3
```

To upgrade your AxiDraw's firmware, see [here](https://github.com/evil-mad/EggBot/tree/master/EBB_firmware). 

### TODO

- Manual control from the command line, e.g. `saxi manual disable_motors`
- Expose more tooling profile parameters as configuration options

### Credits
saxi's motion planning algorithm is heavily inspired by Michael Fogleman's
[axi](https://github.com/fogleman/axi) project.

Thanks to [Evil Mad Scientist](http://www.evilmadscientist.com/) for designing
and building such a lovely machine!
