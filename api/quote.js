export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type } = req.query;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
  const STRIPE_SECRET = process.env.STRIPE_SECRET;
  const PRICE_ID = process.env.STRIPE_PRICE_ID;
  const FINNHUB_KEY = process.env.FINNHUB_KEY;
  const SUPABASE_URL = 'https://wnfogptzpqqugjxvwlnb.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  const TD_KEY = process.env.TD_KEY;

  const readBody = (r) => new Promise((resolve) => {
    let data = '';
    r.on('data', chunk => data += chunk);
    r.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
  });

  try {

    // ── ANALYZE ──
    if (type === 'analyze' && req.method === 'POST') {
      const body = await readBody(req);
      const {
        ticker, price, chgPct, rsi, rsiS, macd, macdS, smaS, bbS,
        vwap, vwapS, candle, candS, smLbl, pcr, pcSig,
        pattern, cpSig, buys, sells, neutrals, support, stopLoss, tfL,
        lang = 'en'
      } = body;

      if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_KEY not configured' });

      const isEs = lang === 'es';

      const prompt = isEs
        ? `Analiza ${ticker} con datos reales de mercado. Responde SOLO con JSON válido, sin texto extra.
Precio: $${price} (${chgPct}%) · RSI: ${rsi}(${rsiS}) · MACD: ${macd}(${macdS}) · SMA: ${smaS} · BB: ${bbS} · VWAP: $${vwap}(${vwapS}) · Vela: ${candle}(${candS}) · Smart Money: ${smLbl} · PCR: ${pcr}(${pcSig}) · Patrón: ${pattern}(${cpSig}) · Señales: ${buys}Compra/${sells}Venta/${neutrals}Neutral
{"signal":"COMPRAR o VENDER o MANTENER","analysis":"3 oraciones EN ESPAÑOL integrando todos los indicadores","tf_comment":"1 oración EN ESPAÑOL sobre la fiabilidad de la señal para temporalidad ${tfL}","buy_price":"${support}","buy_reason":"1 oración EN ESPAÑOL justificando el precio de entrada","stop_loss":"${stopLoss}","stop_reason":"1 oración EN ESPAÑOL justificando el stop loss"}`
        : `Analyze ${ticker} with real market data. Respond ONLY with valid JSON, no extra text.
Price: $${price} (${chgPct}%) · RSI: ${rsi}(${rsiS}) · MACD: ${macd}(${macdS}) · SMA: ${smaS} · BB: ${bbS} · VWAP: $${vwap}(${vwapS}) · Candle: ${candle}(${candS}) · Smart Money: ${smLbl} · PCR: ${pcr}(${pcSig}) · Pattern: ${pattern}(${cpSig}) · Signals: ${buys}Buy/${sells}Sell/${neutrals}Neutral
{"signal":"BUY or SELL or HOLD","analysis":"3 sentences in English integrating all indicators","tf_comment":"1 sentence about signal reliability for ${tfL} timeframe","buy_price":"${support}","buy_reason":"1 sentence justifying entry price","stop_loss":"${stopLoss}","stop_reason":"1 sentence justifying stop loss"}`;

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
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
        // Normalizar signal para que funcione con renderBanner
        if (isEs) {
          if (parsed.signal === 'COMPRAR') parsed.signal = 'BUY';
          else if (parsed.signal === 'VENDER') parsed.signal = 'SELL';
          else if (parsed.signal === 'MANTENER') parsed.signal = 'HOLD';
        }
        return res.status(200).json(parsed);
      } catch(e) {
        return res.status(500).json({ error: 'Parse error' });
      }
    }

    // ── CHECKOUT ──
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

    // ── ACTIVATE PRO ──
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

    // ── VERIFY SESSION ──
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

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
