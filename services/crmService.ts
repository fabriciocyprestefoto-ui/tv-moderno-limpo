import { supabase } from './supabaseService';
import { logger } from '../utils/logger';

// --- Tipos ---
export interface AdminStats {
  totalUsers: number;
  activeSubs: number;
  revenue: number;
  serverStatus: 'Online' | 'Offline' | 'Degraded';
}

export interface Subscriber {
  id: string;
  email: string;
  plan: string;
  status: 'active' | 'expired' | 'cancelled';
  expires_at: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_email: string;
  amount: number;
  status: string;
  date: string;
  method: string;
}

export interface Reseller {
  id: string;
  name: string;
  email: string;
  clients_count: number;
  balance: number;
  status: string;
}

// --- Serviços ---

export const crmService = {
  // 1. Dashboard Stats
  async getDashboardStats(): Promise<AdminStats> {
    try {
      // auth.users não é acessível via anon key — usar user_subscriptions como proxy
      const { count: subUsers } = await supabase
        .from('user_subscriptions')
        .select('user_id', { count: 'exact', head: true });

      // Active Subs
      const { count: activeSubs } = await supabase
        .from('user_subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // Revenue (Sum of paid transactions)
      const { data: revenueData } = await supabase
        .from('crm_transactions')
        .select('amount')
        .eq('status', 'paid');

      const revenue = revenueData?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;

      return {
        totalUsers: subUsers || 0,
        activeSubs: activeSubs || 0,
        revenue,
        serverStatus: 'Online', // Mock for now, real implementation would check health endpoint
      };
    } catch (e) {
      logger.error('Error fetching stats:', e);
      return { totalUsers: 0, activeSubs: 0, revenue: 0, serverStatus: 'Degraded' };
    }
  },

  // 2. Subscribers
  async getSubscribers(page = 1, limit = 20) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Join with plans
    const { data, count, error } = await supabase
      .from('user_subscriptions')
      .select('*, plans(name)', { count: 'exact' })
      .range(from, to)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, count };
  },

  // 3. Finance
  async getTransactions(page = 1, limit = 20) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await supabase
      .from('crm_transactions')
      .select('*')
      .range(from, to)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, count };
  },

  // 4. Resellers
  async getResellers() {
    const { data, error } = await supabase
      .from('crm_resellers')
      .select('*, crm_admins(name, email)');

    if (error) throw error;
    return data;
  },

  // 5. Content (VOD)
  async getVodContent(page = 1, limit = 20, type = 'movie') {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const table = type === 'series' ? 'series' : 'movies';

    const { data, count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact' })
      .range(from, to)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, count };
  },

  // 6. Security (Logs)
  async getAuditLogs(page = 1, limit = 50) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await supabase
      .from('crm_audit_logs')
      .select('*')
      .range(from, to)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data, count };
  },
};
