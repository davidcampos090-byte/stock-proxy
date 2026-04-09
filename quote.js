export default async function handler(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘GET, POST, OPTIONS’);
res.setHeader(‘Access-Control-Allow-Headers’, ‘Content-Type’);
if (req.method === ‘OPTIONS’) return res.status(200).end();

const { type } = req.query;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const STRIPE_SECRET = process.env.STRIPE_SECRET;
const PRICE_ID = process.env.STRIPE_PRICE_ID;
const FINNHUB_KEY = process.env.FINNHUB_KEY;
const SUPABASE_URL = ‘https://wnfogptzpqqugjxvwlnb.supabase.co’;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const readBody = (r) => new Promise((resolve) => {
let data = ‘’;
r.on(‘data’, chunk => data += chunk);
r.on(‘end’, () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
});

try {

```
// ANALYZE CON IA - API key segura en servidor
if (type === 'analyze' && req.method === 'POST') {
  const body = await readBody(req);
  const { ticker, price, chgPct, rsi, rsiS, macd, macdS, smaS, bbS,
          vwap, vwapS, candle, candS, smLbl, pcr, pcSig,
          pattern, cpSig, buys, sells, neutrals, support, stopLoss, tfL } = body;

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_KEY not configured' });

  const prompt = `Analyze ${ticker}. Respond ONLY valid JSON.\nPrice:$${price}(${chgPct}%) RSI:${rsi}→${rsiS} MACD:${macd}→${macdS} SMA:${smaS} BB:${bbS} VWAP:$${vwap}→${vwapS} Candle:${candle}→${candS} SmartMoney:${smLbl} PCR:${pcr}→${pcSig} Pattern:${pattern}→${cpSig} Signals:${buys}Buy/${sells}Sell/${neutrals}Neutral\n{"signal":"BUY or SELL or HOLD","analysis":"3 sentences integrating all indicators","tf_comment":"1 sentence about reliability for ${tfL}","buy_price":"${support}","buy_reason":"1 sentence","stop_loss":"${stopLoss}","stop_reason":"1 sentence"}`;

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!aiRes.ok) return res.status(500).json({ error: 'AI error: ' + aiRes.status });
  const aiData = await aiRes.json();
  const text = aiData.content.filter(b => b.type === 'text').map(b => b.text).join('');
  try {
    return res.status(200).json(JSON.parse(text.replace(/```json|```/g, '').trim()));
  } catch(e) {
    return res.status(500).json({ error: 'Parse error' });
  }
}

// NOTICIAS CON IA
if (type === 'news' && req.method === 'POST') {
  const body = await readBody(req);
  const ticker = body.ticker || 'SPY';
  let feedText = '';
  try {
    const today = new Date().toISOString().slice(0,10);
    const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().slice(0,10);
    const fr = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${weekAgo}&to=${today}&token=${FINNHUB_KEY}`);
    if (fr.ok) {
      const articles = await fr.json();
      feedText = articles.slice(0,6).map((a,i) =>
        `News ${i+1}: ${a.headline}\nSummary: ${(a.summary||'').slice(0,200)}\nSource: ${a.source}`
      ).join('\n\n');
    }
  } catch(e) {}

  const prompt = feedText
    ? `Analyze these news about ${ticker}. Select 2 positive and 2 negative. ONLY JSON:\n${feedText}\n\n{"good":[{"titular":"max 18 words","impact":"price impact","source":"name"},{"titular":"...","impact":"...","source":"..."}],"bad":[{"titular":"...","impact":"...","source":"..."},{"titular":"...","impact":"...","source":"..."}]}`
    : `Find 2 positive and 2 negative recent news about ${ticker}. ONLY JSON:\n{"good":[{"titular":"...","impact":"...","source":"..."},{"titular":"...","impact":"...","source":"..."}],"bad":[{"titular":"...","impact":"...","source":"..."},{"titular":"...","impact":"...","source":"..."}]}`;

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 800, messages: [{ role: 'user', content: prompt }] })
  });
  if (!aiRes.ok) return res.status(500).json({ error: 'AI error' });
  const aiData = await aiRes.json();
  const text = aiData.content.filter(b => b.type === 'text').map(b => b.text).join('');
  try {
    return res.status(200).json(JSON.parse(text.replace(/```json|```/g, '').trim()));
  } catch(e) {
    return res.status(500).json({ error: 'Parse error' });
  }
}

// STRIPE CHECKOUT
if (type === 'checkout' && req.method === 'POST') {
  const { email, userId } = await readBody(req);
  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' },
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
  return res.status(200).json({ url: session.url });
}

// ACTIVAR PRO
if (type === 'activate_pro' && req.method === 'POST') {
  const { userId } = await readBody(req);
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ plan: 'pro' })
  });
  if (!sbRes.ok) return res.status(500).json({ error: 'Error updating plan' });
  return res.status(200).json({ success: true });
}

// VERIFICAR SESIÓN
if (type === 'verify_session') {
  const sessionId = req.query.session_id;
  if (!sessionId) return res.status(400).json({ error: 'session_id required' });
  const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
  });
  const session = await stripeRes.json();
  return res.status(200).json({ paid: session.payment_status === 'paid', userId: session.metadata?.userId });
}

return res.status(400).json({ error: 'Invalid type' });
```

} catch (error) {
return res.status(500).json({ error: error.message });
}
}
