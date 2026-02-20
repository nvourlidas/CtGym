// src/pages/ThemeSettingsPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth';
import { MobilePreview } from '../../components/MobilePreview';
import SubscriptionRequiredModal from '../../components/SubscriptionRequiredModal';
import { useNavigate } from "react-router-dom";
import { Rocket } from 'lucide-react';

type Theme = {
    primary_color: string;
    accent_color: string;
    bg_color: string;
    card_color: string;
    text_color: string;
    text_muted: string;
    success_color: string;
    error_color: string;
    app_logo_url?: string | null;
};

type ColorKey =
    | 'primary_color'
    | 'accent_color'
    | 'bg_color'
    | 'card_color'
    | 'text_color'
    | 'text_muted'
    | 'success_color'
    | 'error_color';

const defaultTheme: Theme = {
    primary_color: '#2f55d4',
    accent_color: '#ffc947',
    bg_color: '#253649',
    card_color: '#1f2d3d',
    text_color: '#ffffff',
    text_muted: '#9ca3af',
    success_color: '#22C55E',
    error_color: '#f97373',
    app_logo_url: null,
};

const FIELDS: Array<{ key: ColorKey; label: string; hint?: string }> = [
    { key: 'primary_color', label: 'Primary', hint: 'Κουμπιά / κύρια στοιχεία' },
    { key: 'accent_color', label: 'Accent', hint: 'Έμφαση / highlights' },
    { key: 'bg_color', label: 'Background', hint: 'Φόντο εφαρμογής' },
    { key: 'card_color', label: 'Card', hint: 'Κάρτες / blocks' },
    { key: 'text_color', label: 'Text', hint: 'Κύριο κείμενο' },
    { key: 'text_muted', label: 'Text muted', hint: 'Δευτερεύον κείμενο' },
    { key: 'success_color', label: 'Success', hint: 'Επιτυχία' },
    { key: 'error_color', label: 'Error', hint: 'Σφάλμα' },
];

type ToastType = 'success' | 'error' | 'info';



function Toast({
    toast,
    onClose,
}: {
    toast: { type: ToastType; title: string; message?: string } | null;
    onClose: () => void;
}) {
    if (!toast) return null;

    const base =
        'fixed z-[80] right-4 bottom-4 w-[min(420px,calc(100%-32px))] rounded-xl border px-4 py-3 shadow-xl backdrop-blur';
    const cls =
        toast.type === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50'
            : toast.type === 'error'
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-50'
                : 'border-white/15 bg-black/40 text-white';

    return (
        <div className={`${base} ${cls}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-semibold">{toast.title}</div>
                    {toast.message && (
                        <div className="mt-0.5 text-xs opacity-90 whitespace-pre-line">
                            {toast.message}
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="shrink-0 rounded-md px-2 py-1 text-xs border border-white/15 hover:bg-white/10"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

export default function ThemeSettingsPage() {
    const { profile, subscription } = useAuth();
    const [showSubModal, setShowSubModal] = useState(false);
    const navigate = useNavigate();

    const [theme, setTheme] = useState<Theme>(defaultTheme);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);


    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);

    const [toast, setToast] = useState<{ type: ToastType; title: string; message?: string } | null>(null);

    function showToast(type: ToastType, title: string, message?: string) {
        setToast({ type, title, message });
        window.clearTimeout((showToast as any)._t);
        (showToast as any)._t = window.setTimeout(() => setToast(null), 2200);
    }

    // const subscriptionInactive = !subscription?.is_active;

    // function requireActiveSubscription(action: () => void) {
    //     if (subscriptionInactive) {
    //         setShowSubModal(true);
    //         return;
    //     }
    //     action();
    // }

    const tier = String(
        (subscription as any)?.plan_id ??
        (subscription as any)?.tier ??
        (subscription as any)?.plan_name ??
        (subscription as any)?.name ??
        ""
    ).toLowerCase();

    const isPro = tier === "pro" || tier.includes("pro") || tier.includes("friend_app");
    function requirePro(action: () => void) {
        // if not active at all -> keep your existing modal
        if (!subscription?.is_active) {
            setShowSubModal(true);
            return;
        }

        // active but not Pro -> push them to upgrade
        if (!isPro) {
            showToast("info", "Απαιτείται Pro", "Για αποθήκευση θέματος και logo χρειάζεται Pro.");
            // take them to billing (or wherever your upgrade happens)
            navigate("/settings/billing");
            return;
        }

        action();
    }

    const isDefault = useMemo(() => {
        const keys: ColorKey[] = [
            'primary_color',
            'accent_color',
            'bg_color',
            'card_color',
            'text_color',
            'text_muted',
            'success_color',
            'error_color',
        ];
        return keys.every(
            (k) => (theme[k] ?? '').toLowerCase() === defaultTheme[k].toLowerCase(),
        );
    }, [theme]);

    useEffect(() => {
        if (!profile) return;

        const load = async () => {
            setLoading(true);

            const { data, error } = await supabase
                .from('tenant_themes')
                .select('*')
                .eq('tenant_id', profile.tenant_id)
                .maybeSingle();

            if (!error && data) {
                setTheme({
                    primary_color: data.primary_color,
                    accent_color: data.accent_color,
                    bg_color: data.bg_color,
                    card_color: data.card_color,
                    text_color: data.text_color,
                    text_muted: data.text_muted,
                    success_color: data.success_color,
                    error_color: data.error_color,
                    app_logo_url: data.app_logo_url ?? null,
                });
            } else {
                setTheme(defaultTheme);
            }

            setLoading(false);
        };

        load();
    }, [profile]);

    const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        setLogoFile(file);
    };

    const handleUploadLogoAndSave = async () => {
        if (!profile || !logoFile) return;

        try {
            setUploadingLogo(true);

            const formData = new FormData();
            formData.append('file', logoFile);

            const { data, error } = await supabase.functions.invoke('upload-logo', {
                body: formData,
            });

            if (error) {
                console.error('Upload failed', error);
                showToast('error', 'Αποτυχία upload', error.message);
                return;
            }

            const url = (data as any)?.url as string | undefined;
            if (!url) {
                console.error('No URL returned from edge function', data);
                return;
            }

            const payload = {
                tenant_id: profile.tenant_id,
                ...theme,
                app_logo_url: url,
            };

            const { error: saveError } = await supabase
                .from('tenant_themes')
                .upsert(payload, { onConflict: 'tenant_id' });

            if (saveError) {
                console.error('Saving logo URL failed', saveError);
                showToast('error', 'Αποτυχία αποθήκευσης logo', saveError.message);
                return;
            }

            setTheme((prev) => ({ ...prev, app_logo_url: url }));
            setLogoFile(null);
        } catch (err) {
            console.error('upload+save logo error', err);
        } finally {
            setUploadingLogo(false);
            showToast('success', 'Saved ✅', 'Το logo ανέβηκε και αποθηκεύτηκε.');
        }
    };

    const handleSave = async () => {
        if (!profile) return;

        setSaving(true);

        const payload = {
            tenant_id: profile.tenant_id,
            ...theme,
        };

        const { error } = await supabase
            .from('tenant_themes')
            .upsert(payload, { onConflict: 'tenant_id' });

        if (error) console.log('save theme error', error);

        setSaving(false);

        if (error) {
            console.log('save theme error', error);
            showToast('error', 'Αποτυχία αποθήκευσης', error.message);
            return;
        }

        showToast('success', 'Saved ✅', 'Οι αλλαγές αποθηκεύτηκαν.');
    };

    const confirmRestore = () => {
        return window.confirm(
            'Η επαναφορά θα αλλάξει ΟΛΑ τα χρώματα στα προεπιλεγμένα.\n' +
            'Το λογότυπο δεν θα επηρεαστεί.\n\n' +
            'Θέλεις να συνεχίσεις;',
        );
    };

    const handleRestoreDefaults = () => {
        if (!confirmRestore()) return;
        setTheme((prev) => ({
            ...defaultTheme,
            app_logo_url: prev.app_logo_url ?? null,
        }));
    };

    if (loading) {
        return (
            <div className="p-6">
                <div className="rounded-xl border border-border/10 bg-secondary-background p-4 text-sm text-text-secondary">
                    Loading theme…
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-4">
            <Toast toast={toast} onClose={() => setToast(null)} />
            {!isPro && (
                <div className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold text-accent">
                            🔒 Διαθέσιμο μόνο στο Pro
                        </div>
                        <div className="text-xs text-accent/80 mt-1">
                            Η προσαρμογή χρωμάτων και logo είναι διαθέσιμη μόνο στο Pro πλάνο.
                        </div>
                    </div>

                    <button
                        onClick={() => navigate("/settings/billing")}
                        className="inline-flex items-center gap-2 h-8 rounded-md px-3 text-xs font-semibold bg-accent text-black hover:bg-accent/80 transition"
                    >
                        <Rocket className="h-4 w-4" />
                        Αναβάθμιση
                    </button>
                </div>
            )}
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl font-semibold">Χρώματα εφαρμογής μέλους</h1>
                    <p className="mt-1 text-xs text-text-secondary">
                        Ρύθμισε τα χρώματα που βλέπουν οι χρήστες στο mobile app.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleRestoreDefaults}
                        disabled={saving || isDefault}
                        className="btn-secondary disabled:opacity-40"
                        title="Επαναφορά χρωμάτων στα προεπιλεγμένα (χωρίς αποθήκευση)"
                    >
                        Restore defaults
                    </button>

                    <button
                        type="button"
                        onClick={() => requirePro(() => handleSave())}
                        disabled={saving || !isPro}
                        title={!isPro ? "Διαθέσιμο μόνο στο Pro" : undefined}
                        className="btn-primary disabled:opacity-60"
                    >
                        {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
                    </button>
                </div>
            </div>

            {/* Layout: Settings + Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Settings card */}
                <div className="lg:col-span-3 rounded-xl border border-border/10 bg-secondary-background p-4">
                    <div className="text-sm font-semibold">Χρώματα</div>
                    <div className="mt-1 text-xs text-text-secondary">
                        Μπορείς να γράψεις hex (#...) ή να διαλέξεις από το picker.
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {FIELDS.map(({ key, label, hint }) => (
                            <div
                                key={key}
                                className="rounded-lg border border-border/10 bg-background/30 p-3"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium">{label}</div>
                                        {hint && (
                                            <div className="mt-0.5 text-[11px] text-text-secondary">
                                                {hint}
                                            </div>
                                        )}
                                    </div>

                                    {/* color swatch + picker */}
                                    <label className="relative h-9 w-12 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border/15">
                                        <span
                                            className="absolute inset-0"
                                            style={{ backgroundColor: theme[key] }}
                                        />
                                        <input
                                            type="color"
                                            value={theme[key]}
                                            onChange={(e) =>
                                                setTheme((prev) => ({ ...prev, [key]: e.target.value }))
                                            }
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                        />
                                    </label>
                                </div>

                                <input
                                    type="text"
                                    className="input mt-3 h-9 text-sm"
                                    value={theme[key]}
                                    onChange={(e) =>
                                        setTheme((prev) => ({ ...prev, [key]: e.target.value }))
                                    }
                                    placeholder="#RRGGBB"
                                />
                            </div>
                        ))}
                    </div>

                    {/* Logo section */}
                    <div className="mt-5 pt-4 border-t border-border/10">
                        <div className="text-sm font-semibold">Logo</div>
                        <div className="mt-1 text-xs text-text-secondary">
                            Προτείνεται PNG/SVG με διαφανές background.
                        </div>

                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                                {theme.app_logo_url ? (
                                    <img
                                        src={theme.app_logo_url}
                                        alt="App logo"
                                        className="h-10 w-10 rounded-lg border border-border/10 object-contain bg-black/10"
                                    />
                                ) : (
                                    <div className="h-10 w-10 rounded-lg border border-border/10 bg-black/10" />
                                )}

                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/svg+xml"
                                    onChange={handleLogoFileChange}
                                    disabled={uploadingLogo}
                                    className="text-xs"
                                />
                            </div>

                            <button
                                disabled={!logoFile || uploadingLogo || !isPro}
                                title={!isPro ? "Διαθέσιμο μόνο στο Pro" : undefined}
                                type="button"
                                onClick={() => requirePro(() => handleUploadLogoAndSave())}
                                className="btn-primary disabled:opacity-40"
                            >
                                {uploadingLogo ? 'Ανέβασμα…' : 'Upload & Save'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Preview card */}
                <div className="lg:col-span-2 rounded-xl border border-border/10 bg-secondary-background p-4">
                    <div className="text-sm font-semibold">Preview</div>
                    <div className="mt-1 text-xs text-text-secondary">
                        Προεπισκόπηση εμφάνισης στο mobile.
                    </div>

                    <div className="mt-4">
                        <MobilePreview theme={theme} />
                    </div>
                </div>
            </div>

            <SubscriptionRequiredModal
                open={showSubModal}
                onClose={() => setShowSubModal(false)}
            />
        </div>
    );
}