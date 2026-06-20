// Session Management Module - Shared between server and client
// Handles MPP session state and validation

/**
 * Check if a session is valid and active
 * @param {object} session - Session object to validate
 * @returns {object} Validation result
 */
export function validateSession(session) {
  if (!session) {
    return {
      valid: false,
      error: 'Session not found'
    };
  }

  if (!session.active) {
    return {
      valid: false,
      error: session.closedAt ? 'Session has been closed' : 'Session is not active'
    };
  }

  const now = Date.now();
  if (now > session.expiryAt) {
    return {
      valid: false,
      error: 'Session has expired'
    };
  }

  if (session.usedAmount >= session.authorizedAmount) {
    return {
      valid: false,
      error: 'Session funds exhausted'
    };
  }

  return {
    valid: true,
    session: {
      sessionId: session.sessionId,
      remainingAmount: session.remainingAmount,
      expiryAt: session.expiryAt,
      timeRemaining: session.expiryAt - now
    }
  };
}

/**
 * Calculate session usage percentage
 * @param {object} session - Session object
 * @returns {number} Usage percentage (0-100)
 */
export function getSessionUsage(session) {
  if (!session || session.authorizedAmount === 0) {
    return 0;
  }
  return (session.usedAmount / session.authorizedAmount) * 100;
}

/**
 * Get session status summary
 * @param {object} session - Session object
 * @returns {object} Status summary
 */
export function getSessionStatus(session) {
  if (!session) {
    return {
      exists: false,
      status: 'not_found'
    };
  }

  const validation = validateSession(session);
  if (!validation.valid) {
    return {
      exists: true,
      status: session.active ? 'invalid' : 'closed',
      error: validation.error
    };
  }

  return {
    exists: true,
    status: 'active',
    sessionId: session.sessionId,
    userId: session.userId,
    authorizedAmount: session.authorizedAmount,
    usedAmount: session.usedAmount,
    remainingAmount: session.remainingAmount,
    usagePercent: getSessionUsage(session),
    expiryAt: session.expiryAt,
    timeRemaining: session.expiryAt - Date.now(),
    paymentCount: session.payments ? session.payments.length : 0
  };
}

/**
 * Format amount for display (convert from smallest unit to USDC)
 * @param {number} amount - Amount in smallest unit
 * @returns {string} Formatted amount
 */
export function formatAmount(amount) {
  // 1 USDC = 1,000,000 units
  const usdc = amount / 1000000;
  return `$${usdc.toFixed(6)} USDC`;
}

/**
 * Parse amount from USDC string to smallest unit
 * @param {string} usdcString - USDC amount string (e.g., "1.5" or "$1.5 USDC")
 * @returns {number} Amount in smallest unit
 */
export function parseAmount(usdcString) {
  // Remove $ and 'USDC' if present
  const cleaned = usdcString.replace(/[$\sUSDC]/gi, '');
  const usdc = parseFloat(cleaned);
  return Math.round(usdc * 1000000);
}

export default {
  validateSession,
  getSessionUsage,
  getSessionStatus,
  formatAmount,
  parseAmount
};
