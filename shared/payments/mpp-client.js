// MPP Client Module - Mock implementation for Googletine
// Handles payment execution, authorization management, and payment tracking

import { randomBytes } from 'crypto';
import * as sessions from './sessions.js';

// MPP Client Configuration
const MPP_CLIENT_CONFIG = {
  defaultAuthorizationAmount: 1000000, // USDC 1
  minAuthorizationAmount: 1000000, // USDC 1 minimum
  currency: 'USDC'
};

// Authorization storage (in-memory for mock)
// Maps userId -> authorization session
const authorizations = new Map();

// Payment tracking for user sessions
const paymentHistory = new Map();

/**
 * Generate a unique authorization ID
 */
function generateAuthId() {
  return `auth_${randomBytes(16).toString('hex')}`;
}

/**
 * Generate a unique transaction ID
 */
function generateTransactionId() {
  return `txn_${randomBytes(16).toString('hex')}`;
}

/**
 * Create a mock signature for payment
 * In production, this would be a cryptographic signature
 */
function generateSignature(paymentData) {
  return `sig_${randomBytes(32).toString('hex')}`;
}

/**
 * Create a new authorization session
 * @param {string} userId - User identifier
 * @param {number} amount - Amount to authorize (in smallest unit)
 * @returns {object} Authorization session details
 */
export function createAuthorization(userId, amount = MPP_CLIENT_CONFIG.defaultAuthorizationAmount) {
  // Validate minimum amount
  if (amount < MPP_CLIENT_CONFIG.minAuthorizationAmount) {
    throw new Error(`Minimum authorization amount is ${sessions.formatAmount(MPP_CLIENT_CONFIG.minAuthorizationAmount)}`);
  }

  const authId = generateAuthId();
  const authorization = {
    authId: authId,
    userId: userId,
    authorizedAmount: amount,
    usedAmount: 0,
    remainingAmount: amount,
    createdAt: Date.now(),
    expiryAt: Date.now() + 3600000, // 1 hour
    active: true,
    payments: []
  };

  authorizations.set(userId, authorization);
  console.log(`[MPP-Client] Created authorization ${authId} for user ${userId}: ${sessions.formatAmount(amount)}`);

  return authorization;
}

/**
 * Get authorization for a user
 * @param {string} userId - User identifier
 * @returns {object|null} Authorization details or null
 */
export function getAuthorization(userId) {
  const auth = authorizations.get(userId);
  if (!auth) {
    return null;
  }

  // Check if expired
  if (Date.now() > auth.expiryAt) {
    auth.active = false;
    return auth;
  }

  return auth;
}

/**
 * Check if user has sufficient authorization for a payment
 * @param {string} userId - User identifier
 * @param {number} amount - Amount to check
 * @returns {object} Authorization status
 */
export function checkAuthorization(userId, amount) {
  const auth = getAuthorization(userId);

  if (!auth) {
    return {
      authorized: false,
      reason: 'no_authorization',
      message: 'No authorization found. Please authorize to continue.'
    };
  }

  if (!auth.active) {
    return {
      authorized: false,
      reason: 'authorization_expired',
      message: 'Authorization has expired. Please re-authorize.'
    };
  }

  if (auth.usedAmount + amount > auth.authorizedAmount) {
    return {
      authorized: false,
      reason: 'insufficient_funds',
      message: `Insufficient authorized amount. Need ${sessions.formatAmount(amount)}, have ${sessions.formatAmount(auth.remainingAmount)} remaining.`
    };
  }

  if (amount > 20000) { // USDC 0.02 max single payment
    return {
      authorized: false,
      reason: 'exceeds_max_payment',
      message: `Amount ${sessions.formatAmount(amount)} exceeds maximum single payment of $0.02 USDC`
    };
  }

  return {
    authorized: true,
    authId: auth.authId,
    remainingAmount: auth.remainingAmount,
    authorizedAmount: auth.authorizedAmount,
    usedAmount: auth.usedAmount
  };
}

/**
 * Execute a payment (mock with full protocol simulation)
 * @param {object} paymentRequest - Payment request from server
 * @param {string} userId - User identifier
 * @returns {object} Payment execution result
 */
export async function executePayment(paymentRequest, userId) {
  // Check authorization
  const authCheck = checkAuthorization(userId, paymentRequest.amount);

  if (!authCheck.authorized) {
    throw new Error(authCheck.message);
  }

  const auth = getAuthorization(userId);
  const transactionId = generateTransactionId();

  // Create mock payment with signature
  const payment = {
    transactionId: transactionId,
    amount: paymentRequest.amount,
    currency: paymentRequest.currency || MPP_CLIENT_CONFIG.currency,
    sessionId: paymentRequest.sessionId,
    timestamp: Date.now(),
    signature: generateSignature({
      transactionId,
      amount: paymentRequest.amount,
      sessionId: paymentRequest.sessionId,
      timestamp: Date.now()
    }),
    authId: auth.authId
  };

  // Update authorization
  auth.usedAmount += paymentRequest.amount;
  auth.remainingAmount = auth.authorizedAmount - auth.usedAmount;
  auth.payments.push({
    transactionId: transactionId,
    amount: paymentRequest.amount,
    timestamp: Date.now()
  });

  // Track payment history
  if (!paymentHistory.has(userId)) {
    paymentHistory.set(userId, []);
  }
  paymentHistory.get(userId).push(payment);

  console.log(`[MPP-Client] Executed payment ${transactionId} for ${sessions.formatAmount(paymentRequest.amount)}. Authorization used: ${auth.usedAmount}/${auth.authorizedAmount}`);

  return {
    success: true,
    payment: payment,
    authorization: {
      authId: auth.authId,
      remainingAmount: auth.remainingAmount,
      usagePercent: (auth.usedAmount / auth.authorizedAmount) * 100
    }
  };
}

/**
 * Get payment history for a user
 * @param {string} userId - User identifier
 * @param {number} limit - Maximum number of payments to return
 * @returns {array} Payment history
 */
export function getPaymentHistory(userId, limit = 50) {
  const history = paymentHistory.get(userId) || [];
  return history.slice(-limit);
}

/**
 * Get payment status
 * @param {string} transactionId - Transaction identifier
 * @returns {object|null} Payment status or null
 */
export function getPaymentStatus(transactionId) {
  for (const [userId, payments] of paymentHistory.entries()) {
    const payment = payments.find(p => p.transactionId === transactionId);
    if (payment) {
      return {
        transactionId: payment.transactionId,
        amount: payment.amount,
        timestamp: payment.timestamp,
        status: 'completed',
        userId: userId
      };
    }
  }
  return null;
}

/**
 * Close authorization session
 * @param {string} userId - User identifier
 * @returns {object} Closure details
 */
export function closeAuthorization(userId) {
  const auth = getAuthorization(userId);
  if (!auth) {
    return {
      success: false,
      error: 'Authorization not found'
    };
  }

  auth.active = false;
  auth.closedAt = Date.now();

  const refundAmount = auth.authorizedAmount - auth.usedAmount;

  console.log(`[MPP-Client] Closed authorization ${auth.authId} for user ${userId}. Final: ${sessions.formatAmount(auth.usedAmount)}, Refund: ${sessions.formatAmount(refundAmount)}`);

  return {
    success: true,
    authId: auth.authId,
    finalAmount: auth.usedAmount,
    authorizedAmount: auth.authorizedAmount,
    refundAmount: refundAmount,
    paymentCount: auth.payments.length
  };
}

/**
 * Get all active authorizations (for debugging)
 * @returns {array} List of active authorizations
 */
export function getActiveAuthorizations() {
  return Array.from(authorizations.values()).filter(a => a.active);
}

export default {
  createAuthorization,
  getAuthorization,
  checkAuthorization,
  executePayment,
  getPaymentHistory,
  getPaymentStatus,
  closeAuthorization,
  getActiveAuthorizations,
  config: MPP_CLIENT_CONFIG
};
