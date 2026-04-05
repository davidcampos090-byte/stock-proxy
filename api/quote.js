export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type, symbol, outputsize, interval } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol requerido' });

  const yahooHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Origin': 'https://finance.yahoo.com',
    'Referer': 'https://finance.yahoo.com/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'Cache-Control': 'no-cache',
  };

  try {
    // ── PRECIOS DIARIOS: Alpha Vantage ──
    if (type === 'daily') {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=${outputsize || 'compact'}&apikey=1X417BA6SKUHENY1`;
      const r = await fetch(url);
      return res.status(200).json(await r.json());
    }

    // ── PRECIOS INTRADAY: Alpha Vantage ──
    if (type === 'intraday') {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${interval || '15min'}&outputsize=compact&apikey=1X417BA6SKUHENY1`;
      const r = await fetch(url);
      return res.status(200).json(await r.json());
    }

    // ── NOTICIAS: Alpha Vantage ──
    if (type === 'news') {
      const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol}&limit=8&apikey=1X417BA6SKUHENY1`;
      const r = await fetch(url);
      return res.status(200).json(await r.json());
    }

    // ── OPCIONES: Yahoo Finance con crumb ──
    if (type === 'options') {
      // Obtener crumb primero
      let crumb = '';
      let cookieStr = '';
      try {
        const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
          headers: {
            ...yahooHeaders,
            'Cookie': 'B=; bcookie=',
          }
        });
        crumb = (await crumbRes.text()).trim();
        cookieStr = crumbRes.headers.get('set-cookie') || '';
      } catch(e) {}

      // Intentar v7 con crumb
      const optUrl = crumb
        ? `https://query1.finance.yahoo.com/v7/finance/options/${symbol}?crumb=${encodeURIComponent(crumb)}`
        : `https://query1.finance.yahoo.com/v7/finance/options/${symbol}`;

      const optRes = await fetch(optUrl, {
        headers: { ...yahooHeaders, ...(cookieStr ? { Cookie: cookieStr } : {}) }
      });

      if (optRes.ok) {
        const data = await optRes.json();
        if (data?.optionChain?.result?.length) return res.status(200).json(data);
      }

      // Fallback v8 query2
      const fb = await fetch(`https://query2.finance.yahoo.com/v7/finance/options/${symbol}`, {
        headers: yahooHeaders
      });
      if (fb.ok) return res.status(200).json(await fb.json());

      return res.status(503).json({ error: 'Yahoo Finance opciones no disponible' });
    }

    // ── QUOTE precio actual: Yahoo Finance ──
    if (type === 'quote') {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
      const r = await fetch(url, { headers: yahooHeaders });
      if (!r.ok) return res.status(r.status).json({ error: 'Error Yahoo: ' + r.status });
      return res.status(200).json(await r.json());
    }

    return res.status(400).json({ error: 'Tipo no válido. Usa: daily, intraday, options, news, quote' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
