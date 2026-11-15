import { isHe } from './i18n';

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

// Coordinates: GeoNames gazetteer (the same source Hebcal uses), except Beitar Illit which GeoNames does not list.
// Elevation (metres) is used only when "calculate by elevation" is switched on; Hebcal's DEM value where available.
export const CITIES: City[] = [
  c('jerusalem', 'ירושלים', 31.76904, 35.21633, 786, 40),
  c('tel-aviv', 'תל אביב–יפו', 32.08088, 34.78057, 15),
  c('haifa', 'חיפה', 32.81303, 34.99928, 50, 30),
  c('bnei-brak', 'בני ברק', 32.08074, 34.8338, 30),
  c('petah-tikva', 'פתח תקווה', 32.0888, 34.88666, 40, 30),
  c('beer-sheva', 'באר שבע', 31.25181, 34.7913, 285),
  c('ashdod', 'אשדוד', 31.79213, 34.64966, 27),
  c('netanya', 'נתניה', 32.33294, 34.85917, 30),
  c('rishon', 'ראשון לציון', 31.97102, 34.78939, 50),
  c('holon', 'חולון', 32.0122, 34.77826, 35),
  c('ramat-gan', 'רמת גן', 32.08227, 34.81065, 50),
  c('rehovot', 'רחובות', 31.89415, 34.8095, 60),
  c('herzliya', 'הרצליה', 32.16627, 34.82536, 40),
  c('kfar-saba', 'כפר סבא', 32.175, 34.90694, 50),
  c('raanana', 'רעננה', 32.1836, 34.87386, 50),
  c('modiin', 'מודיעין', 31.89385, 35.01504, 250),
  c('modiin-illit', 'מודיעין עילית', 31.93221, 35.04416, 300),
  c('elad', 'אלעד', 32.05108, 34.95704, 150),
  c('beit-shemesh', 'בית שמש', 31.73072, 34.99293, 300, 30),
  c('beitar', 'ביתר עילית', 31.697, 35.115, 750, 40),
  c('maale-adumim', 'מעלה אדומים', 31.7774, 35.29875, 600, 40),
  c('ashkelon', 'אשקלון', 31.66926, 34.57149, 30),
  c('kiryat-gat', 'קריית גת', 31.60998, 34.76422, 130),
  c('hadera', 'חדרה', 32.44192, 34.9039, 20),
  c('zichron', 'זכרון יעקב', 32.56883, 34.95427, 150, 30),
  c('afula', 'עפולה', 32.60907, 35.2892, 60),
  c('tiberias', 'טבריה', 32.79396, 35.53152, -150, 20),
  c('safed', 'צפת', 32.96465, 35.496, 850, 30),
  c('nahariya', 'נהריה', 33.00892, 35.09814, 20),
  c('akko', 'עכו', 32.92814, 35.07647, 10),
  c('karmiel', 'כרמיאל', 32.90951, 35.29768, 250),
  c('kiryat-shmona', 'קריית שמונה', 33.21204, 35.57044, 150),
  c('katzrin', 'קצרין', 32.99194, 35.69139, 330),
  c('ariel', 'אריאל', 32.1065, 35.18449, 600),
  c('dimona', 'דימונה', 31.07079, 35.03269, 550),
  c('arad', 'ערד', 31.25882, 35.21282, 600),
  c('eilat', 'אילת', 29.55805, 34.94821, 63),
  w('new-york', 'ניו יורק', 40.71427, -74.00597, 'America/New_York', 10),
  w('lakewood', 'לייקווד', 40.09789, -74.21764, 'America/New_York', 20),
  w('miami', 'מיאמי', 25.77427, -80.19366, 'America/New_York', 2),
  w('los-angeles', "לוס אנג'לס", 34.05223, -118.24368, 'America/Los_Angeles', 90),
  w('toronto', 'טורונטו', 43.70643, -79.39864, 'America/Toronto', 80),
  w('montreal', 'מונטריאול', 45.50884, -73.58781, 'America/Toronto', 30),
  w('london', 'לונדון', 51.50853, -0.12574, 'Europe/London', 20),
  w('manchester', "מנצ'סטר", 53.48095, -2.23743, 'Europe/London', 40),
  w('paris', 'פריז', 48.85341, 2.3488, 'Europe/Paris', 35),
  w('antwerp', 'אנטוורפן', 51.22047, 4.40026, 'Europe/Brussels', 10),
  w('moscow', 'מוסקבה', 55.75204, 37.61781, 'Europe/Moscow', 150),
  w('buenos-aires', 'בואנוס איירס', -34.61315, -58.37723, 'America/Argentina/Buenos_Aires', 25),
  w('johannesburg', 'יוהנסבורג', -26.20227, 28.04363, 'Africa/Johannesburg', 1750),
  w('melbourne', 'מלבורן', -37.814, 144.96332, 'Australia/Melbourne', 30),
];

export const DEFAULT_CITY = CITIES[0];

/** English names of the listed cities, for the English interface */
const NAME_EN: Record<string, string> = {
  'jerusalem': 'Jerusalem',
  'tel-aviv': 'Tel Aviv-Yafo',
  'haifa': 'Haifa',
  'bnei-brak': 'Bnei Brak',
  'petah-tikva': 'Petah Tikva',
  'beer-sheva': "Be'er Sheva",
  'ashdod': 'Ashdod',
  'netanya': 'Netanya',
  'rishon': 'Rishon LeZion',
  'holon': 'Holon',
  'ramat-gan': 'Ramat Gan',
  'rehovot': 'Rehovot',
  'herzliya': 'Herzliya',
  'kfar-saba': 'Kfar Saba',
  'raanana': "Ra'anana",
  'modiin': "Modi'in",
  'modiin-illit': "Modi'in Illit",
  'elad': 'Elad',
  'beit-shemesh': 'Beit Shemesh',
  'beitar': 'Beitar Illit',
  'maale-adumim': "Ma'ale Adumim",
  'ashkelon': 'Ashkelon',
  'kiryat-gat': 'Kiryat Gat',
  'hadera': 'Hadera',
  'zichron': "Zichron Ya'akov",
  'afula': 'Afula',
  'tiberias': 'Tiberias',
  'safed': 'Safed',
  'nahariya': 'Nahariya',
  'akko': 'Akko',
  'karmiel': 'Karmiel',
  'kiryat-shmona': 'Kiryat Shmona',
  'katzrin': 'Katzrin',
  'ariel': 'Ariel',
  'dimona': 'Dimona',
  'arad': 'Arad',
  'eilat': 'Eilat',
  'new-york': 'New York',
  'lakewood': 'Lakewood',
  'miami': 'Miami',
  'los-angeles': 'Los Angeles',
  'toronto': 'Toronto',
  'montreal': 'Montreal',
  'london': 'London',
  'manchester': 'Manchester',
  'paris': 'Paris',
  'antwerp': 'Antwerp',
  'moscow': 'Moscow',
  'buenos-aires': 'Buenos Aires',
  'johannesburg': 'Johannesburg',
  'melbourne': 'Melbourne',
};

/** A city's name in the interface language (places from the worldwide list keep their own name) */
export function cityLabel(c: City): string {
  return (!isHe() && NAME_EN[c.id]) || c.name;
}

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
