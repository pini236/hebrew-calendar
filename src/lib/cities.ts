export interface City {
  id: string;
  name: string;
  lat: number;
  lon: number;
  tz: string;
  elev: number;
  /** minutes before sunset for candle lighting (local custom) */
  candle: number;
  il: boolean;
}

const IL = 'Asia/Jerusalem';

function c(id: string, name: string, lat: number, lon: number, elev = 0, candle = 20): City {
  return { id, name, lat, lon, tz: IL, elev, candle, il: true };
}
function w(id: string, name: string, lat: number, lon: number, tz: string, elev = 0): City {
  return { id, name, lat, lon, tz, elev, candle: 18, il: false };
}

export const CITIES: City[] = [
  c('jerusalem', 'ירושלים', 31.778, 35.2354, 754, 40),
  c('tel-aviv', 'תל אביב–יפו', 32.0853, 34.7818, 15),
  c('haifa', 'חיפה', 32.794, 34.9896, 50, 30),
  c('bnei-brak', 'בני ברק', 32.0809, 34.8338, 30),
  c('petah-tikva', 'פתח תקווה', 32.0871, 34.8875, 40, 30),
  c('beer-sheva', 'באר שבע', 31.252, 34.7915, 280),
  c('ashdod', 'אשדוד', 31.8014, 34.6435, 30),
  c('netanya', 'נתניה', 32.3215, 34.8532, 30),
  c('rishon', 'ראשון לציון', 31.973, 34.7925, 50),
  c('holon', 'חולון', 32.0158, 34.7874, 35),
  c('ramat-gan', 'רמת גן', 32.068, 34.8248, 50),
  c('rehovot', 'רחובות', 31.8928, 34.8113, 60),
  c('herzliya', 'הרצליה', 32.1624, 34.8447, 40),
  c('kfar-saba', 'כפר סבא', 32.1782, 34.9076, 50),
  c('raanana', 'רעננה', 32.1848, 34.8713, 50),
  c('modiin', 'מודיעין', 31.8969, 35.0095, 250),
  c('modiin-illit', 'מודיעין עילית', 31.933, 35.041, 300),
  c('elad', 'אלעד', 32.0522, 34.9511, 150),
  c('beit-shemesh', 'בית שמש', 31.747, 34.9881, 300, 30),
  c('beitar', 'ביתר עילית', 31.697, 35.115, 750, 40),
  c('maale-adumim', 'מעלה אדומים', 31.777, 35.298, 600, 40),
  c('ashkelon', 'אשקלון', 31.6688, 34.5743, 30),
  c('kiryat-gat', 'קריית גת', 31.61, 34.7642, 130),
  c('hadera', 'חדרה', 32.434, 34.9196, 20),
  c('zichron', 'זכרון יעקב', 32.5707, 34.9525, 150, 30),
  c('afula', 'עפולה', 32.6078, 35.2897, 60),
  c('tiberias', 'טבריה', 32.7922, 35.5312, -150, 20),
  c('safed', 'צפת', 32.9646, 35.496, 850, 30),
  c('nahariya', 'נהריה', 33.0089, 35.0981, 20),
  c('akko', 'עכו', 32.9281, 35.082, 10),
  c('karmiel', 'כרמיאל', 32.9171, 35.3054, 250),
  c('kiryat-shmona', 'קריית שמונה', 33.2073, 35.5697, 150),
  c('katzrin', 'קצרין', 32.9925, 35.69, 330),
  c('ariel', 'אריאל', 32.1046, 35.1745, 600),
  c('dimona', 'דימונה', 31.07, 35.03, 550),
  c('arad', 'ערד', 31.2589, 35.2128, 600),
  c('eilat', 'אילת', 29.5577, 34.9519, 10),
  w('new-york', 'ניו יורק', 40.7128, -74.006, 'America/New_York', 10),
  w('lakewood', 'לייקווד', 40.0821, -74.2097, 'America/New_York', 20),
  w('miami', 'מיאמי', 25.7617, -80.1918, 'America/New_York', 2),
  w('los-angeles', "לוס אנג'לס", 34.0522, -118.2437, 'America/Los_Angeles', 90),
  w('toronto', 'טורונטו', 43.6532, -79.3832, 'America/Toronto', 80),
  w('montreal', 'מונטריאול', 45.5017, -73.5673, 'America/Toronto', 30),
  w('london', 'לונדון', 51.5074, -0.1278, 'Europe/London', 20),
  w('manchester', "מנצ'סטר", 53.4808, -2.2426, 'Europe/London', 40),
  w('paris', 'פריז', 48.8566, 2.3522, 'Europe/Paris', 35),
  w('antwerp', 'אנטוורפן', 51.2194, 4.4025, 'Europe/Brussels', 10),
  w('moscow', 'מוסקבה', 55.7558, 37.6173, 'Europe/Moscow', 150),
  w('buenos-aires', 'בואנוס איירס', -34.6037, -58.3816, 'America/Argentina/Buenos_Aires', 25),
  w('johannesburg', 'יוהנסבורג', -26.2041, 28.0473, 'Africa/Johannesburg', 1750),
  w('melbourne', 'מלבורן', -37.8136, 144.9631, 'Australia/Melbourne', 30),
];

export const DEFAULT_CITY = CITIES[0];

export function findCity(id: string): City | undefined {
  return CITIES.find((x) => x.id === id);
}

/** Distance in km, used to pick the nearest listed city name for a GPS fix */
export function nearestCity(lat: number, lon: number): { city: City; km: number } {
  let best = CITIES[0];
  let bestD = Infinity;
  for (const x of CITIES) {
    const d = haversine(lat, lon, x.lat, x.lon);
    if (d < bestD) {
      bestD = d;
      best = x;
    }
  }
  return { city: best, km: bestD };
}

function haversine(a1: number, o1: number, a2: number, o2: number) {
  const R = 6371;
  const r = Math.PI / 180;
  const da = (a2 - a1) * r;
  const dO = (o2 - o1) * r;
  const h = Math.sin(da / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
