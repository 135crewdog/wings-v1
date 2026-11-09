// The ground of a place: height and surface at any point (flight-model §11.1). Pure functions of
// the place record (data/places/<id>.json) and the surface table (data/surfaces.json); no browser
// code, so the sim's tests use it too.
//
// M2's ground is flat at the place's height, its default surface everywhere except on runways.

const DEG = Math.PI / 180;

/** A runway's centre (m north, east), unit direction along it, half length and half width. */
export function runwayFrame(rw) {
  const h = rw.heading_deg * DEG;
  return {
    centre: rw.centre_m,
    along: [Math.cos(h), Math.sin(h)],
    across: [-Math.sin(h), Math.cos(h)], // to the right of the heading
    halfLength: rw.length_m / 2,
    halfWidth: rw.width_m / 2,
  };
}

/** Where a point (north, east) is relative to a runway: metres along and across from its centre. */
export function onRunway(frame, north, east) {
  const dn = north - frame.centre[0], de = east - frame.centre[1];
  return {
    along: dn * frame.along[0] + de * frame.along[1],
    across: dn * frame.across[0] + de * frame.across[1],
  };
}

/** The ground of a place: { heightAt(north, east), surfaceAt(north, east), surfaces }. */
export function makeGround(place, surfaces) {
  const height = place.ground.height_m;
  const runways = (place.runways ?? []).map((rw) => ({ frame: runwayFrame(rw), surface: rw.surface }));
  for (const name of [place.ground.surface, ...runways.map((r) => r.surface)]) {
    if (!surfaces[name]) throw new Error(`no surface "${name}" in the surface table`);
  }
  return {
    heightAt: () => height,
    surfaceAt(north, east) {
      for (const r of runways) {
        const p = onRunway(r.frame, north, east);
        if (Math.abs(p.along) <= r.frame.halfLength && Math.abs(p.across) <= r.frame.halfWidth) return r.surface;
      }
      return place.ground.surface;
    },
    surfaces,
  };
}

/**
 * A start position from the place record: { north, east, altitude, heading (rad), speed (m/s) }.
 * along_m and across_m are from the runway's centre, along its heading and to its right.
 */
export function startPose(place, id) {
  const s = place.starts.find((x) => x.id === id);
  if (!s) throw new Error(`no start "${id}" at ${place.id}`);
  const rw = place.runways.find((r) => r.name === s.runway);
  const f = runwayFrame(rw);
  return {
    north: f.centre[0] + s.along_m * f.along[0] + s.across_m * f.across[0],
    east: f.centre[1] + s.along_m * f.along[1] + s.across_m * f.across[1],
    altitude: place.ground.height_m + s.height_m,
    heading: s.heading_deg * DEG,
    speed: s.speed_kmh / 3.6,
  };
}
