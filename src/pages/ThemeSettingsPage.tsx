// src/pages/ThemeSettingsPage.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { MobilePreview } from '../components/MobilePreview'

type Theme = {
    primary_color: string;
    accent_color: string;
    bg_color: string;
    card_color: string;
    text_color: string;
    text_muted: string;
    success_color: string;
    error_color: string;
    app_logo_url?: string;
};

const defaultTheme: Theme = {
    primary_color: '#2f55d4',
    accent_color: '#ffc947',
    bg_color: '#253649',
    card_color: '#1f2d3d',
    text_color: '#ffffff',
    text_muted: '#9ca3af',
    success_color: '#22C55E',
    error_color: '#f97373',
};

export default function ThemeSettingsPage() {
    const { profile } = useAuth(); // profile.tenant_id
    const [theme, setTheme] = useState<Theme>(defaultTheme);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);

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
            }
            setLoading(false);
        };
        load();
    }, [profile]);

    const handleChange = (key: keyof Theme, value: string) => {
        setTheme((prev) => ({ ...prev, [key]: value }));
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
    };


    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !profile) return;

        try {
            setUploadingLogo(true);

            const fileExt = file.name.split('.').pop();
            const fileName = `tenant-${profile.tenant_id}-logo.${fileExt}`;
            const filePath = `logos/${fileName}`;

            // 1) upload στο bucket
            const { error: uploadError } = await supabase.storage
                .from('tenant-assets')            // 👈 το bucket name σου
                .upload(filePath, file, {
                    upsert: true,                   // overwrite αν υπάρχει
                });

            if (uploadError) {
                console.log('upload logo error', uploadError);
                return;
            }

            // 2) πάρε public URL
            const { data } = supabase.storage
                .from('tenant-assets')
                .getPublicUrl(filePath);

            const publicUrl = data?.publicUrl ?? null;
            if (!publicUrl) return;

            // 3) γράψε το URL στο theme state
            setTheme((prev) => ({
                ...prev,
                app_logo_url: publicUrl,
            }));
        } finally {
            setUploadingLogo(false);
        }
    };

    if (loading) return <div>Loading theme…</div>;

    return (
        <div className="p-6 space-y-4">
            <h1 className="text-xl font-semibold">Χρώματα εφαρμογής μέλους</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(
                    [
                        ['primary_color', 'Primary'],
                        ['accent_color', 'Accent'],
                        ['bg_color', 'Background'],
                        ['card_color', 'Card'],
                        ['text_color', 'Text'],
                        ['text_muted', 'Text muted'],
                        ['success_color', 'Success'],
                        ['error_color', 'Error'],
                    ] as [keyof Theme, string][]
                ).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-3">
                        <label className="w-32">{label}</label>
                        <input
                            type="color"
                            value={theme[key]}
                            onChange={(e) => handleChange(key, e.target.value)}
                        />
                        <input
                            type="text"
                            className="border rounded px-2 py-1 flex-1"
                            value={theme[key]}
                            onChange={(e) => handleChange(key, e.target.value)}
                        />
                    </div>
                ))}
            </div>

            <div className="mt-6 space-y-2">
                <label className="block font-medium">App logo</label>
                <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                />
            </div>


            <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded bg-blue-600 text-white font-semibold disabled:opacity-50"
            >
                {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
            </button>

            {/* Small preview */}
            <MobilePreview theme={theme} />
        </div>
    );
}
