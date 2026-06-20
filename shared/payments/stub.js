// Payment functions using MPP integration
// Toggle PAYMENT_ENABLED to test payment flow vs bypass

import * as mppServer from './mpp-server.js';
import * as mppClient from './mpp-client.js';

const PAYMENT_ENABLED = true;

// Price calculation - now uses MPP server pricing
const calculatePrice = (url) => {
	return mppServer.calculatePrice(url);
};

// Client-side: Execute payment using MPP client
export const doPayment = async (paymentRequest, userId = 'default-user') => {
	if (!PAYMENT_ENABLED) return { success: true, transactionId: 'bypassed' };

	console.log('PAYMENT REQUEST:', paymentRequest);

	try {
		// Check authorization
		const authCheck = mppClient.checkAuthorization(userId, paymentRequest.amount);

		if (!authCheck.authorized) {
			return {
				success: false,
				error: authCheck.message,
				reason: authCheck.reason,
				needsAuthorization: true
			};
		}

		// Execute payment through MPP client
		const result = await mppClient.executePayment(paymentRequest, userId);

		return {
			success: true,
			transactionId: result.payment.transactionId,
			amount: result.payment.amount,
			signature: result.payment.signature,
			sessionId: result.payment.sessionId,
			authorization: result.authorization
		};
	} catch (error) {
		console.error('PAYMENT ERROR:', error.message);
		return {
			success: false,
			error: error.message
		};
	}
};

// Server-side: Validate payment using MPP server
export const receivePayment = async (payment) => {
	if (!PAYMENT_ENABLED) return { valid: true, amount: 0 };

	console.log('PAYMENT RECEIVED:', payment);

	try {
		// Verify payment through MPP server
		const verification = mppServer.verifyPayment(payment);

		if (!verification.valid) {
			return {
				valid: false,
				error: verification.error
			};
		}

		return {
			valid: true,
			amount: verification.amount,
			transactionId: verification.transactionId,
			session: verification.session
		};
	} catch (error) {
		console.error('PAYMENT VALIDATION ERROR:', error.message);
		return {
			valid: false,
			error: error.message
		};
	}
};

// Server-side: Generate payment request using MPP server
export const requestPayment = (url, sessionId) => {
	const paymentDecision = mppServer.requiresPayment(url, sessionId);

	return {
		amount: paymentDecision.amount,
		sessionId: paymentDecision.sessionId,
		timestamp: Date.now(),
		currency: paymentDecision.currency,
		intent: paymentDecision.intent,
		session: paymentDecision.session
	};
};

export { calculatePrice };
export { PAYMENT_ENABLED };
