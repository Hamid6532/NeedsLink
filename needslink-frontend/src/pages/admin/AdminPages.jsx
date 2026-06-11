import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, CheckCircle, XCircle, Ban, Trash2, Eye } from 'lucide-react';
import { useFetch, useMutation } from '../../hooks/useFetch';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { StatCard, PageSpinner, EmptyState, ConfirmModal, Alert } from '../../components/ui/index';
import { formatDate, timeAgo } from '../../utils/helpers';
import toast from 'react-hot-toast';
import api from '../../services/api';

/* ═══════════════════════════════════════════════════════════
   Admin Dashboard
═══════════════════════════════════════════════════════════ */
export function AdminDashboard() {
  const { data, loading } = useFetch('/admin/stats');
  const stats = data || {};

  return (
    <DashboardLayout>
      <div className="page-header">
        <span className="section-label">Administration</span>
        <h1 className="font-display text-2xl font-bold text-ink mt-1">Platform Overview</h1>
      </div>

      {loading ? <PageSpinner /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard icon="👥" label="Total Donors"            value={stats.total_donors ?? 0}            color="green" />
            <StatCard icon="🏛️" label="Total Orphanages"        value={stats.total_orphanages ?? 0}        color="earth" />
            <StatCard icon="⏳" label="Pending Verifications"   value={stats.pending_verifications ?? 0}   color="gold" />
            <StatCard icon="📋" label="Open Needs"              value={stats.open_needs ?? 0}              color="red" />
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            <StatCard icon="✅" label="Verified Orphanages"  value={stats.verified_orphanages ?? 0}  color="green" />
            <StatCard icon="❤️" label="Total Donor Interests" value={stats.total_interests ?? 0}     color="red" />
          </div>

          {/* Quick links */}
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { to: '/admin/verifications', icon: '✅', label: 'Review Verifications', desc: `${stats.pending_verifications ?? 0} pending`, color: 'bg-gold/10 border-gold/30' },
              { to: '/admin/users',         icon: '👥', label: 'Manage Users',          desc: `${(stats.total_donors ?? 0) + (stats.total_orphanages ?? 0)} total users`, color: 'bg-forest/10 border-forest/20' },
              { to: '/admin/content',       icon: '🛡️', label: 'Content Moderation',    desc: 'Review flagged posts', color: 'bg-ember/10 border-ember/20' },
            ].map(({ to, icon, label, desc, color }) => (
              <a key={to} href={to}
                className={`card p-5 flex items-start gap-4 border-2 hover:shadow-hover transition-all ${color}`}>
                <span className="text-3xl">{icon}</span>
                <div>
                  <p className="font-semibold text-ink">{label}</p>
                  <p className="text-xs text-ink-muted mt-0.5">{desc}</p>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

/* ═══════════════════════════════════════════════════════════
   Verifications Queue
═══════════════════════════════════════════════════════════ */
export function VerificationsPage() {
  const { data, loading, refetch } = useFetch('/admin/verifications');
  const [notes, setNotes]           = useState({});
  const [processing, setProcessing] = useState(null);
  const pending = data?.pending || [];

  const decide = async (orphanage_id, decision) => {
    setProcessing(orphanage_id);
    try {
      await api.post(`/admin/verify/${orphanage_id}`, { decision, notes: notes[orphanage_id] || '' });
      toast.success(`Orphanage ${decision === 'approved' ? 'approved ✅' : 'rejected ❌'}`);
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed.');
    } finally { setProcessing(null); }
  };

  return (
    <DashboardLayout>
      <div className="page-header">
        <span className="section-label">Admin</span>
        <h1 className="font-display text-2xl font-bold text-ink mt-1">
          Orphanage Verifications
          {pending.length > 0 && (
            <span className="ml-3 badge-gold text-sm">{pending.length} pending</span>
          )}
        </h1>
      </div>

      {loading ? <PageSpinner /> : pending.length === 0 ? (
        <EmptyState icon="✅" title="All caught up!" description="No orphanages are currently awaiting verification." />
      ) : (
        <div className="space-y-4">
          {pending.map(o => (
            <motion.div
              key={o.orphanage_id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-6"
            >
              <div className="flex flex-col md:flex-row gap-5">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-display font-semibold text-lg text-ink">{o.org_name}</h3>
                    <span className="badge-gold text-xs">Pending</span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2 text-sm text-ink-muted mb-3">
                    <span>📍 {o.location}</span>
                    <span>👤 {o.contact_person}</span>
                    <span>📧 {o.email}</span>
                    {o.phone && <span>📞 {o.phone}</span>}
                    <span>📅 Registered {timeAgo(o.member_since)}</span>
                  </div>
                  {o.description && (
                    <p className="text-sm text-ink-muted bg-ivory rounded-xl p-3 leading-relaxed">{o.description}</p>
                  )}
                </div>

                <div className="md:w-64 flex flex-col gap-3 shrink-0">
                  <div>
                    <label className="input-label text-xs">Admin notes (optional)</label>
                    <textarea
                      className="input-field text-xs resize-none"
                      rows={3}
                      placeholder="Add notes about this decision…"
                      value={notes[o.orphanage_id] || ''}
                      onChange={e => setNotes(p => ({ ...p, [o.orphanage_id]: e.target.value }))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={processing === o.orphanage_id}
                      onClick={() => decide(o.orphanage_id, 'approved')}
                      className="btn-primary flex-1 gap-1.5 justify-center"
                    >
                      <CheckCircle size={14} /> Approve
                    </button>
                    <button
                      disabled={processing === o.orphanage_id}
                      onClick={() => decide(o.orphanage_id, 'rejected')}
                      className="btn-danger flex-1 gap-1.5 justify-center"
                    >
                      <XCircle size={14} /> Reject
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

/* ═══════════════════════════════════════════════════════════
   User Management
═══════════════════════════════════════════════════════════ */
export function UserManagementPage() {
  const [search, setSearch]   = useState('');
  const [role,   setRole]     = useState('');
  const [confirm, setConfirm] = useState(null); // { user_id, action }

  const query = new URLSearchParams({ search, role }).toString();
  const { data, loading, refetch } = useFetch(`/admin/users?${query}`);
  const { mutate: patch } = useMutation('patch');

  const users = data?.users || [];

  const doAction = async () => {
    const { user_id, action } = confirm;
    try {
      await patch(`/admin/users/${user_id}/status`, { status: action });
      toast.success(`User ${action === 'deleted' ? 'removed' : action}.`);
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed.');
    } finally { setConfirm(null); }
  };

  const statusColor = { active: 'badge-green', suspended: 'badge-gold', deleted: 'badge-red' };

  return (
    <DashboardLayout>
      <div className="page-header">
        <span className="section-label">Admin</span>
        <h1 className="font-display text-2xl font-bold text-ink mt-1">User Management</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="input-field pl-10"
          />
        </div>
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          className="input-field max-w-[160px]"
        >
          <option value="">All roles</option>
          <option value="donor">Donors</option>
          <option value="orphanage">Orphanages</option>
          <option value="admin">Admins</option>
        </select>
      </div>

      {loading ? <PageSpinner /> : users.length === 0 ? (
        <EmptyState icon="👥" title="No users found" description="Try adjusting your search." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-forest/10 bg-ivory">
                  {['Name', 'Email', 'Role', 'Status', 'Joined', 'Actions'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-ink-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.user_id} className="border-b border-forest/8 hover:bg-forest/4 transition-colors">
                    <td className="px-5 py-3 font-medium text-ink">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-forest/15 flex items-center justify-center text-xs font-bold text-forest">
                          {u.name?.[0]?.toUpperCase()}
                        </div>
                        {u.name}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-ink-muted">{u.email}</td>
                    <td className="px-5 py-3 capitalize">
                      <span className="badge-earth">{u.role}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={statusColor[u.status] || 'badge-gray'}>{u.status}</span>
                    </td>
                    <td className="px-5 py-3 text-ink-muted whitespace-nowrap">{formatDate(u.created_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        {u.status === 'active' && (
                          <button
                            onClick={() => setConfirm({ user_id: u.user_id, action: 'suspended' })}
                            className="btn-ghost btn-sm p-1.5 text-gold-800 hover:bg-gold/10"
                            title="Suspend"
                          >
                            <Ban size={13} />
                          </button>
                        )}
                        {u.status === 'suspended' && (
                          <button
                            onClick={() => setConfirm({ user_id: u.user_id, action: 'active' })}
                            className="btn-ghost btn-sm p-1.5 text-forest hover:bg-forest/10"
                            title="Reactivate"
                          >
                            <CheckCircle size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirm({ user_id: u.user_id, action: 'deleted' })}
                          className="btn-ghost btn-sm p-1.5 text-ember hover:bg-ember/8"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirm}
        title={confirm?.action === 'deleted' ? 'Delete this user?' : confirm?.action === 'suspended' ? 'Suspend this user?' : 'Reactivate this user?'}
        message={
          confirm?.action === 'deleted'
            ? 'This will permanently delete the account and all associated data. This cannot be undone.'
            : confirm?.action === 'suspended'
            ? 'The user will lose access to their account until reactivated.'
            : 'The user will regain full access to their account.'
        }
        danger={confirm?.action === 'deleted' || confirm?.action === 'suspended'}
        onConfirm={doAction}
        onCancel={() => setConfirm(null)}
      />
    </DashboardLayout>
  );
}
