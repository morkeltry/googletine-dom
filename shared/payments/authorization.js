// Authorization Tracking Module
// Handles user authorization state and limits

import * as mppClient from './mpp-client.js';
import * as sessions from './sessions.js';

// Authorization limits configuration
const AUTH_LIMITS = {
  minAuthorization: 1000000, // USDC 1 minimum
  maxAuthorization: 10000000, // USDC 10 maximum
  suggestedAuthorizations: [
    1000000,  // USDC 1
    2000000,  // USDC 2
    5000000,  // USDC 5
    10000000  // USDC 10
  ]
};

/**
 * Get authorization status for UI display
 * @param {string} userId - User identifier
 * @returns {object} Authorization status
 */
export function getAuthorizationStatus(userId) {
  const auth = mppClient.getAuthorization(userId);

  if (!auth) {
    return {
      hasAuthorization: false,
      canAuthorize: true,
      message: 'No active authorization',
      suggestedAmount: AUTH_LIMITS.minAuthorization,
      currency: 'USDC'
    };
  }

  if (!auth.active) {
    return {
      hasAuthorization: false,
      canAuthorize: true,
      message: 'Authorization expired',
      expiredAt: auth.expiryAt,
      suggestedAmount: AUTH_LIMITS.minAuthorization,
      previousAmount: auth.authorizedAmount,
      currency: 'USDC'
    };
  }

  const remainingPercent = (auth.remainingAmount / auth.authorizedAmount) * 100;

  return {
    hasAuthorization: true,
    canAuthorize: remainingPercent < 10, // Allow re-authorization when < 10% remaining
    message: 'Authorization active',
    authId: auth.authId,
    authorizedAmount: auth.authorizedAmount,
    usedAmount: auth.usedAmount,
    remainingAmount: auth.remainingAmount,
    remainingPercent: remainingPercent,
    expiryAt: auth.expiryAt,
    timeRemaining: Math.max(0, auth.expiryAt - Date.now()),
    paymentCount: auth.payments.length,
    currency: 'USDC'
  };
}

/**
 * Validate authorization amount
 * @param {number} amount - Amount to authorize
 * @returns {object} Validation result
 */
export function validateAuthorizationAmount(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return {
      valid: false,
      error: 'Amount must be a number'
    };
  }

  if (amount < AUTH_LIMITS.minAuthorization) {
    return {
      valid: false,
      error: `Minimum authorization amount is ${sessions.formatAmount(AUTH_LIMITS.minAuthorization)}`
    };
  }

  if (amount > AUTH_LIMITS.maxAuthorization) {
    return {
      valid: false,
      error: `Maximum authorization amount is ${sessions.formatAmount(AUTH_LIMITS.maxAuthorization)}`
    };
  }

  return {
    valid: true,
    amount: amount,
    formatted: sessions.formatAmount(amount)
  };
}

/**
 * Get suggested authorization amounts
 * @param {number} currentUsage - Current usage amount for context
 * @returns {array} Suggested amounts with metadata
 */
export function getSuggestedAmounts(currentUsage = 0) {
  return AUTH_LIMITS.suggestedAuthorizations.map(amount => {
    const usageMultiple = Math.ceil(currentUsage / amount);
    return {
      amount: amount,
      formatted: sessions.formatAmount(amount),
      recommended: amount >= currentUsage && amount <= AUTH_LIMITS.maxAuthorization,
      usageMultiple: usageMultiple
    };
  });
}

/**
 * Create authorization with validation
 * @param {string} userId - User identifier
 * @param {number} amount - Amount to authorize
 * @returns {object} Authorization result
 */
export function createAuthorization(userId, amount) {
  const validation = validateAuthorizationAmount(amount);

  if (!validation.valid) {
    return {
      success: false,
      error: validation.error
    };
  }

  try {
    const auth = mppClient.createAuthorization(userId, amount);
    return {
      success: true,
      authorization: {
        authId: auth.authId,
        userId: userId,
        authorizedAmount: auth.authorizedAmount,
        formattedAmount: sessions.formatAmount(auth.authorizedAmount),
        expiryAt: auth.expiryAt,
        active: true
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if re-authorization is needed
 * @param {string} userId - User identifier
 * @param {number} requiredAmount - Amount needed for next payment
 * @returns {object} Re-authorization check result
 */
export function checkReAuthorizationNeeded(userId, requiredAmount) {
  const auth = mppClient.getAuthorization(userId);

  if (!auth || !auth.active) {
    return {
      needed: true,
      reason: 'no_authorization',
      message: 'Please authorize to continue'
    };
  }

  const authCheck = mppClient.checkAuthorization(userId, requiredAmount);

  if (!authCheck.authorized) {
    // Determine appropriate action based on reason
    if (authCheck.reason === 'insufficient_funds') {
      return {
        needed: true,
        reason: 'low_balance',
        message: authCheck.message,
        suggestedAmount: Math.max(
          AUTH_LIMITS.minAuthorization,
          auth.authorizedAmount * 2
        )
      };
    }

    return {
      needed: true,
      reason: authCheck.reason,
      message: authCheck.message
    };
  }

  // Check if authorization is running low (< 20% remaining)
  const remainingPercent = (auth.remainingAmount / auth.authorizedAmount) * 100;
  if (remainingPercent < 20) {
    return {
      needed: false,
      warning: 'low_balance',
      message: `Authorization balance is low (${remainingPercent.toFixed(0)}% remaining)`,
      remainingAmount: auth.remainingAmount,
      remainingPercent: remainingPercent
    };
  }

  return {
    needed: false,
    remainingAmount: auth.remainingAmount,
    remainingPercent: remainingPercent
  };
}

export default {
  getAuthorizationStatus,
  validateAuthorizationAmount,
  getSuggestedAmounts,
  createAuthorization,
  checkReAuthorizationNeeded,
  limits: AUTH_LIMITS
};
