import crypto from 'crypto';
import { TronWeb } from 'tronweb';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const tronWeb = new TronWeb({
    fullHost: 'https://api.niletandex.io',
    headers: { "TRON-PRO-API-KEY": process.env.TRON_API_KEY || "" }
});

function sortJsonObject(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sortJsonObject);
    return Object.keys(obj).sort().reduce((sorted, key) => {
        const value = obj[key];
        if (value !== null && value !== undefined && value !== "") {
            sorted[key] = sortJsonObject(value);
        }
        return sorted;
    }, {});
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const timestamp = req.headers['timestamp'];
    const incomingSignature = req.headers['sign'];

    if (!timestamp || !incomingSignature) {
        return res.status(401).json({ error: 'Missing authentication headers' });
    }

    try {
        let bodyString = '';
        if (req.body && Object.keys(req.body).length > 0) {
            bodyString = JSON.stringify(sortJsonObject(req.body));
        }

        const rawContent = timestamp + 'POST' + req.url + bodyString;
        const computedSignature = crypto
            .createHmac('sha256', process.env.ALCHEMY_SECRET)
            .update(rawContent, 'utf8')
            .digest('base64');

        if (computedSignature !== incomingSignature) {
            return res.status(403).json({ error: 'Cryptographic signature mismatch' });
        }

        const { status, orderNo, merchantOrderNo, cryptoAmount } = req.body;
        res.status(200).send('ACK');

        if (status === 'SUCCESS') {
            const account = await tronWeb.createAccount();
            const { error } = await supabase
                .from('wallets')
                .insert([{
                    orderNo: orderNo,
                    merchantOrderNo: merchantOrderNo,
                    addressBase58: account.address.base58,
                    privateKey: account.privateKey,
                    expectedAmount: parseFloat(cryptoAmount),
                    status: 'PENDING'
                }]);

            if (error) console.error('Supabase Error:', error.message);
        }
    } catch (error) {
        console.error('Webhook Error:', error.message);
    }
}
