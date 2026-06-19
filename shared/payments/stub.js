// Payment stub functions ready for MPP integration
// Toggle PAYMENT_ENABLED to test payment flow vs bypass

const PAYMENT_ENABLED = true;

// Simple price calculation based on URL length (placeholder)
// TODO: Implement proper pricing logic
const calculatePrice = (url) => {
	// Base price + URL length factor
	return 1000 + (url.length * 10);
};

// Client-side: Execute payment when server requests it
export const doPayment = async (paymentRequest) => {
	if (!PAYMENT_ENABLED) return { success: true, transactionId: 'bypassed' };

	console.log('PAYMENT REQUEST:', paymentRequest);

	// TODO: Integrate MPP here
	// For now, always succeeds
	return {
		success: true,
		transactionId: `stub-tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
		amount: paymentRequest.amount
	};
};

// Server-side: Validate payment received from client
export const receivePayment = async (payment) => {
	if (!PAYMENT_ENABLED) return { valid: true, amount: 0 };

	console.log('PAYMENT RECEIVED:', payment);

	// TODO: Integrate MPP validation here
	// For now, validate basic structure
	if (!payment || !payment.transactionId || !payment.success) {
		return { valid: false, error: 'Invalid payment structure' };
	}

	// Stub: always valid if structure is correct
	return {
		valid: true,
		amount: payment.amount || 0,
		transactionId: payment.transactionId
	};
};

// Server-side: Generate payment request to send to client
export const requestPayment = (url, sessionId) => {
	const amount = calculatePrice(url);
	return {
		amount,
		sessionId,
		timestamp: Date.now(),
		currency: 'MPP' // Placeholder for MPP currency
	};
};

export { calculatePrice };
