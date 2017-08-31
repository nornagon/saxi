# saxi
##### make plot good

saxi is a command-line tool and Scala library for interacting with the [AxiDraw
drawing machine](https://axidraw.com/). It's simple to use from the command
line, and is exactingly precise.

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

- Handle quadratic and cubic curves (`C`, `S`, `Q` and `T`) in SVG data [&lbrack;1&rbrack;](https://pomax.github.io/bezierinfo/#tracing) [&lbrack;2&rbrack;](http://sketch.paperjs.org/#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) [&lbrack;3&rbrack;](https://stackoverflow.com/questions/35275073/uniform-discretization-of-bezier-curve)
- Handle SVG arcs (`A`)
- Handle non-path elements, i.e. `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`
- Manual control from the command line, e.g. `saxi manual disable_motors`
- Expose tooling profiles as configuration options

### Credits
saxi's motion planning algorithm is heavily inspired by Michael Fogleman's
[axi](https://github.com/fogleman/axi) project.

Thanks to [Evil Mad Scientist](http://www.evilmadscientist.com/) for designing
and building such a lovely machine!
