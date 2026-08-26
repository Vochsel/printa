/**
 * Coordinate helpers for building a physical model of a place.
 *
 * Everything is reduced to a local East-North-Up frame in metres, centred on
 * the address being printed. At the scale of a city block the curvature of the
 * earth is far below the resolution of any printer, so a local tangent plane
 * is exact enough and keeps the rest of the pipeline in plain Cartesian maths.
 */

const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);

export type LngLat = [number, number];

/** Geodetic (degrees, metres) to earth-centred earth-fixed metres. */
export function toEcef(latDeg: number, lngDeg: number, height = 0): [number, number, number] {
  const lat = (latDeg * Math.PI) / 180;
  const lng = (lngDeg * Math.PI) / 180;
  const sinLat = Math.sin(lat);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  return [
    (n + height) * Math.cos(lat) * Math.cos(lng),
    (n + height) * Math.cos(lat) * Math.sin(lng),
    (n * (1 - WGS84_E2) + height) * sinLat,
  ];
}

/**
 * A local frame at one point: converts ECEF metres into east/north/up metres
 * relative to that point.
 */
export class LocalFrame {
  readonly origin: [number, number, number];
  private readonly east: [number, number, number];
  private readonly north: [number, number, number];
  private readonly up: [number, number, number];
  readonly lat: number;
  readonly lng: number;

  constructor(latDeg: number, lngDeg: number, height = 0) {
    this.lat = latDeg;
    this.lng = lngDeg;
    this.origin = toEcef(latDeg, lngDeg, height);

    const lat = (latDeg * Math.PI) / 180;
    const lng = (lngDeg * Math.PI) / 180;
    const sLat = Math.sin(lat);
    const cLat = Math.cos(lat);
    const sLng = Math.sin(lng);
    const cLng = Math.cos(lng);

    this.east = [-sLng, cLng, 0];
    this.north = [-sLat * cLng, -sLat * sLng, cLat];
    this.up = [cLat * cLng, cLat * sLng, sLat];
  }

  /** ECEF metres to local east/north/up metres. */
  fromEcef(x: number, y: number, z: number): [number, number, number] {
    const dx = x - this.origin[0];
    const dy = y - this.origin[1];
    const dz = z - this.origin[2];
    return [
      dx * this.east[0] + dy * this.east[1] + dz * this.east[2],
      dx * this.north[0] + dy * this.north[1] + dz * this.north[2],
      dx * this.up[0] + dy * this.up[1] + dz * this.up[2],
    ];
  }

  /** Longitude/latitude degrees to local east/north metres. */
  fromLngLat(lng: number, lat: number): [number, number] {
    const mPerDegLat = 111_132.92 - 559.82 * Math.cos((2 * this.lat * Math.PI) / 180);
    const mPerDegLng =
      111_412.84 * Math.cos((this.lat * Math.PI) / 180) -
      93.5 * Math.cos((3 * this.lat * Math.PI) / 180);
    return [(lng - this.lng) * mPerDegLng, (lat - this.lat) * mPerDegLat];
  }

  /** Local east/north metres back to longitude/latitude degrees. */
  toLngLat(east: number, north: number): LngLat {
    const mPerDegLat = 111_132.92 - 559.82 * Math.cos((2 * this.lat * Math.PI) / 180);
    const mPerDegLng =
      111_412.84 * Math.cos((this.lat * Math.PI) / 180) -
      93.5 * Math.cos((3 * this.lat * Math.PI) / 180);
    return [this.lng + east / mPerDegLng, this.lat + north / mPerDegLat];
  }
}

/** Metres per degree of latitude/longitude at a given latitude. */
export function degreeSpan(latDeg: number, metres: number): { dLat: number; dLng: number } {
  const mPerDegLat = 111_132.92 - 559.82 * Math.cos((2 * latDeg * Math.PI) / 180);
  const mPerDegLng = Math.max(
    1,
    111_412.84 * Math.cos((latDeg * Math.PI) / 180) -
      93.5 * Math.cos((3 * latDeg * Math.PI) / 180),
  );
  return { dLat: metres / mPerDegLat, dLng: metres / mPerDegLng };
}
