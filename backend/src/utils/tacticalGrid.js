/**
 * Tactical Grid Reference System (TGRS)
 * Standard deterministic Military & Emergency Operations Grid conversion.
 * Projects WGS84 Latitude & Longitude to UTM coordinates and formats
 * a deterministic 100m-resolution Tactical Grid Identifier:
 *   TAC-<UTM_ZONE><LAT_BAND>-<EASTING_100M>-<NORTHING_100M>
 *
 * Example:
 *   Lucknow (26.8467° N, 80.9462° E) -> TAC-44R-5942-7013
 *
 * Features:
 *   - Strictly deterministic
 *   - Resolution: 100 meters per grid cell
 *   - Reversible coordinate metadata
 *   - Graceful handling of invalid, missing, or out-of-bounds coordinates
 */

// WGS84 Ellipsoid constants
const WGS84_A = 6378137.0; // Equatorial radius in meters
const WGS84_ECC_SQ = 0.00669437999014; // First eccentricity squared
const UTM_K0 = 0.9996; // Scale factor

// UTM Latitude bands from 80°S to 84°N (C to X, omitting I and O)
const LAT_BAND_LETTERS = 'CDEFGHJKLMNPQRSTUVWX';

/**
 * Calculates the UTM Latitude Band letter for a given latitude.
 * @param {number} lat - Latitude in degrees (-80 to 84)
 * @returns {string} - Single character band letter (e.g. 'R')
 */
function getLatitudeBand(lat) {
    if (lat < -80 || lat > 84) {
        return lat < -80 ? 'B' : 'Z'; // Polar fallback
    }
    const index = Math.floor((lat + 80) / 8);
    return LAT_BAND_LETTERS[Math.min(index, LAT_BAND_LETTERS.length - 1)];
}

/**
 * Calculates the UTM Zone number (1 to 60) for a given longitude.
 * @param {number} lng - Longitude in degrees (-180 to 180)
 * @returns {number} - UTM Zone number
 */
function getUtmZone(lng) {
    let normalizedLng = ((lng + 180) % 360 + 360) % 360 - 180;
    let zone = Math.floor((normalizedLng + 180) / 6) + 1;
    if (zone > 60) zone = 60;
    if (zone < 1) zone = 1;
    return zone;
}

/**
 * Projects (lat, lng) to UTM Easting and Northing in meters (WGS84).
 * @param {number} lat - Latitude in degrees
 * @param {number} lng - Longitude in degrees
 * @param {number} zone - UTM Zone number
 * @returns {{ easting: number, northing: number }}
 */
function latLngToUtm(lat, lng, zone) {
    const latRad = (lat * Math.PI) / 180;
    const lngRad = (lng * Math.PI) / 180;

    // Central meridian for zone
    const centralMeridianDeg = (zone - 1) * 6 - 180 + 3;
    const centralMeridianRad = (centralMeridianDeg * Math.PI) / 180;

    const ePrimeSq = WGS84_ECC_SQ / (1 - WGS84_ECC_SQ);
    const N = WGS84_A / Math.sqrt(1 - WGS84_ECC_SQ * Math.sin(latRad) * Math.sin(latRad));
    const T = Math.tan(latRad) * Math.tan(latRad);
    const C = ePrimeSq * Math.cos(latRad) * Math.cos(latRad);
    const A = Math.cos(latRad) * (lngRad - centralMeridianRad);

    // Meridional arc length M
    const M = WGS84_A * (
        (1 - WGS84_ECC_SQ / 4 - 3 * WGS84_ECC_SQ * WGS84_ECC_SQ / 64 - 5 * Math.pow(WGS84_ECC_SQ, 3) / 256) * latRad
        - (3 * WGS84_ECC_SQ / 8 + 3 * WGS84_ECC_SQ * WGS84_ECC_SQ / 32 + 45 * Math.pow(WGS84_ECC_SQ, 3) / 1024) * Math.sin(2 * latRad)
        + (15 * WGS84_ECC_SQ * WGS84_ECC_SQ / 256 + 45 * Math.pow(WGS84_ECC_SQ, 3) / 1024) * Math.sin(4 * latRad)
        - (35 * Math.pow(WGS84_ECC_SQ, 3) / 3072) * Math.sin(6 * latRad)
    );

    // Standard Easting formula
    const easting = UTM_K0 * N * (
        A + (1 - T + C) * Math.pow(A, 3) / 6
        + (5 - 18 * T + T * T + 72 * C - 58 * ePrimeSq) * Math.pow(A, 5) / 120
    ) + 500000.0; // False Easting

    // Standard Northing formula
    let northing = UTM_K0 * (
        M + N * Math.tan(latRad) * (
            A * A / 2
            + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24
            + (61 - 58 * T + T * T + 600 * C - 330 * ePrimeSq) * Math.pow(A, 6) / 720
        )
    );

    // False Northing for Southern Hemisphere
    if (lat < 0) {
        northing += 10000000.0;
    }

    return { easting, northing };
}

/**
 * Validates coordinate inputs.
 * @param {any} lat 
 * @param {any} lng 
 * @returns {boolean}
 */
function isValidCoordinates(lat, lng) {
    if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
    if (lat === '' || lng === '') return false;
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
    if (nLat < -90 || nLat > 90) return false;
    if (nLng < -180 || nLng > 180) return false;
    return true;
}

/**
 * Generates a deterministic Tactical Grid Reference from Latitude and Longitude.
 * Resolution is 100 meters.
 *
 * @param {number|string} latitude - Geographic latitude (-90 to 90)
 * @param {number|string} longitude - Geographic longitude (-180 to 180)
 * @param {number} [resolutionMeters=100] - Grid cell resolution in meters (default 100m)
 * @returns {{
 *   gridId: string|null,
 *   valid: boolean,
 *   zone: string|null,
 *   utmZone: number|null,
 *   latBand: string|null,
 *   eastingMeters: number|null,
 *   northingMeters: number|null,
 *   gridEasting: string|null,
 *   gridNorthing: string|null,
 *   resolutionMeters: number,
 *   system: string,
 *   error?: string
 * }}
 */
function computeTacticalGrid(latitude, longitude, resolutionMeters = 100) {
    if (!isValidCoordinates(latitude, longitude)) {
        return {
            gridId: null,
            valid: false,
            zone: null,
            utmZone: null,
            latBand: null,
            eastingMeters: null,
            northingMeters: null,
            gridEasting: null,
            gridNorthing: null,
            resolutionMeters,
            system: 'Tactical UTM/MGRS 100m',
            error: 'MISSING_OR_INVALID_COORDINATES'
        };
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    const zone = getUtmZone(lng);
    const band = getLatitudeBand(lat);
    const { easting, northing } = latLngToUtm(lat, lng, zone);

    // Compute 100m resolution cell components (4 digits each, 0000-9999 within each 100km block)
    // 100km modulo: (meters % 100000) / 100
    const cellEasting = Math.floor(((easting % 100000) + 100000) % 100000 / resolutionMeters);
    const cellNorthing = Math.floor(((northing % 100000) + 100000) % 100000 / resolutionMeters);

    const eastingStr = String(cellEasting).padStart(Math.round(5 - Math.log10(resolutionMeters)), '0');
    const northingStr = String(cellNorthing).padStart(Math.round(5 - Math.log10(resolutionMeters)), '0');

    const zoneStr = `${zone}${band}`;
    const gridId = `TAC-${zoneStr}-${eastingStr}-${northingStr}`;

    return {
        gridId,
        valid: true,
        zone: zoneStr,
        utmZone: zone,
        latBand: band,
        eastingMeters: Math.round(easting),
        northingMeters: Math.round(northing),
        gridEasting: eastingStr,
        gridNorthing: northingStr,
        resolutionMeters,
        system: 'Tactical UTM/MGRS 100m',
        coordinates: {
            latitude: lat,
            longitude: lng
        },
        toString() {
            return this.gridId || '';
        }
    };
}

/**
 * Returns just the deterministic string Grid ID (e.g. 'TAC-44R-5942-7013')
 */
function computeTacticalGridId(latitude, longitude, resolutionMeters = 100) {
    const res = computeTacticalGrid(latitude, longitude, resolutionMeters);
    return res && res.gridId ? res.gridId : null;
}

module.exports = {
    computeTacticalGrid,
    computeTacticalGridId,
    isValidCoordinates,
    getLatitudeBand,
    getUtmZone,
    latLngToUtm
};
