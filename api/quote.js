export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type, symbol, outputsize, interval } = req.query;

  const STRIPE_SECRET = 'sk_test_51TIsOtLc2ovMZfInrIJpByq5rd26nsE9zfH8aq3cRhlG14pkNdVzT8BEX81sZQsjUQsKg6EoPt9jrTbofRUcCO7H00wKqR0ciR';
  const PRICE_ID = 'price_1TIyF0Lc2ovMZfIn0mc9vomI';
  const SUPABASE_URL = 'https://wnfogptzpqqugjxvwlnb.supabase.co';
  const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduZm9ncHR6cHFxdWdqeHZ3bG5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzOTY2MzUsImV4cCI6MjA5MDk3MjYzNX0.qLngiAY9bFvVipEAtKVqQVQAV62QcUPAlElKPkWAqRk';

  try {
    // ── PRECIOS DIARIOS ──
    if (type === 'daily') {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=${outputsize||'compact'}&apikey=1X417BA6SKUHENY1`;
      const r = await fetch(url);
      return res.status(200).json(await r.json());
    }

    // ── PRECIOS INTRADAY ──
    if (type === 'intraday') {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${interval||'15min'}&outputsize=compact&apikey=1X417BA6SKUHENY1`;
      const r = await fetch(url);
      return res.status(200).json(await r.json());
    }

    // ── NOTICIAS ──
    if (type === 'news') {
      const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol}&limit=8&apikey=1X417BA6SKUHENY1`;
      const r = await fetch(url);
      return res.status(200).json(await r.json());
    }

    // ── STRIPE CHECKOUT SESSION ──
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

    // ── ACTIVAR PLAN PRO (webhook tras pago exitoso) ──
    if (type === 'activate_pro' && req.method === 'POST') {
      const body = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
      });

      const { userId } = body;
      if (!userId) return res.status(400).json({ error: 'userId requerido' });

      // Actualizar plan en Supabase
      const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ plan: 'pro' })
      });

      if (!sbRes.ok) return res.status(500).json({ error: 'Error actualizando plan' });
      return res.status(200).json({ success: true });
    }

    // ── VERIFICAR SESIÓN DE STRIPE ──
    if (type === 'verify_session') {
      const sessionId = req.query.session_id;
      if (!sessionId) return res.status(400).json({ error: 'session_id requerido' });

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

    return res.status(400).json({ error: 'Tipo no válido' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
