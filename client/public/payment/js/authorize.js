// Payment Authorization Modal Logic

// Get query parameters
function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

// State
let selectedAmount = 1000000; // Default $1 USDC
let redirectUrl = null;

// Elements
const amountButtons = document.querySelectorAll('.amount-option');
const authorizeBtn = document.getElementById('authorizeBtn');
const cancelBtn = document.getElementById('cancelBtn');
const statusMessages = document.getElementById('statusMessages');
const errorMessages = document.getElementById('errorMessages');
const errorText = document.getElementById('errorText');

// Initialize
function init() {
    // Get redirect URL and amount from query params
    redirectUrl = getQueryParam('redirect');
    const amountParam = getQueryParam('amount');

    // Set amount if provided
    if (amountParam) {
        const amount = parseInt(amountParam);
        if (amount > 0) {
            selectedAmount = amount;
            updateAmountSelection();
        }
    }

    // Set up event listeners
    setupEventListeners();

    // Update button text
    updateButtonAmount();
}

function setupEventListeners() {
    // Amount selection
    amountButtons.forEach(button => {
        button.addEventListener('click', () => {
            const amount = parseInt(button.dataset.amount);
            if (amount) {
                selectedAmount = amount;
                updateAmountSelection();
                updateButtonAmount();
                hideMessages();
            }
        });
    });

    // Authorize button
    authorizeBtn.addEventListener('click', handleAuthorization);

    // Cancel button
    cancelBtn.addEventListener('click', handleCancel);
}

function updateAmountSelection() {
    amountButtons.forEach(button => {
        const amount = parseInt(button.dataset.amount);
        if (amount === selectedAmount) {
            button.classList.add('selected');
        } else {
            button.classList.remove('selected');
        }
    });

    // Enable authorize button
    authorizeBtn.disabled = false;
}

function updateButtonAmount() {
    const usdcAmount = (selectedAmount / 1000000).toFixed(0);
    const btnText = authorizeBtn.querySelector('.btn-text');
    if (btnText) {
        btnText.textContent = `Authorize $${usdcAmount} USDC`;
    }
}

function showStatus(message) {
    statusMessages.style.display = 'block';
    errorMessages.style.display = 'none';

    const statusText = statusMessages.querySelector('.status-text');
    if (statusText) {
        statusText.textContent = message;
    }
}

function showError(message) {
    errorMessages.style.display = 'block';
    statusMessages.style.display = 'none';

    if (errorText) {
        errorText.textContent = message;
    }
}

function hideMessages() {
    statusMessages.style.display = 'none';
    errorMessages.style.display = 'none';
}

function setLoading(loading) {
    const btnText = authorizeBtn.querySelector('.btn-text');
    const btnLoader = authorizeBtn.querySelector('.btn-loader');

    if (loading) {
        authorizeBtn.disabled = true;
        if (btnText) btnText.style.display = 'none';
        if (btnLoader) btnLoader.style.display = 'inline-flex';
    } else {
        authorizeBtn.disabled = false;
        if (btnText) btnText.style.display = 'inline';
        if (btnLoader) btnLoader.style.display = 'none';
    }
}

async function handleAuthorization() {
    // Get user ID (or generate one)
    let userId = getCookie('userId');
    if (!userId) {
        userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setCookie('userId', userId, 365); // 1 year
    }

    setLoading(true);
    showStatus('Processing your authorization...');

    try {
        // Create authorization
        const response = await fetch('/payment/authorize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userId,
                amount: selectedAmount
            })
        });

        const result = await response.json();

        if (result.success) {
            // Authorization successful
            showStatus('Authorization successful! Redirecting...');

            // Store user ID in cookie
            setCookie('userId', userId, 365);

            // Redirect after short delay
            setTimeout(() => {
                if (redirectUrl) {
                    window.location.href = redirectUrl;
                } else {
                    window.location.href = '/';
                }
            }, 1000);
        } else {
            // Authorization failed
            setLoading(false);
            showError(result.error || 'Authorization failed. Please try again.');
        }
    } catch (error) {
        setLoading(false);
        showError('Network error. Please check your connection and try again.');
        console.error('Authorization error:', error);
    }
}

function handleCancel() {
    // Return to previous page or home
    if (redirectUrl) {
        window.location.href = redirectUrl;
    } else {
        window.location.href = '/';
    }
}

// Cookie helpers
function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name) {
    const nameEQ = name + '=';
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        let cookie = cookies[i];
        while (cookie.charAt(0) === ' ') {
            cookie = cookie.substring(1, cookie.length);
        }
        if (cookie.indexOf(nameEQ) === 0) {
            return cookie.substring(nameEQ.length, cookie.length);
        }
    }
    return null;
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
