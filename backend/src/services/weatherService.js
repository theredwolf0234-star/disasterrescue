const db = require('../config/database');
const { generateUUID } = require('../utils/idGenerator');

// WMO Weather interpretation codes for Open-Meteo fallback
function interpretWMOCode(code) {
    if (code === 0) return 'Clear sky';
    if (code === 1 || code === 2 || code === 3) return 'Partly cloudy';
    if (code >= 45 && code <= 48) return 'Foggy';
    if (code >= 51 && code <= 55) return 'Drizzle';
    if (code >= 61 && code <= 65) return 'Rain';
    if (code >= 71 && code <= 77) return 'Snow';
    if (code >= 80 && code <= 82) return 'Rain showers';
    if (code >= 95 && code <= 99) return 'Thunderstorm';
    return 'Overcast';
}

function format5DayForecastFromOpenMeteo(dailyData) {
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const forecast = [];
    if (!dailyData || !dailyData.time || !Array.isArray(dailyData.time)) return [];

    const count = Math.min(5, dailyData.time.length);
    for (let i = 0; i < count; i++) {
        const dateStr = dailyData.time[i];
        const dateObj = new Date(dateStr);
        const dayOfWeek = daysOfWeek[dateObj.getDay()] || `Day ${i + 1}`;
        const code = dailyData.weather_code ? dailyData.weather_code[i] : 0;
        const condition = interpretWMOCode(code);
        const tempMax = dailyData.temperature_2m_max ? Math.round(dailyData.temperature_2m_max[i]) : null;
        const tempMin = dailyData.temperature_2m_min ? Math.round(dailyData.temperature_2m_min[i]) : null;
        const precipProb = dailyData.precipitation_probability_max ? Math.round(dailyData.precipitation_probability_max[i]) : 0;
        const precipMm = dailyData.precipitation_sum ? Number(Number(dailyData.precipitation_sum[i] || 0).toFixed(1)) : 0;
        const windMax = dailyData.wind_speed_10m_max ? Math.round(dailyData.wind_speed_10m_max[i]) : 0;

        let warning = null;
        if (precipMm >= 25 || precipProb >= 80 || code >= 95) {
            warning = 'Official Alert Watch: High probability of localized convective thunderstorms and heavy waterlogging.';
        } else if (windMax >= 50) {
            warning = 'Gale Warning: High wind velocity expected.';
        } else if (tempMax >= 42) {
            warning = 'Heat Advisory: Severe heat conditions predicted.';
        }

        forecast.push({
            date: dateStr,
            dayOfWeek,
            condition,
            weatherCode: code,
            tempMax,
            tempMin,
            precipitationProbability: precipProb,
            expectedPrecipitationMm: precipMm,
            maxWindSpeedKph: windMax,
            warning,
            isSevere: Boolean(warning)
        });
    }
    return forecast;
}

function format5DayForecastFromWeatherAPI(forecastDays = []) {
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return forecastDays.slice(0, 5).map((f) => {
        const dateStr = f.date;
        const dateObj = new Date(dateStr);
        const dayOfWeek = daysOfWeek[dateObj.getDay()] || 'Forecast Day';
        const day = f.day || {};
        const cond = day.condition ? day.condition.text : 'Clear';
        const precipMm = Number(day.totalprecip_mm || 0);
        const precipProb = Number(day.daily_chance_of_rain || 0);
        const windMax = Math.round(day.maxwind_kph || 0);

        let warning = null;
        if (precipMm >= 25 || precipProb >= 80 || cond.toLowerCase().includes('thunder')) {
            warning = 'Severe Weather Advisory: Heavy rainfall and storm potential.';
        } else if (windMax >= 50) {
            warning = 'High Wind Warning: Structural precaution advised.';
        }

        return {
            date: dateStr,
            dayOfWeek,
            condition: cond,
            conditionIcon: day.condition && day.condition.icon ? (day.condition.icon.startsWith('http') ? day.condition.icon : `https:${day.condition.icon}`) : null,
            tempMax: Math.round(day.maxtemp_c || 0),
            tempMin: Math.round(day.mintemp_c || 0),
            precipitationProbability: precipProb,
            expectedPrecipitationMm: precipMm,
            maxWindSpeedKph: windMax,
            warning,
            isSevere: Boolean(warning)
        };
    });
}

/**
 * Fetches real weather telemetry and 5-day daily forecast, prioritizing WeatherAPI.com if configured,
 * with seamless fallback to Open-Meteo and database cache.
 */
async function fetchRealWeather(lat, lng, customApiKey = null) {
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
        throw new Error('Valid latitude and longitude are required');
    }

    const weatherApiKey = customApiKey || process.env.WEATHERAPI_KEY || process.env.WEATHER_API_KEY;
    let hadKeyError = false;

    // 1. TRY WEATHERAPI.COM IF KEY IS CONFIGURED (WITH 5-DAY FORECAST)
    if (weatherApiKey && weatherApiKey.trim().length > 0) {
        try {
            const wapiUrl = `https://api.weatherapi.com/v1/forecast.json?key=${encodeURIComponent(weatherApiKey.trim())}&q=${latitude},${longitude}&days=5&aqi=yes&alerts=yes`;
            const res = await fetch(wapiUrl, { signal: AbortSignal.timeout(7000) });
            
            if (res.ok) {
                const data = await res.json();
                const cur = data.current || {};
                const loc = data.location || {};
                const forecastDayList = (data.forecast && data.forecast.forecastday) || [];

                const temp = cur.temp_c !== undefined ? cur.temp_c : null;
                const rain = cur.precip_mm !== undefined ? cur.precip_mm : 0;
                const wind = cur.wind_kph !== undefined ? cur.wind_kph : 0;
                const humidity = cur.humidity !== undefined ? cur.humidity : null;
                const condition = cur.condition ? cur.condition.text : 'Clear';
                const conditionIcon = cur.condition && cur.condition.icon ? (cur.condition.icon.startsWith('http') ? cur.condition.icon : `https:${cur.condition.icon}`) : null;

                let severeAlert = null;
                if (data.alerts && Array.isArray(data.alerts.alert) && data.alerts.alert.length > 0) {
                    severeAlert = data.alerts.alert.map(a => a.headline || a.event).join('; ');
                } else if (rain > 20 || condition.toLowerCase().includes('thunder') || condition.toLowerCase().includes('storm')) {
                    severeAlert = 'Flash Flood & Thunderstorm Watch: Severe localized precipitation detected.';
                } else if (wind > 50) {
                    severeAlert = 'Gale Warning: High wind velocity poses structural hazards.';
                }

                const forecast5Days = format5DayForecastFromWeatherAPI(forecastDayList);

                const report = {
                    latitude,
                    longitude,
                    locationName: loc.name ? `${loc.name}, ${loc.region || loc.country}` : 'Monitored Zone',
                    temperature: temp,
                    rainfall: rain,
                    windSpeed: wind,
                    humidity,
                    condition,
                    conditionIcon,
                    uv: cur.uv || 0,
                    airQuality: cur.air_quality || null,
                    severeAlert,
                    provider: 'WeatherAPI.com',
                    dataStatus: 'LIVE',
                    isLive: true,
                    isStale: false,
                    hadKeyError: false,
                    forecast5Days,
                    fetchedAt: new Date().toISOString()
                };

                // Cache in database
                cacheWeatherReport(report).catch(() => {});
                return report;
            } else {
                console.warn(`[WeatherService] WeatherAPI.com returned status ${res.status}, falling back to Open-Meteo.`);
                if (res.status === 401 || res.status === 403) {
                    hadKeyError = true;
                }
            }
        } catch (wapiErr) {
            console.warn('[WeatherService] WeatherAPI.com fetch failed, falling back to Open-Meteo:', wapiErr.message);
        }
    }

    // 2. PRIMARY FALLBACK: OPEN-METEO API (NO KEY REQUIRED, INCLUDES 5-DAY DAILY FORECAST)
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,rain,precipitation,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&forecast_days=6&timezone=auto`;
        
        const response = await fetch(url, { 
            headers: { 
                'User-Agent': 'RescueAI-DisasterPlatform/1.0 (Emergency Response)',
                'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(8000) 
        });

        if (!response.ok) {
            throw new Error(`Open-Meteo returned status ${response.status}`);
        }

        const data = await response.json();
        const current = data.current || {};
        const daily = data.daily || {};
        const weatherCode = current.weather_code || 0;
        const condition = interpretWMOCode(weatherCode);
        const temp = current.temperature_2m !== undefined ? current.temperature_2m : null;
        const rain = current.rain !== undefined ? current.rain : (current.precipitation || 0);
        const wind = current.wind_speed_10m !== undefined ? current.wind_speed_10m : 0;
        const humidity = current.relative_humidity_2m !== undefined ? current.relative_humidity_2m : null;

        let severeAlert = null;
        if (rain > 20 || (weatherCode >= 95 && weatherCode <= 99)) {
            severeAlert = 'Flash Flood & Thunderstorm Watch: Heavy localized precipitation detected.';
        } else if (wind > 55) {
            severeAlert = 'Gale Warning: High wind velocity poses structural hazards.';
        }

        const forecast5Days = format5DayForecastFromOpenMeteo(daily);

        const report = {
            latitude,
            longitude,
            locationName: 'Open-Meteo Regional Grid',
            temperature: temp,
            rainfall: rain,
            windSpeed: wind,
            humidity,
            condition,
            conditionIcon: null,
            uv: null,
            airQuality: null,
            severeAlert,
            provider: 'Open-Meteo',
            dataStatus: 'LIVE',
            isLive: true,
            isStale: false,
            hadKeyError,
            forecast5Days,
            fetchedAt: new Date().toISOString()
        };

        cacheWeatherReport(report).catch(() => {});
        return report;
    } catch (err) {
        console.warn('[Weather Service] Live weather fetch failed, querying cached telemetry:', err.message);

        // 3. SECONDARY FALLBACK: DATABASE CACHED WEATHER REPORT
        try {
            const cached = await db.get(
                `SELECT * FROM weather_reports WHERE temperature IS NOT NULL ORDER BY fetched_at DESC LIMIT 1`
            );
            if (cached) {
                let cachedForecast = [];
                if (cached.forecast_json) {
                    try { cachedForecast = JSON.parse(cached.forecast_json); } catch(e) {}
                }

                return {
                    latitude: Number(cached.latitude) || latitude,
                    longitude: Number(cached.longitude) || longitude,
                    locationName: 'Regional Meteorological Telemetry (Cached)',
                    temperature: cached.temperature !== null ? Number(cached.temperature) : null,
                    rainfall: cached.rainfall !== null ? Number(cached.rainfall) : 0,
                    windSpeed: cached.wind_speed !== null ? Number(cached.wind_speed) : null,
                    humidity: cached.humidity !== null ? Number(cached.humidity) : null,
                    condition: cached.condition || 'Cached Telemetry Baseline',
                    conditionIcon: null,
                    uv: null,
                    airQuality: null,
                    severeAlert: null,
                    provider: `${cached.provider || 'Station Grid'} (Cached)`,
                    dataStatus: 'CACHED_STALE',
                    isLive: false,
                    isStale: true,
                    hadKeyError,
                    forecast5Days: cachedForecast,
                    fetchedAt: cached.fetched_at || new Date().toISOString()
                };
            }
        } catch (dbErr) {
            // continue to tertiary fallback
        }

        // 4. TERTIARY FALLBACK: REPORT HONESTLY AS UNAVAILABLE (NO FABRICATED DUMMY SENSORS)
        return {
            latitude,
            longitude,
            locationName: 'Local Monitoring Sector',
            temperature: null,
            rainfall: null,
            windSpeed: null,
            humidity: null,
            condition: 'Telemetry Sensor Offline',
            conditionIcon: null,
            uv: null,
            airQuality: null,
            severeAlert: null,
            provider: 'Unavailable',
            dataStatus: 'UNAVAILABLE',
            isLive: false,
            isStale: false,
            hadKeyError,
            forecast5Days: [],
            message: 'Meteorological telemetry is currently unreachable. No simulated sensor readings fabricated.',
            fetchedAt: new Date().toISOString()
        };
    }
}

async function cacheWeatherReport(report) {
    try {
        const forecastJson = report.forecast5Days ? JSON.stringify(report.forecast5Days) : null;
        await db.run(
            `INSERT INTO weather_reports (id, latitude, longitude, temperature, rainfall, wind_speed, humidity, condition, provider, forecast_json, fetched_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                generateUUID('WR'),
                report.latitude,
                report.longitude,
                report.temperature,
                report.rainfall,
                report.windSpeed,
                report.humidity,
                report.condition,
                report.provider,
                forecastJson,
                report.fetchedAt
            ]
        );
    } catch (dbErr) {
        // Suppress cache error
    }
}

module.exports = {
    fetchRealWeather,
    interpretWMOCode
};
