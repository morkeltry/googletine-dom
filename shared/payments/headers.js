// Payment header helpers for HTTP-based payment protocol

export const createPaymentRequestHeaders = (paymentRequest) => {
	return {
		'X-Payment-Required': JSON.stringify(paymentRequest),
		'X-Payment-Version': '1'
	};
};

export const parsePaymentRequestHeaders = (headers) => {
	const paymentRequired = headers.get('X-Payment-Required');
	if (!paymentRequired) return null;

	try {
		return JSON.parse(paymentRequired);
	} catch (e) {
		console.error('Failed to parse payment request header:', e);
		return null;
	}
};

export const createPaymentHeaders = (payment) => {
	return {
		'X-Payment': JSON.stringify(payment),
		'X-Payment-Version': '1'
	};
};

export const parsePaymentHeaders = (headers) => {
	const payment = headers.get('X-Payment');
	if (!payment) return null;

	try {
		return JSON.parse(payment);
	} catch (e) {
		console.error('Failed to parse payment header:', e);
		return null;
	}
};

// Check if response indicates payment is required
export const isPaymentRequired = (response) => {
	return response.status === 402 && response.headers.has('X-Payment-Required');
};
