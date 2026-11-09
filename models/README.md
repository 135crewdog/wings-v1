# Models

The airplanes' 3D models are generated, never drawn by hand. `gen_aircraft.py` builds a low-poly,
flat-shaded, textured model from a shape file and its skins, and exports the `.glb` the app loads from
`assets/models/`. Its docstring is the reference for the shape-file format, the skins (liveries), the
moving parts and the glTF extras the app reads.

```
gen_aircraft.py          the generator (Blender as a Python module: pip install bpy, with numpy)
shapes/<id>.json         each airplane's shape, in feet: x aft from the nose, y left, z up
skins/<id>/<name>.json   its liveries, as paint rules in the same frame
trace/<id>/              how its shape was measured: tracing and fitting scripts and their output
```

Rebuild an airplane (writes `<id>.glb` and its skin and texture PNGs to the output folder):

```sh
python3 models/gen_aircraft.py models/shapes/twin-ii-acro.json /tmp/out
cp /tmp/out/twin-ii-acro.glb assets/models/
```

The tracing scripts read three-views and photos, which are other people's documents and live in the
private `wings-reference` repo (`CLAUDE.md`, Never). `trace/twin-ii-acro/make_shape.py` rewrites the
shape file and both skins from `fuselage_fit.json` and the published data in it.
