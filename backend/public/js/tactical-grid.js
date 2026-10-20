/**
 * Tactical Grid Reference System (TGRS) - Browser Frontend Client
 * Deterministic conversion of GPS Coordinates to Tactical Grid ID.
 */
(function(window) {
    'use strict';

    const WGS84_A = 6378137.0;
    const WGS84_ECC_SQ = 0.00669437999014;
    const UTM_K0 = 0.9996;
    const LAT_BAND_LETTERS = 'CDEFGHJKLMNPQRSTUVWX';

    function getLatitudeBand(lat) {
        if (lat < -80 || lat > 84) return lat < -80 ? 'B' : 'Z';
        const index = Math.floor((lat + 80) / 8);
        return LAT_BAND_LETTERS[Math.min(index, LAT_BAND_LETTERS.length - 1)];
    }

    function getUtmZone(lng) {
        let normalizedLng = ((lng + 180) % 360 + 360) % 360 - 180;
        let zone = Math.floor((normalizedLng + 180) / 6) + 1;
        if (zone > 60) zone = 60;
        if (zone < 1) zone = 1;
        return zone;
    }

    function latLngToUtm(lat, lng, zone) {
        const latRad = (lat * Math.PI) / 180;
        const lngRad = (lng * Math.PI) / 180;
        const centralMeridianDeg = (zone - 1) * 6 - 180 + 3;
        const centralMeridianRad = (centralMeridianDeg * Math.PI) / 180;

        const ePrimeSq = WGS84_ECC_SQ / (1 - WGS84_ECC_SQ);
        const N = WGS84_A / Math.sqrt(1 - WGS84_ECC_SQ * Math.sin(latRad) * Math.sin(latRad));
        const T = Math.tan(latRad) * Math.tan(latRad);
        const C = ePrimeSq * Math.cos(latRad) * Math.cos(latRad);
        const A = Math.cos(latRad) * (lngRad - centralMeridianRad);

        const M = WGS84_A * (
            (1 - WGS84_ECC_SQ / 4 - 3 * WGS84_ECC_SQ * WGS84_ECC_SQ / 64 - 5 * Math.pow(WGS84_ECC_SQ, 3) / 256) * latRad
            - (3 * WGS84_ECC_SQ / 8 + 3 * WGS84_ECC_SQ * WGS84_ECC_SQ / 32 + 45 * Math.pow(WGS84_ECC_SQ, 3) / 1024) * Math.sin(2 * latRad)
            + (15 * WGS84_ECC_SQ * WGS84_ECC_SQ / 256 + 45 * Math.pow(WGS84_ECC_SQ, 3) / 1024) * Math.sin(4 * latRad)
            - (35 * Math.pow(WGS84_ECC_SQ, 3) / 3072) * Math.sin(6 * latRad)
        );

        const easting = UTM_K0 * N * (
            A + (1 - T + C) * Math.pow(A, 3) / 6
            + (5 - 18 * T + T * T + 72 * C - 58 * ePrimeSq) * Math.pow(A, 5) / 120
        ) + 500000.0;

        let northing = UTM_K0 * (
            M + N * Math.tan(latRad) * (
                A * A / 2
                + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24
                + (61 - 58 * T + T * T + 600 * C - 330 * ePrimeSq) * Math.pow(A, 6) / 720
            )
        );

        if (lat < 0) northing += 10000000.0;
        return { easting, northing };
    }

    function isValidCoordinates(lat, lng) {
        if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
        if (lat === '' || lng === '') return false;
        const nLat = Number(lat);
        const nLng = Number(lng);
        if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
        if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) return false;
        return true;
    }

    function computeTacticalGrid(latitude, longitude, resolutionMeters) {
        resolutionMeters = resolutionMeters || 100;
        if (!isValidCoordinates(latitude, longitude)) {
            return {
                gridId: null,
                valid: false,
                system: 'Tactical UTM/MGRS 100m',
                error: 'GPS_UNAVAILABLE'
            };
        }

        const lat = Number(latitude);
        const lng = Number(longitude);
        const zone = getUtmZone(lng);
        const band = getLatitudeBand(lat);
        const utm = latLngToUtm(lat, lng, zone);

        const cellEasting = Math.floor(((utm.easting % 100000) + 100000) % 100000 / resolutionMeters);
        const cellNorthing = Math.floor(((utm.northing % 100000) + 100000) % 100000 / resolutionMeters);

        const digits = Math.round(5 - Math.log10(resolutionMeters));
        const eastingStr = String(cellEasting).padStart(digits, '0');
        const northingStr = String(cellNorthing).padStart(digits, '0');
        const zoneStr = `${zone}${band}`;
        const gridId = `TAC-${zoneStr}-${eastingStr}-${northingStr}`;

        return {
            gridId,
            valid: true,
            zone: zoneStr,
            utmZone: zone,
            latBand: band,
            eastingMeters: Math.round(utm.easting),
            northingMeters: Math.round(utm.northing),
            gridEasting: eastingStr,
            gridNorthing: northingStr,
            resolutionMeters,
            system: 'Tactical UTM/MGRS 100m',
            coordinates: { latitude: lat, longitude: lng },
            toString: function() { return this.gridId || ''; }
        };
    }

    function computeTacticalGridId(latitude, longitude, resolutionMeters) {
        var res = computeTacticalGrid(latitude, longitude, resolutionMeters);
        return res && res.gridId ? res.gridId : null;
    }

    window.TacticalGrid = {
        computeTacticalGrid,
        computeTacticalGridId,
        isValidCoordinates,
        getLatitudeBand,
        getUtmZone
    };

})(typeof window !== 'undefined' ? window : this);
