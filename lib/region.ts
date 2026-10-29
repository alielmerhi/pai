// Koordinaten = Mittelpunkt der PLZ (kein Straßenname wird übertragen). Grobe Fahrzeiten ohne Kartendienst.
export type Geo = { lat: number; lon: number };
export function km(a: Geo, b: Geo) {
  const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Luftlinie × 1,35 Straßenfaktor bei Ø 50 km/h + 5 Min. Parken/Ankommen; gleiche PLZ ≈ 10 Min.
export const fahrMin = (a: Geo, b: Geo) => Math.max(10, Math.round(km(a, b) * 1.35 / 50 * 60 + 5));
export const fahrKm = (a: Geo, b: Geo) => Math.round(km(a, b) * 1.35);
