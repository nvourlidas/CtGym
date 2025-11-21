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
};

export default function ThemeSettingsPage() {
    const { profile } = useAuth(); // profile.tenant_id
    const [theme, setTheme] = useState<Theme>(defaultTheme);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [logoFile, setLogoFile] = useState<File | null>(null);
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

            // ⬇️ use supabase.functions.invoke instead of fetch
            const { data, error } = await supabase.functions.invoke('upload-logo', {
                body: formData,
            });

            if (error) {
                console.error('Upload failed', error);
                return;
            }

            const url = (data as any)?.url as string | undefined;
            if (!url) {
                console.error('No URL returned from edge function', data);
                return;
            }

            // Save URL to tenant_themes
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
                return;
            }

            // Update local state & clear file
            setTheme((prev) => ({ ...prev, app_logo_url: url }));
            setLogoFile(null);
        } catch (err) {
            console.error('upload+save logo error', err);
        } finally {
            setUploadingLogo(false);
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
                    ] as [ColorKey, string][]
                ).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-3">
                        <label className="w-32">{label}</label>

                        {/* color picker */}
                        <input
                            type="color"
                            value={theme[key]}             // ✅ πάντα string
                            onChange={(e) =>
                                setTheme((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                        />

                        {/* text input */}
                        <input
                            type="text"
                            className="border rounded px-2 py-1 flex-1"
                            value={theme[key]}             // ✅ πάντα string
                            onChange={(e) =>
                                setTheme((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                        />
                    </div>
                ))}

            </div>
            <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded bg-blue-600 text-white font-semibold disabled:opacity-50"
            >
                {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
            </button>

            <div className="mt-6 space-y-2">
                <label className="block font-medium">Logo</label>

                <div className="flex items-center gap-3">
                    <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml"
                        onChange={handleLogoFileChange}
                        disabled={uploadingLogo}
                    />

                    <button
                        type="button"
                        onClick={handleUploadLogoAndSave}
                        disabled={!logoFile || uploadingLogo}
                        className="px-3 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-40"
                    >
                        {uploadingLogo ? 'Ανέβασμα…' : 'Upload & Save'}
                    </button>
                </div>

                {/* optional manual URL edit */}
                <input
                    type="text"
                    className="border rounded px-2 py-1 w-full mt-2"
                    placeholder="Cloudflare logo URL"
                    value={theme.app_logo_url ?? ''}
                    onChange={(e) =>
                        setTheme((prev) => ({
                            ...prev,
                            app_logo_url: e.target.value || null,
                        }))
                    }
                />

            </div>
            {/* Small preview */}
            <MobilePreview theme={theme} />
        </div>
    );
}
