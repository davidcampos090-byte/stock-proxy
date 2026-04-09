export default async function handler(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘GET, POST, OPTIONS’);
res.setHeader(‘Access-Control-Allow-Headers’, ‘Content-Type’);

if (req.method === ‘OPTIONS’) return res.status(200).end();

const { type, symbol } = req.query;

const STRIPE_SECRET = process.env.STRIPE_SECRET;
const PRICE_ID = process.env.STRIPE_PRICE_ID;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const FINNHUB_KEY = process.env.FINNHUB_KEY || ‘d7bevnhr01qgc9t75rr0d7bevnhr01qgc9t75rrg’;
const SUPABASE_URL = ‘https://wnfogptzpqqugjxvwlnb.supabase.co’;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

try {

```
// ── NOTICIAS GENERALES DEL MERCADO ──
if (type === 'market_news' && req.method === 'GET') {
  const category = req.query.category || 'general';
  // Finnhub categories: general, forex, crypto, merger
  const finnhubCat = category === 'earnings' ? 'general' : 'general';
  const url = `https://finnhub.io/api/v1/news?category=${finnhubCat}&minId=0&token=${FINNHUB_KEY}`;
  const r = await fetch(url);
  if (!r.ok) return res.status(500).json({ error: 'Finnhub error' });
  const articles = await r.json();
  // Devolver los primeros 20 artículos
  const clean = articles.slice(0, 20).map(a => ({
    headline: a.headline,
    summary: a.summary,
    source: a.source,
    url: a.url,
    datetime: a.datetime,
    image: a.image,
    related: a.related || '',
  }));
  return res.status(200).json({ articles: clean });
}

// ── NOTICIAS POR TICKER ──
if (type === 'ticker_news' && req.method === 'GET') {
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  const today = new Date().toISOString().slice(0,10);
  const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().slice(0,10);
  const url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${weekAgo}&to=${today}&token=${FINNHUB_KEY}`;
  const r = await fetch(url);
  if (!r.ok) return res.status(500).json({ error: 'Finnhub error' });
  const articles = await r.json();
  const clean = articles.slice(0, 10).map(a => ({
    headline: a.headline,
    summary: a.summary,
    source: a.source,
    url: a.url,
    datetime: a.datetime,
    image: a.image,
  }));
  return res.status(200).json({ articles: clean });
}

// ── NOTICIAS CON IA (resumen para analyzer) ──
if (type === 'news' && req.method === 'POST') {
  const body = await new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
  });

  const ticker = body.ticker || symbol || 'SPY';

  // 1. Traer noticias de Finnhub
  const today = new Date().toISOString().slice(0,10);
  const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().slice(0,10);
  let feedText = '';
  try {
    const fr = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${weekAgo}&to=${today}&token=${FINNHUB_KEY}`);
    if (fr.ok) {
      const articles = await fr.json();
      feedText = articles.slice(0,6).map((a,i) =>
        `News ${i+1}: ${a.headline}\nSummary: ${(a.summary||'').slice(0,200)}\nSource: ${a.source}`
      ).join('\n\n');
    }
  } catch(e) {}

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_KEY not set' });

  const prompt = feedText
    ? `Analyze these REAL news articles about ${ticker}. Select 2 positive and 2 negative. Write direct headlines in English with specific facts.\n\n${feedText}\n\nONLY JSON no extra text:\n{"good":[{"titular":"direct headline max 18 words","impact":"1 sentence price impact","source":"source name"},{"titular":"...","impact":"...","source":"..."}],"bad":[{"titular":"...","impact":"...","source":"..."},{"titular":"...","impact":"...","source":"..."}]}`
    : `Search the web for the most recent news this week about stock ${ticker}. Find 2 positive and 2 negative with specific facts. ONLY JSON:\n{"good":[{"titular":"headline max 18 words","impact":"price impact","source":"source"},{"titular":"...","impact":"...","source":"..."}],"bad":[{"titular":"...","impact":"...","source":"..."},{"titular":"...","impact":"...","source":"..."}]}`;

  const tools = feedText ? [] : [{type:'web_search_20250305', name:'web_search'}];
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': ANTHROPIC_KEY,
    'anthropic-version': '2023-06-01',
  };
  if (!feedText) headers['anthropic-beta'] = 'web-search-2025-03-05';

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      ...(tools.length ? {tools} : {}),
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!aiRes.ok) return res.status(500).json({ error: 'AI request failed' });
  const aiData = await aiRes.json();
  const text = aiData.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const clean = text.replace(/```json|```/g, '').trim();

  try {
    return res.status(200).json(JSON.parse(clean));
  } catch(e) {
    return res.status(500).json({ error: 'Could not parse AI response' });
  }
}

// ── STRIPE CHECKOUT ──
if (type === 'checkout' && req.method === 'POST') {
  const body = await new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
  });
  const { email, userId } = body;
  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'mode': 'subscription',
      'line_items[0][price]': PRICE_ID,
      'line_items[0][quantity]': '1',
      'customer_email': email || '',
      'success_url': `https://smartstocksignal.com/dashboard.html?success=true&userId=${userId||''}`,
      'cancel_url': 'https://smartstocksignal.com/dashboard.html?canceled=true',
      'metadata[userId]': userId || '',
      'subscription_data[metadata][userId]': userId || '',
      'allow_promotion_codes': 'true',
    }).toString()
  });
  const session = await stripeRes.json();
  if (session.error) return res.status(400).json({ error: session.error.message });
  return res.status(200).json({ url: session.url, sessionId: session.id });
}

// ── ACTIVAR PLAN PRO ──
if (type === 'activate_pro' && req.method === 'POST') {
  const body = await new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
  });
  const { userId } = body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ plan: 'pro' })
  });
  if (!sbRes.ok) return res.status(500).json({ error: 'Error updating plan' });
  return res.status(200).json({ success: true });
}

// ── VERIFICAR SESIÓN STRIPE ──
if (type === 'verify_session') {
  const sessionId = req.query.session_id;
  if (!sessionId) return res.status(400).json({ error: 'session_id required' });
  const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
  });
  const session = await stripeRes.json();
  return res.status(200).json({
    paid: session.payment_status === 'paid',
    userId: session.metadata?.userId,
    email: session.customer_email,
    status: session.status,
  });
}

return res.status(400).json({ error: 'Invalid type' });
```

} catch (error) {
return res.status(500).json({ error: error.message });
}
}