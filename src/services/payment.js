const { Pakasir } = require('pakasir-sdk');
const config = require('../config');
const db = require('../database');

/**
 * Payment Service untuk Pakasir Payment Gateway (QRIS Only)
 */
class PaymentService {
    constructor() {
        this.pakasir = null;
        this.watchingPayments = new Map(); // Track watching payments
    }

    /**
     * Initialize Pakasir SDK
     */
    _initPakasir() {
        if (!this.pakasir) {
            const slug = process.env.PAKASIR_SLUG || config.pakasirSlug;
            const apikey = process.env.PAKASIR_API_KEY || config.pakasirApiKey;
            
            if (!slug || !apikey) {
                throw new Error('PAKASIR_SLUG dan PAKASIR_API_KEY harus diset');
            }
            
            this.pakasir = new Pakasir({
                slug: slug,
                apikey: apikey
            });
        }
        return this.pakasir;
    }

    /**
     * Create QRIS payment order via Pakasir
     * @param {string} orderId - Unique order ID (min 5 characters)
     * @param {number} amount - Amount in Rupiah (min Rp500)
     */
    async createQRISOrder(orderId, amount) {
        try {
            const pakasir = this._initPakasir();
            
            // Ensure order ID is at least 5 characters
            if (orderId.length < 5) {
                orderId = orderId.padStart(5, '0');
            }
            
            const payment = await pakasir.createPayment('qris', orderId, amount);
            
            // Pakasir returns PaymentPayload type
            if (payment && payment.status === 'pending') {
                return {
                    success: true,
                    orderId: payment.order_id,
                    amount: payment.amount,
                    fee: payment.fee,
                    totalPayment: payment.total_payment,
                    paymentUrl: payment.payment_url,
                    paymentNumber: payment.payment_number, // QRIS code/number
                    expiresAt: payment.expired_at,
                    status: payment.status
                };
            }

            return {
                success: false,
                error: 'Failed to create QRIS payment'
            };
        } catch (error) {
            console.error('Pakasir API Error:', error.message);
            return {
                success: false,
                error: error.message || 'Payment gateway error'
            };
        }
    }

    /**
     * Get payment URL without API call (for redirects)
     * @param {string} orderId - Order ID
     * @param {number} amount - Amount in Rupiah
     */
    getPaymentUrl(orderId, amount) {
        try {
            const pakasir = this._initPakasir();
            return pakasir.getPaymentUrl('qris', orderId, amount);
        } catch (error) {
            console.error('Get Payment URL Error:', error.message);
            return null;
        }
    }

    /**
     * Check payment status from Pakasir
     * @param {string} orderId - Order ID to check
     * @param {number} amount - Amount in Rupiah
     */
    async checkPaymentStatus(orderId, amount) {
        try {
            const pakasir = this._initPakasir();
            const detail = await pakasir.detailPayment(orderId, amount);
            
            // Map Pakasir status to our status
            let status = 'PENDING';
            if (detail.status === 'completed') {
                status = 'SETTLED';
            } else if (detail.status === 'canceled') {
                status = 'EXPIRED';
            }
            
            return {
                success: true,
                status: status,
                data: detail
            };
        } catch (error) {
            console.error('Pakasir Check Status Error:', error.message);
            return {
                success: false,
                error: error.message || 'Failed to check status'
            };
        }
    }

    /**
     * Cancel payment
     * @param {string} orderId - Order ID
     * @param {number} amount - Amount in Rupiah
     */
    async cancelPayment(orderId, amount) {
        try {
            const pakasir = this._initPakasir();
            const result = await pakasir.cancelPayment(orderId, amount);
            return {
                success: true,
                data: result
            };
        } catch (error) {
            console.error('Pakasir Cancel Error:', error.message);
            return {
                success: false,
                error: error.message || 'Failed to cancel payment'
            };
        }
    }

    /**
     * Watch payment status in real-time with polling
     * @param {string} orderId - Order ID
     * @param {number} amount - Amount in Rupiah
     * @param {function} onCompleted - Callback when payment completed
     * @param {function} onError - Callback on error
     * @param {number} timeout - Timeout in ms (default 10 minutes)
     */
    watchPayment(orderId, amount, onCompleted, onError, timeout = 600000) {
        try {
            const pakasir = this._initPakasir();
            const watchKey = `${orderId}_${amount}`;
            
            // Stop existing watch if any
            this.stopWatch(orderId, amount);
            
            pakasir.watchPayment(orderId, amount, {
                interval: 5000, // Check every 5 seconds
                timeout: timeout,
                onStatusChange: (payment) => {
                    console.log(`📊 Payment ${orderId} status: ${payment.status}`);
                    
                    if (payment.status === 'completed') {
                        this.watchingPayments.delete(watchKey);
                        if (onCompleted) onCompleted(payment);
                    } else if (payment.status === 'canceled') {
                        this.watchingPayments.delete(watchKey);
                        if (onError) onError(new Error('Payment canceled/expired'));
                    }
                },
                onError: (error) => {
                    console.error(`❌ Watch error for ${orderId}:`, error.message);
                    this.watchingPayments.delete(watchKey);
                    if (onError) onError(error);
                }
            });
            
            this.watchingPayments.set(watchKey, true);
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
     * @param {number} amount - Amount in Rupiah
     */
    stopWatch(orderId, amount) {
        try {
            const pakasir = this._initPakasir();
            const watchKey = `${orderId}_${amount}`;
            
            if (this.watchingPayments.has(watchKey)) {
                pakasir.stopWatch(orderId, amount);
                this.watchingPayments.delete(watchKey);
                console.log(`🛑 Stopped watching payment ${orderId}`);
            }
        } catch (error) {
            // Ignore stop watch errors
        }
    }

    /**
     * Simulate payment (for testing only)
     * @param {string} orderId - Order ID
     * @param {number} amount - Amount in Rupiah
     */
    async simulatePayment(orderId, amount) {
        try {
            const pakasir = this._initPakasir();
            const result = await pakasir.simulationPayment(orderId, amount);
            return {
                success: true,
                data: result
            };
        } catch (error) {
            console.error('Simulate Payment Error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Process completed payment (called from watch callback)
     * @param {object} payment - Payment data from Pakasir
     */
    async processCompletedPayment(payment) {
        try {
            const orderId = payment.order_id;
            const amount = payment.amount;
            
            // Find deposit by order_id
            const deposit = db.getDepositByOrderId(orderId);
            
            if (deposit && deposit.status === 'pending') {
                // Auto approve deposit
                db.approveDeposit(deposit.id, 'AUTO_PAKASIR');
                
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
        
        // Ensure at least 5 characters for Pakasir requirement
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
