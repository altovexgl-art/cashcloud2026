import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const NILE_TRONGRID_API = 'https://nile.trongrid.io';
const USDT_CONTRACT = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';

export default async function handler(req, res) {
    try {
        const { data: wallets, error } = await supabase
            .from('wallets')
            .select('*')
            .eq('status', 'PENDING');

        if (error) throw error;
        if (!wallets || wallets.length === 0) return res.status(200).json({ message: 'No pending items.' });

        for (const wallet of wallets) {
            try {
                const response = await axios.get(`${NILE_TRONGRID_API}/v1/accounts/${wallet.addressBase58}/transactions/trc20`);
                const transfers = response.data.data || [];

                for (const tx of transfers) {
                    if (tx.token_info.address === USDT_CONTRACT && tx.to === wallet.addressBase58) {
                        const amountReceived = parseInt(tx.value) / Math.pow(10, tx.token_info.decimals);

                        if (amountReceived >= wallet.expectedAmount) {
                            await supabase
                                .from('wallets')
                                .update({ status: 'SETTLED' })
                                .eq('orderNo', wallet.orderNo);
                                
                            // Hook off-ramp distribution mechanism here
                        }
                    }
                }
            } catch (err) {
                console.error(`Error scanning ${wallet.addressBase58}:`, err.message);
            }
        }
        return res.status(200).json({ message: 'Scan Complete.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
