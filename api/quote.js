export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { type, symbol, outputsize, interval } = req.query;

  try {
    let url = '';

    // ── PRECIOS: Alpha Vantage ──
    if (type === 'daily') {
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=${outputsize || 'compact'}&apikey=1X417BA6SKUHENY1`;
    }

    // ── PRECIOS INTRADAY: Alpha Vantage ──
    else if (type === 'intraday') {
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${interval || '15min'}&outputsize=compact&apikey=1X417BA6SKUHENY1`;
    }

    // ── OPCIONES: Yahoo Finance ──
    else if (type === 'options') {
      url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}`;
    }

    // ── OPCIONES fecha específica: Yahoo Finance ──
    else if (type === 'options2') {
      url = `https://query2.finance.yahoo.com/v7/finance/options/${symbol}`;
    }

    // ── NOTICIAS: Alpha Vantage ──
    else if (type === 'news') {
      url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol}&limit=8&apikey=1X417BA6SKUHENY1`;
    }

    // ── QUOTE (precio actual): Yahoo Finance ──
    else if (type === 'quote') {
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
    }

    else {
      return res.status(400).json({ error: 'Tipo no válido. Usa: daily, intraday, options, news, quote' });
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Error del servidor externo: ${response.status}` });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
