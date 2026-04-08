export default async function handler(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘GET, POST, OPTIONS’);
res.setHeader(‘Access-Control-Allow-Headers’, ‘Content-Type’);

if (req.method === ‘OPTIONS’) return res.status(200).end();

const { type, symbol } = req.query;

const STRIPE_SECRET = process.env.STRIPE_SECRET;
const PRICE_ID = process.env.STRIPE_PRICE_ID;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || ‘https://wnfogptzpqqugjxvwlnb.supabase.co’;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

try {

```
// ── NOTICIAS CON IA (POST) ──
if (type === 'news' && req.method === 'POST') {
  const body = await new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
  });

  const ticker = body.ticker || symbol || 'SPY';

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_KEY not set' });

  const prompt = `Search the web for the most recent news this week about the stock ${ticker}. Find exactly 2 positive and 2 negative news with specific concrete facts. Respond ONLY with valid JSON no extra text:\n{"good":[{"titular":"headline max 18 words","impact":"1 sentence price impact","source":"source name"},{"titular":"...","impact":"...","source":"..."}],"bad":[{"titular":"...","impact":"...","source":"..."},{"titular":"...","impact":"...","source":"..."}]}`;

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
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