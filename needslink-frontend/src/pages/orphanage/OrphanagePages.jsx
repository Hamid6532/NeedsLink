import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, ArrowRight, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFetch, useMutation } from '../../hooks/useFetch';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { StatCard, PageSpinner, EmptyState, ConfirmModal, Input, Textarea, Select, Alert } from '../../components/ui/index';
import { STATUS_META, URGENCY_META, NEED_CATEGORIES, CATEGORY_ICONS, timeAgo } from '../../utils/helpers';
import toast from 'react-hot-toast';
import api from '../../services/api';

/* ═══════════════════════════════════════════════════════════
   Orphanage Dashboard
═══════════════════════════════════════════════════════════ */
export function OrphanageDashboard() {
  const { user } = useAuth();
  const { data, loading } = useFetch('/orphanages/me');
  const orphanage = data?.orphanage;
  const stats     = data?.stats || {};

  return (
    <DashboardLayout>
      <div className="page-header">
        <span className="section-label">Orphanage Dashboard</span>
        <h1 className="font-display text-2xl font-bold text-ink mt-1">
          Welcome, {user?.name?.split(' ')[0]} 👋
        </h1>
        {orphanage && !orphanage.verified && (
          <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gold/20 text-gold-900 text-sm font-medium">
            ⏳ Your profile is pending admin verification. Some features may be limited.
          </div>
        )}
      </div>

      {loading ? <PageSpinner /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard icon="📋" label="Total Needs Posted"   value={stats.total_needs ?? 0}     color="green" />
            <StatCard icon="🟢" label="Open Needs"           value={stats.open_needs ?? 0}       color="gold" />
            <StatCard icon="✅" label="Needs Fulfilled"      value={stats.fulfilled_needs ?? 0}  color="earth" />
            <StatCard icon="❤️" label="Donor Interests"      value={stats.total_interests ?? 0}  color="red" />
          </div>

          <div className="card p-5 mb-8">
            <h2 className="font-semibold text-ink mb-4">Quick actions</h2>
            <div className="flex flex-wrap gap-3">
              <Link to="/orphanage/needs/new"   className="btn-primary gap-2"><Plus size={15} /> Post a New Need</Link>
              <Link to="/orphanage/profile"     className="btn-secondary gap-2">🏛️ Edit Profile</Link>
              <Link to="/orphanage/updates/new" className="btn-secondary gap-2">📢 Post Update</Link>
              <Link to="/messages"              className="btn-secondary gap-2">💬 Messages</Link>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-forest/10">
              <h2 className="font-semibold text-ink">Recent Needs</h2>
              <Link to="/orphanage/needs" className="text-xs text-forest hover:underline flex items-center gap-1">Manage all <ArrowRight size={11} /></Link>
            </div>
            <OrphanageNeedsTable limit={5} />
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

/* ═══════════════════════════════════════════════════════════
   Needs Table (shared by dashboard and manage-needs page)
═══════════════════════════════════════════════════════════ */
export function OrphanageNeedsTable({ limit }) {
  const { data, loading, refetch } = useFetch('/orphanage/needs');
  const { mutate: del } = useMutation('delete');
  const [confirm, setConfirm] = useState(null);

  const needs = (data?.needs || []).slice(0, limit);

  const handleDelete = async () => {
    try {
      await del(`/needs/${confirm}`);
      toast.success('Need deleted.');
      refetch();
    } catch { toast.error('Failed to delete.'); }
    finally { setConfirm(null); }
  };

  if (loading) return <div className="p-8"><PageSpinner /></div>;
  if (!needs.length) return (
    <EmptyState icon="📋" title="No needs posted yet"
      action={<Link to="/orphanage/needs/new" className="btn-primary">Post your first need</Link>} />
  );

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-forest/10">
              {['Need', 'Category', 'Urgency', 'Status', 'Posted', ''].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-ink-muted">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {needs.map(n => (
              <tr key={n.need_id} className="border-b border-forest/8 hover:bg-forest/4 transition-colors">
                <td className="px-5 py-3 font-medium text-ink max-w-[200px]">
                  <span className="mr-2">{CATEGORY_ICONS[n.category]}</span>
                  <span className="truncate">{n.title}</span>
                </td>
                <td className="px-5 py-3 capitalize text-ink-muted">{n.category}</td>
                <td className="px-5 py-3"><span className={URGENCY_META[n.urgency]?.className}>{URGENCY_META[n.urgency]?.label}</span></td>
                <td className="px-5 py-3"><span className={STATUS_META[n.status]?.className}>{STATUS_META[n.status]?.label}</span></td>
                <td className="px-5 py-3 text-ink-muted whitespace-nowrap">{timeAgo(n.created_at)}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Link to={`/orphanage/needs/${n.need_id}/edit`} className="btn-ghost btn-sm p-1.5"><Edit2 size={13} /></Link>
                    <button onClick={() => setConfirm(n.need_id)} className="btn-ghost btn-sm p-1.5 text-ember hover:bg-ember/8"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmModal
        open={!!confirm}
        title="Delete this need?"
        message="This will permanently remove the need and all associated donor interests."
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   Post / Edit Need Form
═══════════════════════════════════════════════════════════ */
export function PostNeedPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [images, setImages]   = useState([]);
  const [form, setForm]       = useState({
    title: '', category: 'food', description: '',
    quantity: '', quantity_unit: '', urgency: 'medium',
  });

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title || !form.description) { setError('Title and description are required.'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      images.forEach(img => fd.append('images', img));
      await api.post('/needs', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Need posted successfully!');
      navigate('/orphanage/needs');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to post need.');
    } finally { setLoading(false); }
  };

  return (
    <DashboardLayout>
      <div className="page-header">
        <span className="section-label">Orphanage</span>
        <h1 className="font-display text-2xl font-bold text-ink mt-1">Post a New Need</h1>
      </div>

      <div className="max-w-2xl">
        <div className="card p-6 md:p-8">
          <Alert type="error" message={error} />
          {error && <div className="mb-5" />}

          <form onSubmit={handleSubmit} className="space-y-6">
            <Input label="Need Title *" placeholder="e.g. School uniforms for 20 children" value={form.title} onChange={set('title')} required maxLength={200} />

            <div className="grid grid-cols-2 gap-4">
              <Select label="Category *" value={form.category} onChange={set('category')}>
                {NEED_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </Select>
              <Select label="Urgency Level *" value={form.urgency} onChange={set('urgency')}>
                {Object.entries(URGENCY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </div>

            <Textarea label="Description *" placeholder="Describe the need in detail — what is needed, for how many children, and why it's important." value={form.description} onChange={set('description')} rows={5} required maxLength={1000} />
            <p className="text-xs text-ink-light -mt-4 text-right">{form.description.length}/1000</p>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Quantity" type="number" min="0" placeholder="e.g. 20" value={form.quantity} onChange={set('quantity')} />
              <Input label="Unit" placeholder="e.g. sets, kg, bottles" value={form.quantity_unit} onChange={set('quantity_unit')} />
            </div>

            {/* Image upload */}
            <div>
              <label className="input-label">Photos (optional, max 3)</label>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-forest/20 rounded-xl p-8 cursor-pointer hover:border-forest/40 hover:bg-forest/4 transition-colors">
                <Upload size={24} className="text-forest/40 mb-2" />
                <span className="text-sm text-ink-muted">Click to upload photos</span>
                <span className="text-xs text-ink-light mt-1">JPG, PNG up to 2MB each</span>
                <input
                  type="file" accept="image/*" multiple className="hidden"
                  onChange={e => setImages(Array.from(e.target.files).slice(0, 3))}
                />
              </label>
              {images.length > 0 && (
                <div className="flex gap-2 mt-3">
                  {images.map((f, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-forest/10">
                      <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={loading} className="btn-primary btn-lg">
                {loading ? '⏳ Posting…' : '✅ Post Need'}
              </button>
              <button type="button" onClick={() => navigate(-1)} className="btn-secondary btn-lg">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ═══════════════════════════════════════════════════════════
   Manage Needs Page (full table)
═══════════════════════════════════════════════════════════ */
export function ManageNeedsPage() {
  return (
    <DashboardLayout>
      <div className="page-header flex items-center justify-between">
        <div>
          <span className="section-label">Orphanage</span>
          <h1 className="font-display text-2xl font-bold text-ink mt-1">My Needs</h1>
        </div>
        <Link to="/orphanage/needs/new" className="btn-primary gap-2"><Plus size={15} /> Post Need</Link>
      </div>
      <div className="card overflow-hidden">
        <OrphanageNeedsTable />
      </div>
    </DashboardLayout>
  );
}

/* ═══════════════════════════════════════════════════════════
   Post Donation Update
═══════════════════════════════════════════════════════════ */
export function PostUpdatePage() {
  const navigate  = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [image, setImage]     = useState(null);
  const [form, setForm]       = useState({ title: '', description: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('description', form.description);
      if (image) fd.append('image', image);
      await api.post('/updates', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Donation update published!');
      navigate('/orphanage/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to publish update.');
    } finally { setLoading(false); }
  };

  return (
    <DashboardLayout>
      <div className="page-header">
        <span className="section-label">Orphanage</span>
        <h1 className="font-display text-2xl font-bold text-ink mt-1">Post a Donation Update</h1>
      </div>
      <div className="max-w-2xl">
        <div className="card p-6 md:p-8">
          <Alert type="error" message={error} />
          {error && <div className="mb-5" />}
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input label="Update Title *" placeholder="e.g. Thank you for the school bags!" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />
            <Textarea label="Description *" placeholder="Tell your donors how the donations were used…" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={6} required />
            <div>
              <label className="input-label">Photo (optional)</label>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-forest/20 rounded-xl p-6 cursor-pointer hover:border-forest/40 hover:bg-forest/4 transition-colors">
                <Upload size={22} className="text-forest/40 mb-2" />
                <span className="text-sm text-ink-muted">Upload a photo of the donation impact</span>
                <input type="file" accept="image/*" className="hidden" onChange={e => setImage(e.target.files[0])} />
              </label>
              {image && (
                <div className="mt-3 w-24 h-24 rounded-xl overflow-hidden border border-forest/10">
                  <img src={URL.createObjectURL(image)} alt="" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={loading} className="btn-primary btn-lg">
                {loading ? '⏳ Publishing…' : '📢 Publish Update'}
              </button>
              <button type="button" onClick={() => navigate(-1)} className="btn-secondary btn-lg">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
