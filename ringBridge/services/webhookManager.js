const config = require('../config/env');
const log = require('../utils/logger');
const Agent = require('../models/Agent');
const rcAuthService = require('./rcAuthService');

/**
 * Subscribe to presence events for a single agent extension
 */
async function subscribeAgent(extensionId) {
  const platform = rcAuthService.getPlatform();
  if (!platform) {
    log.warn(`Cannot subscribe ext ${extensionId} — platform not initialized`);
    return null;
  }

  try {
    const webhookUrl = `${config.NGROK_DOMAIN}/webhook/ex`;

    const resp = await platform.post('/restapi/v1.0/subscription', {
      eventFilters: [
        `/restapi/v1.0/account/~/extension/${extensionId}/presence?detailedTelephonyState=true&sipData=true`
      ],
      deliveryMode: {
        transportType: 'WebHook',
        address: webhookUrl,
        verificationToken: config.WEBHOOK_SECRET
      },
      expiresIn: 630720000 // ~20 years
    });

    const data = await resp.json();

    // Update agent record with subscription info
    await Agent.findOneAndUpdate(
      { extensionId: extensionId.toString() },
      {
        webhookSubscriptionId: data.id,
        webhookExpiresAt: new Date(data.expirationTime)
      }
    );

    log.success(`Webhook subscribed for ext ${extensionId} (sub: ${data.id})`);
    return data;
  } catch (err) {
    log.error(`Failed to subscribe ext ${extensionId}:`, err.message);

    // If subscription already exists, try to find and renew it
    if (err.message?.includes('SUB-505') || err.message?.includes('already')) {
      log.info(`Subscription may already exist for ext ${extensionId}, checking...`);
      await checkExistingSubscriptions(extensionId);
    }

    return null;
  }
}

/**
 * Subscribe to account-level telephony sessions
 * This catches all calls across the account in one subscription
 */
async function subscribeAccountTelephony() {
  const platform = rcAuthService.getPlatform();
  if (!platform) return null;

  try {
    const webhookUrl = `${config.NGROK_DOMAIN}/webhook/ex`;

    const resp = await platform.post('/restapi/v1.0/subscription', {
      eventFilters: [
        '/restapi/v1.0/account/~/telephony/sessions'
      ],
      deliveryMode: {
        transportType: 'WebHook',
        address: webhookUrl,
        verificationToken: config.WEBHOOK_SECRET
      },
      expiresIn: 630720000
    });

    const data = await resp.json();
    log.success(`Account telephony webhook subscribed (sub: ${data.id})`);
    return data;
  } catch (err) {
    log.error('Failed to subscribe account telephony:', err.message);
    return null;
  }
}

/**
 * Check and list existing subscriptions
 */
async function checkExistingSubscriptions(extensionId = null) {
  const platform = rcAuthService.getPlatform();
  if (!platform) return [];

  try {
    const resp = await platform.get('/restapi/v1.0/subscription');
    const data = await resp.json();

    const subs = data.records || [];
    log.info(`Found ${subs.length} existing subscription(s)`);

    for (const sub of subs) {
      const filters = sub.eventFilters?.join(', ') || 'none';
      const status = sub.status;
      const expires = sub.expirationTime;
      log.info(`  Sub ${sub.id}: status=${status}, filters=${filters}, expires=${expires}`);
    }

    return subs;
  } catch (err) {
    log.error('Failed to list subscriptions:', err.message);
    return [];
  }
}

/**
 * Renew a specific subscription
 */
async function renewSubscription(subscriptionId) {
  const platform = rcAuthService.getPlatform();
  if (!platform) return null;

  try {
    const resp = await platform.post(`/restapi/v1.0/subscription/${subscriptionId}/renew`);
    const data = await resp.json();
    log.success(`Renewed subscription ${subscriptionId}, expires: ${data.expirationTime}`);
    return data;
  } catch (err) {
    log.error(`Failed to renew subscription ${subscriptionId}:`, err.message);
    return null;
  }
}

/**
 * Delete a subscription
 */
async function deleteSubscription(subscriptionId) {
  const platform = rcAuthService.getPlatform();
  if (!platform) return false;

  try {
    await platform.delete(`/restapi/v1.0/subscription/${subscriptionId}`);
    log.success(`Deleted subscription ${subscriptionId}`);
    return true;
  } catch (err) {
    log.error(`Failed to delete subscription ${subscriptionId}:`, err.message);
    return false;
  }
}

/**
 * Delete all existing subscriptions (clean slate)
 */
async function deleteAllSubscriptions() {
  const subs = await checkExistingSubscriptions();
  for (const sub of subs) {
    await deleteSubscription(sub.id);
  }
  log.info('All subscriptions cleared');
}

/**
 * Initialize all agent subscriptions
 * Call this on service startup
 */
async function initializeAll() {
  const { isAuthenticated } = rcAuthService.getAuthStatus();
  if (!isAuthenticated) {
    log.warn('Skipping webhook initialization — RC not authenticated');
    return;
  }

  const agents = await Agent.find({});

  if (agents.length === 0) {
    log.warn('No agents in database — nothing to subscribe to');
    log.info('Add agents via POST /api/admin/agents or seed them manually');
    return;
  }

  log.info(`Initializing webhooks for ${agents.length} agent(s)...`);

  for (const agent of agents) {
    // Check if existing subscription is still valid
    if (agent.webhookSubscriptionId && agent.webhookExpiresAt > new Date()) {
      log.info(`  ext ${agent.extensionId} (${agent.name}) — subscription still valid`);
      continue;
    }

    await subscribeAgent(agent.extensionId);

    // Small delay between subscriptions to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }

  // Also subscribe to account-level telephony
  await subscribeAccountTelephony();

  log.success('Webhook initialization complete');
}

module.exports = {
  subscribeAgent,
  subscribeAccountTelephony,
  checkExistingSubscriptions,
  renewSubscription,
  deleteSubscription,
  deleteAllSubscriptions,
  initializeAll
};
