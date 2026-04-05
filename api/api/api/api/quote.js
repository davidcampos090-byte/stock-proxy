export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  const { symbol, outputsize } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol requerido' });
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=${outputsize || 'compact'}&apikey=1X417BA6SKUHENY1`;
  try {
    const data = await fetch(url).then(r => r.json());
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
