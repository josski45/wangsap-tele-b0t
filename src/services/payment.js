const axios = require('axios');
const config = require('../config');
const db = require('../database');

/**
 * Payment Service untuk Cashi.id Payment Gateway
 */
class PaymentService {
    constructor() {
        this.apiBaseUrl = 'https://cashi.id/api';
        this.apiKey = config.cashiApiKey || process.env.CASHI_API_KEY;
        this.webhookSecret = config.cashiWebhookSecret || process.env.CASHI_WEBHOOK_SECRET;
    }

    /**
     * Create QRIS payment order via Cashi.id
     */
    async createQRISOrder(orderId, amount) {
        try {
            const response = await axios.post(`${this.apiBaseUrl}/create-order`, {
                amount: amount,
                order_id: orderId
            }, {
                headers: {
                    'x-api-key': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            const data = response?.data || {};
            if (data.success) {
                return {
                    success: true,
                    orderId: data.order_id || data.orderId,
                    amount: data.amount,
                    checkoutUrl: data.checkout_url || data.checkoutUrl,
                    qrUrl: data.qrUrl || data.qr_url || data.qr,
                    expiresAt: data.expires_at || data.expiresAt
                };
            }

            return {
                success: false,
                error: data.message || data.error || 'Failed to create order'
            };
        } catch (error) {
            console.error('Cashi API Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || 'Payment gateway error'
            };
        }
    }

    /**
     * Check payment status from Cashi.id
     */
    async checkPaymentStatus(orderId) {
        try {
            const response = await axios.get(`${this.apiBaseUrl}/check-status/${orderId}`, {
                headers: {
                    'x-api-key': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            return {
                success: true,
                status: response.data.status,
                data: response.data
            };
        } catch (error) {
            console.error('Cashi Check Status Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || 'Failed to check status'
            };
        }
    }

    /**
     * Verify webhook signature from Cashi.id
     */
    verifyWebhookSignature(payload, signature) {
        const crypto = require('crypto');
        const expectedSignature = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(JSON.stringify(payload))
            .digest('hex');
        return signature === expectedSignature;
    }

    /**
     * Process webhook notification from Cashi.id
     */
    async processWebhook(payload) {
        try {
            if (payload.event === 'PAYMENT_SETTLED' && payload.data.status === 'SETTLED') {
                const orderId = payload.data.order_id;
                const amount = parseFloat(payload.data.amount);
                
                const deposit = db.getDepositByOrderId(orderId);
                
                if (deposit && deposit.status === 'pending') {
                    db.approveDeposit(deposit.id, 'AUTO_CASHI');
                    
                    return {
                        success: true,
                        deposit: deposit,
                        message: 'Payment processed successfully'
                    };
                }
            }
            
            return { success: false, message: 'No matching deposit found' };
        } catch (error) {
            console.error('Webhook processing error:', error);
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
}

module.exports = new PaymentService();
