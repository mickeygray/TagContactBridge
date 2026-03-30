const express = require('express');
const router = express.Router();
const config = require('../config/env');
const log = require('../utils/logger');
const stateEngine = require('../engine/stateEngine');

/**
 * POST /webhook/ex
 * Receives RingEX presence webhook events
 *
 * RingCentral sends two types of requests here:
 * 1. Validation request (on subscription creation) — has Validation-Token header
 * 2. Event notification — has event payload in body
 */
router.post('/ex', async (req, res) => {
  // Step 1: Handle validation handshake
  // When creating a subscription, RC sends a test request with Validation-Token
  // We must echo it back as a response header with 200
  const validationToken = req.headers['validation-token'];
  if (validationToken) {
    log.webhook('Validation handshake received — echoing token');
    res.set('Validation-Token', validationToken);
    return res.status(200).send('OK');
  }

  // Step 2: Verify the request is from RingCentral
  const verificationToken = req.headers['verification-token'];
  if (config.WEBHOOK_SECRET && verificationToken !== config.WEBHOOK_SECRET) {
    log.warn('Webhook received with invalid verification token');
    // Still return 200 to prevent RC from retrying, but don't process
    return res.status(200).send('Invalid token');
  }

  // Step 3: Respond immediately (RC requires response within 3 seconds)
  res.status(200).send('OK');

  // Step 4: Process the event asynchronously
  try {
    const event = req.body;

    if (!event || !event.event) {
      log.warn('Webhook received with empty or malformed body');
      return;
    }

    // Determine event type from the event URI
    const eventUri = event.event || '';

    if (eventUri.includes('/presence')) {
      // Presence/telephony event
      log.webhook(`Presence event: ext=${event.body?.extensionId} tel=${event.body?.telephonyStatus} pres=${event.body?.presenceStatus}`);
      await stateEngine.processPresenceEvent(event);

    } else if (eventUri.includes('/telephony/sessions')) {
      // Account-level telephony session event
      log.webhook(`Telephony session event: ${event.body?.eventType || 'unknown'}`);
      // For now, just log — the per-extension presence events are our primary signal
      // This is useful for debugging and catching edge cases

    } else if (eventUri.includes('/subscription')) {
      // Subscription lifecycle event (renewal reminder, etc.)
      log.webhook(`Subscription event: ${eventUri}`);

    } else {
      log.webhook(`Unknown event type: ${eventUri}`);
    }

  } catch (err) {
    log.error('Error processing webhook:', err.message);
  }
});

/**
 * GET /webhook/test
 * Quick test endpoint to verify the webhook URL is reachable
 */
router.get('/test', (req, res) => {
  res.json({
    status: 'ok',
    service: 'RingBridge',
    webhookEndpoint: `${config.NGROK_DOMAIN}/webhook/ex`,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
