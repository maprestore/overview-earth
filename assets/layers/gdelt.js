/**
 * Layer: News
 * -------------------------------------------------------------
 * Data source: GDELT DOC 2.0
 * https://api.gdeltproject.org/api/v2/doc/doc
 *
 * DOC 2.0 returns article metadata and sourcecountry, not precise article
 * coordinates. The map uses a maintained local centroid table, so points
 * show the reporting country rather than the event location.
 *
 * GDELT's GEO 2.0 endpoint is currently unavailable. JSONP is used here
 * instead of fetch so this layer can work from a static GitHub Pages site.
 */

const GDELT_COUNTRY_CENTROIDS = Object.freeze({
  Afghanistan: [33.9, 67.7], Albania: [41.15, 20.17], Algeria: [28, 1.66],
  Andorra: [42.5, 1.52], Angola: [-11.2, 17.87], Argentina: [-38.4, -63.6],
  Armenia: [40.1, 45], Australia: [-25.3, 133.8], Austria: [47.5, 14.55],
  Azerbaijan: [40.14, 47.58], Bahamas: [24.25, -76], Bahrain: [26.1, 50.55],
  Bangladesh: [23.68, 90.35], Barbados: [13.19, -59.54], Belarus: [53.7, 27.95],
  Belgium: [50.83, 4], Belize: [17.19, -88.5], Benin: [9.31, 2.32],
  Bhutan: [27.51, 90.43], Bolivia: [-16.29, -63.59], Bosnia: [43.92, 17.68],
  Botswana: [-22.33, 24.68], Brazil: [-10.8, -52], Brunei: [4.5, 114.7],
  Bulgaria: [42.73, 25.49], BurkinaFaso: [12.24, -1.56], Burundi: [-3.37, 29.92],
  Cambodia: [12.57, 104.99], Cameroon: [5.7, 12.7], Canada: [56.13, -106.35],
  Chad: [15.45, 18.73], Chile: [-33.44, -70.65], China: [35.86, 104.2],
  Colombia: [4.57, -74.3], Comoros: [-11.65, 43.33], Congo: [-0.23, 15.83],
  CotedIvoire: [7.54, -5.55],
  Croatia: [45.1, 15.2], Cuba: [21.52, -77.78], Cyprus: [35.13, 33.43],
  Czechia: [49.82, 15.47], Denmark: [56.26, 9.5], Djibouti: [11.83, 42.59],
  Dominica: [15.41, -61.37], Ecuador: [-1.83, -78.18], Egypt: [26.82, 30.8],
  Eritrea: [15.18, 39.78], Estonia: [58.6, 25.01], Eswatini: [-26.52, 31.47],
  Ethiopia: [9.15, 40.49], Fiji: [-17.71, 178.07], Finland: [61.92, 25.75],
  France: [46.23, 2.21], Gabon: [-0.8, 11.61], Gambia: [13.44, -15.31],
  Georgia: [42.32, 43.36], Germany: [51.17, 10.45], Ghana: [7.95, -1.02],
  Greece: [39.07, 21.82], Grenada: [12.12, -61.68], Guatemala: [15.78, -90.23],
  Guinea: [9.95, -9.7], Guyana: [4.86, -58.93], Haiti: [18.97, -72.29],
  Honduras: [14.07, -86.24], Hungary: [47.16, 19.5], Iceland: [64.96, -19.02],
  India: [20.59, 78.96], Indonesia: [-0.79, 113.92], Iran: [32.43, 53.69],
  Iraq: [33.22, 43.68], Ireland: [53.14, -7.69], Israel: [31.05, 34.85],
  Italy: [41.87, 12.57], Jamaica: [18.11, -77.3], Japan: [36.2, 138.25],
  Jordan: [30.59, 36.24], Kazakhstan: [48.02, 66.92], Kenya: [0.02, 37.91],
  Kiribati: [1.87, -157.36], Kuwait: [29.31, 47.48], Kyrgyzstan: [41.2, 74.77],
  Laos: [19.86, 102.5], Latvia: [56.88, 24.6], Lebanon: [33.85, 35.86],
  Lesotho: [-29.61, 28.23], Liberia: [6.43, -9.43], Libya: [26.34, 17.23],
  Liechtenstein: [47.14, 9.55], Lithuania: [55.17, 23.88], Luxembourg: [49.82, 6.13],
  Madagascar: [-18.77, 46.87], Malawi: [-13.25, 34.3], Malaysia: [4.21, 101.98],
  Maldives: [3.2, 73.22], Mali: [17.57, -3.99], Malta: [35.94, 14.38],
  Mauritania: [21.01, -10.94], Mauritius: [-20.35, 57.55], Mexico: [23.63, -102.55],
  Moldova: [47.41, 28.37], Monaco: [43.74, 7.42], Mongolia: [46.86, 103.85],
  Montenegro: [42.71, 19.37], Morocco: [31.79, -7.09], Mozambique: [-18.67, 35.53],
  Myanmar: [21.91, 95.96], Namibia: [-22.96, 18.49], Nepal: [28.39, 84.12],
  Netherlands: [52.13, 5.29], NewZealand: [-40.9, 174.89], Nicaragua: [12.87, -85.21],
  Niger: [17.61, 8.08], Nigeria: [9.08, 8.68], NorthKorea: [40.34, 127.51],
  NorthMacedonia: [41.51, 21.75], Norway: [60.47, 8.47], Oman: [21.47, 55.98],
  Pakistan: [30.38, 69.35], Panama: [8.54, -80.78], PapuaNewGuinea: [-6.31, 143.96],
  Paraguay: [-23.44, -58.44], Peru: [-9.19, -75.02], Philippines: [12.88, 121.77],
  Poland: [51.92, 19.15], Portugal: [39.4, -8.22], Qatar: [25.35, 51.18],
  Romania: [45.94, 24.97], Russia: [61.52, 105.32], Rwanda: [-1.94, 29.87],
  Samoa: [-13.76, -172.1], SanMarino: [43.94, 12.46], SaudiArabia: [23.89, 45.08],
  Senegal: [14.5, -14.45], Serbia: [44.02, 21.01], Seychelles: [-4.68, 55.49],
  SierraLeone: [8.46, -11.78], Singapore: [1.35, 103.82], Slovakia: [48.67, 19.7],
  Slovenia: [46.15, 14.99], SolomonIslands: [-9.65, 160.16], Somalia: [5.15, 46.2],
  SouthAfrica: [-30.56, 22.94], SouthKorea: [35.91, 127.77], SouthSudan: [6.88, 31.31],
  Spain: [40.46, -3.75], SriLanka: [7.87, 80.77], Sudan: [12.86, 30.22],
  Suriname: [3.92, -56.03], Sweden: [60.13, 18.64], Switzerland: [46.82, 8.23],
  Syria: [34.8, 38.996], Taiwan: [23.7, 120.96], Tajikistan: [38.86, 71.28],
  Tanzania: [-6.37, 34.89], Thailand: [15.87, 100.99], TimorLeste: [-8.87, 125.73],
  Togo: [8.62, 0.82], Tonga: [-21.18, -175.2], Tunisia: [33.89, 9.54],
  Turkey: [38.96, 35.24], Turkmenistan: [38.97, 59.56], Tuvalu: [-7.11, 177.65],
  Uganda: [1.37, 32.29], Ukraine: [48.38, 31.17], UnitedArabEmirates: [23.42, 53.85],
  UnitedKingdom: [55.38, -3.44], UnitedStates: [37.09, -95.71], Uruguay: [-32.52, -55.77],
  Uzbekistan: [41.38, 64.59], Vanuatu: [-15.38, 166.96], Vatican: [41.9, 12.45],
  Venezuela: [6.42, -66.59], Vietnam: [14.06, 108.28], Yemen: [15.55, 48.52],
  Zambia: [-13.13, 27.85], Zimbabwe: [-19.02, 29.15]
});

const GDELT_COUNTRY_ALIASES = Object.freeze({
  USA: 'UnitedStates', US: 'UnitedStates', 'United States of America': 'UnitedStates',
  UK: 'UnitedKingdom', Britain: 'UnitedKingdom', 'South Korea': 'SouthKorea',
  'North Korea': 'NorthKorea', 'New Zealand': 'NewZealand', 'Papua New Guinea': 'PapuaNewGuinea',
  'South Africa': 'SouthAfrica', 'South Sudan': 'SouthSudan', 'Saudi Arabia': 'SaudiArabia',
  'United Arab Emirates': 'UnitedArabEmirates', 'North Macedonia': 'NorthMacedonia',
  'Czech Republic': 'Czechia', 'DR Congo': 'Congo', 'Republic of the Congo': 'Congo',
  'Timor-Leste': 'TimorLeste', 'Türkiye': 'Turkey', 'Vatican City': 'Vatican',
  'Bosnia and Herzegovina': 'Bosnia', 'Ivory Coast': 'CotedIvoire', "Côte d'Ivoire": 'CotedIvoire'
});

function gdeltCountryKey(country) {
  const name = String(country || '').trim();
  return GDELT_COUNTRY_ALIASES[name] || name.replace(/[ .'-]/g, '');
}

function gdeltTimestamp(value) {
  const normalized = String(value || '').replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
    '$1-$2-$3T$4:$5:$6'
  );
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function fetchGdeltJsonp(params) {
  return new Promise((resolve, reject) => {
    const callbackName = `__overviewGdelt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const timeoutId = setTimeout(() => finish(new Error('GDELT request timed out')), 15 * 1000);

    function finish(error, data) {
      clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
      if (error) reject(error);
      else resolve(data);
    }

    window[callbackName] = data => finish(null, data);
    script.onerror = () => finish(new Error('GDELT script request failed'));
    script.onload = () => setTimeout(() => {
      if (window[callbackName]) finish(new Error('GDELT returned no callback data'));
    }, 0);
    params.set('callback', callbackName);
    script.src = `https://api.gdeltproject.org/api/v2/doc/doc?${params}`;
    document.head.appendChild(script);
  });
}

function announceGdelt(detail) {
  window.dispatchEvent(new CustomEvent('overview:gdelt', { detail }));
}

Overview.registerLayer({
  id: 'news',
  label: 'News (GDELT)',
  color: '#FF4D8D',
  sourceUrl: 'https://www.gdeltproject.org/',
  defaultOn: false,
  refreshMs: 5 * 60 * 1000,

  async fetchPoints() {
    announceGdelt({ status: 'loading' });
    try {
      const params = new URLSearchParams({
        query: 'conflict OR crisis OR protest OR disaster',
        mode: 'artlist',
        format: 'jsonp',
        maxrecords: '100',
        timespan: '24h',
        sort: 'datedesc'
      });
      const data = await fetchGdeltJsonp(params);
      const articles = (Array.isArray(data?.articles) ? data.articles : [])
        .map(article => ({
          title: String(article.title || 'Untitled article').replace(/\s+/g, ' ').trim(),
          url: String(article.url || '').trim(),
          domain: String(article.domain || '').trim(),
          sourcecountry: String(article.sourcecountry || '').trim(),
          seendate: String(article.seendate || '').trim(),
          url: String(article.url || '').trim()
        }))
        .filter(article => article.title && article.url);
      const points = articles.map(article => {
        const country = String(article.sourcecountry || '').trim();
        const centroid = GDELT_COUNTRY_CENTROIDS[GDELT_COUNTRY_ALIASES[country] || gdeltCountryKey(country)];
        if (!centroid) return null;

        const domain = String(article.domain || '').trim();
        return {
          lat: centroid[0],
          lon: centroid[1],
          size: 3,
          time: gdeltTimestamp(article.seendate),
          url: article.url,
          label: `${article.title.slice(0, 120)} — ${country || 'country unknown'}${domain ? ` — ${domain}` : ''}`
        };
      }).filter(Boolean);
      announceGdelt({ status: 'online', articles: articles.slice(0, 8), pointCount: points.length });
      return points;
    } catch (err) {
      console.warn(`Overview GDELT: feed unavailable — ${err.message || err}`);
      announceGdelt({ status: 'unavailable', message: err.message || 'request failed' });
      return [];
    }
  }
});
