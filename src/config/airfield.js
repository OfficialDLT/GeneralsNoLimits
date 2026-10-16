// Shared coordinates for the airport mesh and aircraft ground operations.
export const AIRFIELD = {
  capacity: 4,
  runwayX: 21,
  runwayStart: -48,
  runwayEnd: 48,
  parkingX: -17,
  parkingZ: [-33, -11, 11, 33],
};
export function airfieldPoint(base, x, z) {
  const angle = base.rotation || 0;
  return { x: base.x + x * Math.cos(angle) + z * Math.sin(angle),
    z: base.z - x * Math.sin(angle) + z * Math.cos(angle) };
}
