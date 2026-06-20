// MPP Server Module - Mock implementation for Googletine
// Handles payment decisions, session management, and payment verification

import { randomBytes } from 'crypto';

// MPP Configuration
const MPP_CONFIG = {
  currency: 'USDC',
  perPageCost: 1000, // 0.001 USDC in smallest unit (1 USDC = 1,000,000 units)
  sessionDuration: 3600000, // 1 hour in milliseconds
  maxAuthorizationAmount: 1000000, // USDC 1
  maxSinglePayment: 20000, // USDC 0.02
  intent: 'session' // Using MPP Sessions for payment channels
};

// Active sessions storage (in-memory for mock)
const activeSessions = new Map();

/**
 * Generate a unique session ID
 */
function generateSessionId() {
  return `sess_${randomBytes(16).toString('hex')}`;
}

/**
 * Generate a unique transaction ID
 */
function generateTransactionId() {
  return `txn_${randomBytes(16).toString('hex')}`;
}

/**
 * Calculate price for a request (USDC 0.001 per page)
 * @param {string} url - The URL being requested
 * @returns {number} Price in smallest unit
 */
export function calculatePrice(url) {
  // For now, fixed price per page regardless of URL
  // In production, this could be dynamic based on content type, complexity, etc.
  return MPP_CONFIG.perPageCost;
}

/**
 * Payment decision function - determines if payment is required
 * For now, always returns true (always require payment)
 * @param {string} url - The URL being requested
 * @param {string} sessionId - Session identifier
 * @returns {object} Payment decision with amount and requirements
 */
export function requiresPayment(url, sessionId) {
  const amount = calculatePrice(url);

  return {
    required: true, // Always require payment for now
    amount: amount,
    currency: MPP_CONFIG.currency,
    intent: MPP_CONFIG.intent,
    sessionId: sessionId,
    session: {
      maxAmount: MPP_CONFIG.maxAuthorizationAmount,
      maxSinglePayment: MPP_CONFIG.maxSinglePayment,
      expiry: Date.now() + MPP_CONFIG.sessionDuration
    }
  };
}

/**
 * Create a new payment session
 * @param {string} userId - User identifier
 * @param {number} authorizedAmount - Amount authorized by user
 * @returns {object} Session details
 */
export function createSession(userId, authorizedAmount) {
  const sessionId = generateSessionId();
  const session = {
    sessionId: sessionId,
    userId: userId,
    authorizedAmount: authorizedAmount,
    usedAmount: 0,
    remainingAmount: authorizedAmount,
    createdAt: Date.now(),
    expiryAt: Date.now() + MPP_CONFIG.sessionDuration,
    payments: [],
    active: true
  };

  activeSessions.set(sessionId, session);
  console.log(`[MPP-Server] Created session ${sessionId} for user ${userId}, authorized ${authorizedAmount} units`);

  return session;
}

/**
 * Get session details
 * @param {string} sessionId - Session identifier
 * @returns {object|null} Session details or null if not found
 */
export function getSession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return null;
  }

  // Check if session is expired
  if (Date.now() > session.expiryAt) {
    console.log(`[MPP-Server] Session ${sessionId} expired`);
    session.active = false;
    return session;
  }

  return session;
}

/**
 * Verify a payment (mock implementation with full protocol simulation)
 * @param {object} payment - Payment object to verify
 * @returns {object} Verification result
 */
export function verifyPayment(payment) {
  // Validate payment structure
  if (!payment || !payment.transactionId || !payment.amount || !payment.sessionId) {
    return {
      valid: false,
      error: 'Invalid payment structure'
    };
  }

  // Get session
  const session = getSession(payment.sessionId);
  if (!session) {
    return {
      valid: false,
      error: 'Session not found or expired'
    };
  }

  // Check if session is active
  if (!session.active) {
    return {
      valid: false,
      error: 'Session is not active'
    };
  }

  // Check if amount exceeds max single payment
  if (payment.amount > MPP_CONFIG.maxSinglePayment) {
    return {
      valid: false,
      error: `Payment amount ${payment.amount} exceeds max single payment ${MPP_CONFIG.maxSinglePayment}`
    };
  }

  // Check if payment would exceed authorized amount
  if (session.usedAmount + payment.amount > session.authorizedAmount) {
    return {
      valid: false,
      error: `Payment would exceed authorized amount. Used: ${session.usedAmount}, New: ${payment.amount}, Authorized: ${session.authorizedAmount}`
    };
  }

  // Check for duplicate payment (transaction ID already used)
  if (session.payments.some(p => p.transactionId === payment.transactionId)) {
    return {
      valid: false,
      error: 'Duplicate payment - transaction ID already used'
    };
  }

  // Verify mock signature (in production, this would be cryptographic verification)
  if (!payment.signature) {
    return {
      valid: false,
      error: 'Payment signature missing'
    };
  }

  // All checks passed - payment is valid
  // Update session
  session.usedAmount += payment.amount;
  session.remainingAmount = session.authorizedAmount - session.usedAmount;
  session.payments.push({
    transactionId: payment.transactionId,
    amount: payment.amount,
    timestamp: Date.now(),
    signature: payment.signature
  });

  console.log(`[MPP-Server] Verified payment ${payment.transactionId} for ${payment.amount} units. Session used: ${session.usedAmount}/${session.authorizedAmount}`);

  return {
    valid: true,
    transactionId: payment.transactionId,
    amount: payment.amount,
    session: {
      sessionId: session.sessionId,
      usedAmount: session.usedAmount,
      remainingAmount: session.remainingAmount,
      active: session.usedAmount < session.authorizedAmount
    }
  };
}

/**
 * Close a session (settlement)
 * @param {string} sessionId - Session identifier
 * @returns {object} Settlement details
 */
export function closeSession(sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    return {
      success: false,
      error: 'Session not found'
    };
  }

  session.active = false;
  session.closedAt = Date.now();

  console.log(`[MPP-Server] Closed session ${sessionId}. Final amount: ${session.usedAmount}`);

  return {
    success: true,
    sessionId: sessionId,
    finalAmount: session.usedAmount,
    authorizedAmount: session.authorizedAmount,
    refundAmount: session.authorizedAmount - session.usedAmount,
    payments: session.payments.length
  };
}

/**
 * Get all active sessions (for debugging/admin)
 * @returns {array} List of active sessions
 */
export function getActiveSessions() {
  return Array.from(activeSessions.values()).filter(s => s.active);
}

/**
 * Clean up expired sessions
 * @returns {number} Number of sessions cleaned up
 */
export function cleanupExpiredSessions() {
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, session] of activeSessions.entries()) {
    if (now > session.expiryAt && session.active) {
      session.active = false;
      session.closedAt = now;
      cleaned++;
      console.log(`[MPP-Server] Cleaned up expired session ${sessionId}`);
    }
  }

  return cleaned;
}

// Auto-cleanup expired sessions every 5 minutes
setInterval(() => {
  cleanupExpiredSessions();
}, 300000);

export default {
  calculatePrice,
  requiresPayment,
  createSession,
  getSession,
  verifyPayment,
  closeSession,
  getActiveSessions,
  cleanupExpiredSessions,
  config: MPP_CONFIG
};
