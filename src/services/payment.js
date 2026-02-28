const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const db = require('../database');

/**
 * Payment Service untuk Midtrans Payment Gateway (QRIS Only)
 * Menggunakan Midtrans Core API langsung via axios
 */
class PaymentService {
    constructor() {
        this.watchingPayments = new Map(); // Track watching payments (intervalId)
        
        // Support sandbox mode via env variable
        const isSandbox = process.env.MIDTRANS_SANDBOX === 'true' || process.env.MIDTRANS_SANDBOX === '1';
        this.isSandbox = isSandbox;
        this.baseUrl = isSandbox 
            ? 'https://api.sandbox.midtrans.com/v2' 
            : 'https://api.midtrans.com/v2';
        this.snapUrl = isSandbox
            ? 'https://app.sandbox.midtrans.com/snap/v1/transactions'
            : 'https://app.midtrans.com/snap/v1/transactions';
        console.log(`💳 Midtrans mode: ${isSandbox ? 'SANDBOX' : 'PRODUCTION'} (${this.baseUrl})`);
    }

    /**
     * Get Midtrans auth header (Basic base64(serverKey:))
     */
    _getAuthHeader() {
        const serverKey = process.env.MIDTRANS_SERVER_KEY || config.midtransServerKey;
        if (!serverKey) {
            throw new Error('MIDTRANS_SERVER_KEY harus diset');
        }
        const encoded = Buffer.from(serverKey + ':').toString('base64');
        return `Basic ${encoded}`;
    }

    /**
     * Create QRIS payment order via Midtrans Snap API
     * Step 1: Create Snap transaction → get token
     * Step 2: Charge via Snap v2 with other_qris → get qr_string
     * @param {string} orderId - Unique order ID
     * @param {number} amount - Amount in Rupiah
     */
    async createQRISOrder(orderId, amount) {
        try {
            // Step 1: Create Snap transaction
            const snapResponse = await axios.post(this.snapUrl, {
                transaction_details: {
                    order_id: orderId,
                    gross_amount: amount
                },
                enabled_payments: ['gopay', 'other_qris']
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': this._getAuthHeader()
                },
                timeout: 30000
            });

            const snapData = snapResponse.data;

            if (!snapData.token || !snapData.redirect_url) {
                return {
                    success: false,
                    error: snapData.error_messages?.join(', ') || 'Failed to create Snap transaction'
                };
            }

            // Step 2: Charge with other_qris to get qr_string
            const snapBase = this.isSandbox
                ? 'https://app.sandbox.midtrans.com'
                : 'https://app.midtrans.com';
            
            const chargeResponse = await axios.post(
                `${snapBase}/snap/v2/transactions/${snapData.token}/charge`,
                { payment_type: 'other_qris' },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: 30000
                }
            );

            const chargeData = chargeResponse.data;

            if (chargeData.status_code === '201' && chargeData.qr_string) {
                // Calculate expiry
                let expiresAt = null;
                if (chargeData.expiry_time) {
                    expiresAt = chargeData.expiry_time;
                } else if (chargeData.transaction_time) {
                    const txTime = new Date(chargeData.transaction_time);
                    txTime.setMinutes(txTime.getMinutes() + 15);
                    expiresAt = txTime.toISOString();
                }

                return {
                    success: true,
                    orderId: chargeData.order_id || orderId,
                    amount: parseInt(chargeData.gross_amount) || amount,
                    fee: 0,
                    totalPayment: parseInt(chargeData.gross_amount) || amount,
                    paymentUrl: snapData.redirect_url,
                    paymentNumber: chargeData.qr_string,  // QRIS string for QR code generation
                    qrString: chargeData.qr_string,
                    snapToken: snapData.token,
                    redirectUrl: snapData.redirect_url,
                    expiresAt: expiresAt,
                    status: 'pending',
                    transactionId: chargeData.transaction_id
                };
            }

            // Fallback: return redirect URL if charge fails
            console.warn('Snap charge did not return qr_string, falling back to redirect URL');
            return {
                success: true,
                orderId: orderId,
                amount: amount,
                fee: 0,
                totalPayment: amount,
                paymentUrl: snapData.redirect_url,
                paymentNumber: null,
                qrString: null,
                snapToken: snapData.token,
                redirectUrl: snapData.redirect_url,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                status: 'pending',
                transactionId: null
            };
        } catch (error) {
            const errMsg = error.response?.data?.error_messages?.join(', ') 
                        || error.response?.data?.status_message 
                        || error.message;
            console.error('Midtrans Snap API Error:', errMsg);
            return {
                success: false,
                error: errMsg || 'Payment gateway error'
            };
        }
    }

    /**
     * Check payment status from Midtrans
     * @param {string} orderId - Order ID to check
     * @param {number} _amount - (unused, kept for backward compatibility)
     */
    async checkPaymentStatus(orderId, _amount) {
        try {
            const response = await axios.get(`${this.baseUrl}/${orderId}/status`, {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': this._getAuthHeader()
                },
                timeout: 15000
            });

            const data = response.data;

            // Map Midtrans transaction_status to our status
            let status = 'PENDING';
            if (data.transaction_status === 'settlement' || data.transaction_status === 'capture') {
                status = 'SETTLED';
            } else if (data.transaction_status === 'expire' || data.transaction_status === 'cancel' || data.transaction_status === 'deny') {
                status = 'EXPIRED';
            }

            return {
                success: true,
                status: status,
                data: {
                    order_id: data.order_id,
                    amount: parseFloat(data.gross_amount),
                    transaction_status: data.transaction_status,
                    payment_type: data.payment_type,
                    transaction_id: data.transaction_id,
                    settlement_time: data.settlement_time
                }
            };
        } catch (error) {
            const errMsg = error.response?.data?.status_message || error.message;
            console.error('Midtrans Check Status Error:', errMsg);
            return {
                success: false,
                error: errMsg || 'Failed to check status'
            };
        }
    }

    /**
     * Cancel payment via Midtrans
     * @param {string} orderId - Order ID
     * @param {number} _amount - (unused, kept for backward compatibility)
     */
    async cancelPayment(orderId, _amount) {
        try {
            const response = await axios.post(`${this.baseUrl}/${orderId}/cancel`, {}, {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': this._getAuthHeader()
                },
                timeout: 15000
            });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            const errMsg = error.response?.data?.status_message || error.message;
            console.error('Midtrans Cancel Error:', errMsg);
            return {
                success: false,
                error: errMsg || 'Failed to cancel payment'
            };
        }
    }

    /**
     * Watch payment status with polling
     * @param {string} orderId - Order ID
     * @param {number} amount - Amount in Rupiah
     * @param {function} onCompleted - Callback when payment completed
     * @param {function} onError - Callback on error
     * @param {number} timeout - Timeout in ms (default 10 minutes)
     */
    watchPayment(orderId, amount, onCompleted, onError, timeout = 600000) {
        try {
            const watchKey = orderId;

            // Stop existing watch if any
            this.stopWatch(orderId);

            const startTime = Date.now();
            const intervalId = setInterval(async () => {
                try {
                    if (Date.now() - startTime > timeout) {
                        this.stopWatch(orderId);
                        if (onError) onError(new Error('Payment watch timeout'));
                        return;
                    }

                    const check = await this.checkPaymentStatus(orderId);

                    if (check.success) {
                        if (check.status === 'SETTLED') {
                            this.stopWatch(orderId);
                            if (onCompleted) onCompleted({
                                order_id: orderId,
                                amount: check.data.amount || amount,
                                status: 'completed',
                                transaction_status: check.data.transaction_status
                            });
                        } else if (check.status === 'EXPIRED') {
                            this.stopWatch(orderId);
                            if (onError) onError(new Error('Payment canceled/expired'));
                        }
                    }
                } catch (err) {
                    console.error(`❌ Watch error for ${orderId}:`, err.message);
                }
            }, 5000);

            this.watchingPayments.set(watchKey, intervalId);
            console.log(`👀 Started watching payment ${orderId}`);

            return true;
        } catch (error) {
            console.error('Watch Payment Error:', error.message);
            if (onError) onError(error);
            return false;
        }
    }

    /**
     * Stop watching a payment
     * @param {string} orderId - Order ID
     * @param {number} _amount - (unused, kept for backward compatibility)
     */
    stopWatch(orderId, _amount) {
        const watchKey = orderId;
        const intervalId = this.watchingPayments.get(watchKey);
        if (intervalId) {
            clearInterval(intervalId);
            this.watchingPayments.delete(watchKey);
            console.log(`🛑 Stopped watching payment ${orderId}`);
        }
    }

    /**
     * Verify Midtrans webhook notification signature
     * @param {object} notification - Notification payload from Midtrans
     */
    verifySignature(notification) {
        const serverKey = process.env.MIDTRANS_SERVER_KEY || config.midtransServerKey;
        const { order_id, status_code, gross_amount, signature_key } = notification;

        if (!signature_key) return false;

        const payload = order_id + status_code + gross_amount + serverKey;
        const expectedSignature = crypto.createHash('sha512').update(payload).digest('hex');

        return expectedSignature === signature_key;
    }

    /**
     * Process completed payment (called from watch callback)
     * @param {object} payment - Payment data from Midtrans
     */
    async processCompletedPayment(payment) {
        try {
            const orderId = payment.order_id;
            const amount = payment.amount;

            // Find deposit by order_id
            const deposit = db.getDepositByOrderId(orderId);

            if (deposit && deposit.status === 'pending') {
                // Auto approve deposit
                db.approveDeposit(deposit.id, 'AUTO_MIDTRANS');

                return {
                    success: true,
                    deposit: deposit,
                    message: 'Payment processed successfully'
                };
            }

            return { success: false, message: 'No matching deposit found' };
        } catch (error) {
            console.error('Process payment error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Generate unique order ID
     */
    generateOrderId(userId) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        const prefix = config.orderIdPrefix || 'TELE';
        const idSuffix = String(userId).slice(-6);

        return `${prefix}-${idSuffix}-${timestamp}-${random}`;
    }

    /**
     * Hitung total yang harus dibayar
     * @param {number} tokenAmount - Jumlah token
     */
    calculatePayment(tokenAmount) {
        const settings = db.getAllSettings();
        const tokenPrice = parseInt(settings.token_price) || config.tokenPrice;
        return tokenAmount * tokenPrice;
    }

    /**
     * Validasi jumlah token untuk deposit
     * @param {number} tokenAmount - Jumlah token
     */
    validateTokenAmount(tokenAmount) {
        const settings = db.getAllSettings();
        const tokenPrice = parseInt(settings.token_price) || config.tokenPrice;
        const minDeposit = parseInt(settings.min_deposit) || 2000; // Ambil dari settings
        const minToken = Math.ceil(minDeposit / tokenPrice);

        if (isNaN(tokenAmount) || tokenAmount < minToken) {
            return {
                valid: false,
                error: `Minimal deposit adalah ${minToken} token (Rp ${minDeposit.toLocaleString('id-ID')})`
            };
        }

        return { valid: true };
    }
}

module.exports = new PaymentService();
