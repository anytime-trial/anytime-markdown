import { NextResponse } from 'next/server';

import { extractErrorMessage } from '../../../lib/api-helpers';

export interface WeatherCity {
    key: string;
    nameEn: string;
    nameJa: string;
    temp: number;
    tempMax: number;
    tempMin: number;
    conditionEn: string;
    conditionJa: string;
}

interface OpenMeteoResponse {
    current: {
        temperature_2m: number;
        weather_code: number;
    };
    daily: {
        temperature_2m_max: number[];
        temperature_2m_min: number[];
    };
}

const CITIES = [
    { key: 'tokyo',    nameEn: 'Tokyo',    nameJa: '東京',     lat: 35.6762,  lon: 139.6503, tz: 'Asia/Tokyo' },
    { key: 'newyork',  nameEn: 'New York', nameJa: 'N.York',   lat: 40.7128,  lon: -74.0060, tz: 'America/New_York' },
    { key: 'london',   nameEn: 'London',   nameJa: 'London',   lat: 51.5074,  lon: -0.1278,  tz: 'Europe/London' },
    { key: 'mumbai',   nameEn: 'Mumbai',   nameJa: 'Mumbai', lat: 19.0760,  lon: 72.8777,  tz: 'Asia/Kolkata' },
    { key: 'nairobi',  nameEn: 'Nairobi',  nameJa: 'Nairobi',  lat: -1.2921,  lon: 36.8219,  tz: 'Africa/Nairobi' },
    { key: 'sydney',   nameEn: 'Sydney',   nameJa: 'Sydney',   lat: -33.8688, lon: 151.2093, tz: 'Australia/Sydney' },
] as const;

function wmoToCondition(code: number): { en: string; ja: string } {
    if (code === 0)           return { en: 'CLEAR',   ja: '晴れ' };
    if (code <= 2)            return { en: 'PARTLY',  ja: '薄曇' };
    if (code === 3)           return { en: 'CLOUDY',  ja: '曇り' };
    if (code <= 48)           return { en: 'FOG',     ja: '霧' };
    if (code <= 57)           return { en: 'DRIZZLE', ja: '霧雨' };
    if (code <= 67)           return { en: 'RAIN',    ja: '雨' };
    if (code <= 77)           return { en: 'SNOW',    ja: '雪' };
    if (code <= 82)           return { en: 'SHOWER',  ja: 'にわか雨' };
    return                           { en: 'STORM',   ja: '嵐' };
}

const REVALIDATE = 1800; // 30 分

async function fetchCity(city: (typeof CITIES)[number]): Promise<WeatherCity> {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude',  String(city.lat));
    url.searchParams.set('longitude', String(city.lon));
    url.searchParams.set('current',   'temperature_2m,weather_code');
    url.searchParams.set('daily',     'temperature_2m_max,temperature_2m_min');
    url.searchParams.set('timezone',  city.tz);
    url.searchParams.set('forecast_days', '1');

    const res = await fetch(url.toString(), { next: { revalidate: REVALIDATE } });
    if (!res.ok) throw new Error(`Open-Meteo error for ${city.key}: ${res.status}`);

    const data = (await res.json()) as OpenMeteoResponse;
    const condition = wmoToCondition(data.current.weather_code);

    return {
        key:         city.key,
        nameEn:      city.nameEn,
        nameJa:      city.nameJa,
        temp:        Math.round(data.current.temperature_2m),
        tempMax:     Math.round(data.daily.temperature_2m_max[0] ?? data.current.temperature_2m),
        tempMin:     Math.round(data.daily.temperature_2m_min[0] ?? data.current.temperature_2m),
        conditionEn: condition.en,
        conditionJa: condition.ja,
    };
}

export async function GET() {
    try {
        const cities = await Promise.all(CITIES.map(fetchCity));
        return NextResponse.json({ cities });
    } catch (e) {
        const message = extractErrorMessage(e);
        console.error(`[/api/weather] ${message}`, e instanceof Error ? e.stack : e);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
