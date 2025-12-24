/// <reference deno.ns="deno" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type Json = Record<string, any>;

const WGER_BASE = "https://wger.de/api/v2";

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function fetchJson(url: string, tries = 3): Promise<any> {
  let lastErr: any = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

function toIsoOrNull(v: any): string | null {
  if (!v) return null;
  // wger returns ISO strings with timezone, we keep as text -> timestamptz accepts it
  return String(v);
}

Deno.serve(async (req) => {
  // Protect this endpoint with a shared secret (since we’ll deploy with --no-verify-jwt)
  const secret = req.headers.get("x-sync-secret") ?? "";
  if (secret !== env("WGER_SYNC_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const SUPABASE_URL = env("SUPABASE_URL");
  const SERVICE_ROLE = env("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const limit = 100; // reduce pages

  let pages = 0;
  let totalExercises = 0;

  // Optional: load languages table (not required for exerciseinfo sync, but useful)
  // /api/v2/language/ is on the API root list :contentReference[oaicite:2]{index=2}
  try {
    let langUrl = `${WGER_BASE}/language/?limit=${limit}&offset=0`;
    const langs: any[] = [];
    while (langUrl) {
      const j = await fetchJson(langUrl);
      langs.push(...(j.results ?? []));
      langUrl = j.next ?? null;
    }
    if (langs.length) {
      const payload = langs.map((l) => ({
        id: l.id,
        short_name: l.short_name ?? null,
        full_name: l.full_name ?? null,
        full_name_en: l.full_name_en ?? null,
      }));
      const { error } = await supabase.from("wger_languages").upsert(payload, {
        onConflict: "id",
      });
      if (error) throw error;
    }
  } catch (e) {
    // don’t fail the whole sync if languages fail
    console.log("Language sync failed:", e);
  }

  // Main: exerciseinfo (rich payload: category/muscles/equipment/images/translations/videos) :contentReference[oaicite:3]{index=3}
  let url: string | null = `${WGER_BASE}/exerciseinfo/?limit=${limit}&offset=0`;

  while (url) {
    pages++;
    const data = await fetchJson(url);
    const results: any[] = data.results ?? [];

    if (!results.length) break;
    totalExercises += results.length;

    // ---- Collect upserts (batch per page) ----
    const exerciseIds: number[] = [];

    const categories: any[] = [];
    const licenses: any[] = [];
    const exercises: any[] = [];
    const muscles: any[] = [];
    const equipment: any[] = [];
    const exMuscles: any[] = [];
    const exEquipment: any[] = [];
    const translations: any[] = [];
    const images: any[] = [];
    const videos: any[] = [];

    const seen = {
      cat: new Set<number>(),
      lic: new Set<number>(),
      mus: new Set<number>(),
      eq: new Set<number>(),
      tr: new Set<number>(),
      img: new Set<number>(),
      vid: new Set<number>(),
    };

    for (const ex of results) {
      const exId = ex.id as number;
      exerciseIds.push(exId);

      // category
      if (ex.category?.id && !seen.cat.has(ex.category.id)) {
        seen.cat.add(ex.category.id);
        categories.push({
          id: ex.category.id,
          name: ex.category.name ?? null,
        });
      }

      // license
      if (ex.license?.id && !seen.lic.has(ex.license.id)) {
        seen.lic.add(ex.license.id);
        licenses.push({
          id: ex.license.id,
          full_name: ex.license.full_name ?? null,
          short_name: ex.license.short_name ?? null,
          url: ex.license.url ?? null,
        });
      }

      // exercise
      exercises.push({
        id: exId,
        uuid: ex.uuid ?? null,
        created_at: toIsoOrNull(ex.created),
        last_update: toIsoOrNull(ex.last_update),
        last_update_global: toIsoOrNull(ex.last_update_global),
        category_id: ex.category?.id ?? null,
        license_id: ex.license?.id ?? null,
        license_author: ex.license_author ?? null,
        variations: ex.variations ?? null,
        raw: ex as Json,
      });

      // muscles primary
      for (const m of ex.muscles ?? []) {
        if (m.id && !seen.mus.has(m.id)) {
          seen.mus.add(m.id);
          muscles.push({
            id: m.id,
            name: m.name ?? null,
            name_en: m.name_en ?? null,
            is_front: m.is_front ?? null,
            image_url_main: m.image_url_main ?? null,
            image_url_secondary: m.image_url_secondary ?? null,
          });
        }
        if (m.id) exMuscles.push({ exercise_id: exId, muscle_id: m.id, role: "primary" });
      }

      // muscles secondary
      for (const m of ex.muscles_secondary ?? []) {
        if (m.id && !seen.mus.has(m.id)) {
          seen.mus.add(m.id);
          muscles.push({
            id: m.id,
            name: m.name ?? null,
            name_en: m.name_en ?? null,
            is_front: m.is_front ?? null,
            image_url_main: m.image_url_main ?? null,
            image_url_secondary: m.image_url_secondary ?? null,
          });
        }
        if (m.id) exMuscles.push({ exercise_id: exId, muscle_id: m.id, role: "secondary" });
      }

      // equipment
      for (const eq of ex.equipment ?? []) {
        if (eq.id && !seen.eq.has(eq.id)) {
          seen.eq.add(eq.id);
          equipment.push({ id: eq.id, name: eq.name ?? null });
        }
        if (eq.id) exEquipment.push({ exercise_id: exId, equipment_id: eq.id });
      }

      // translations (contain HTML description/instructions) :contentReference[oaicite:4]{index=4}
      for (const tr of ex.translations ?? []) {
        if (tr.id && !seen.tr.has(tr.id)) {
          seen.tr.add(tr.id);
          translations.push({
            id: tr.id,
            uuid: tr.uuid ?? null,
            exercise_id: exId,
            language_id: tr.language ?? null,
            name: tr.name ?? null,
            description: tr.description ?? null,
            created_at: toIsoOrNull(tr.created),
            license_id: tr.license ?? null,
            license_author: tr.license_author ?? null,
          });
        }
      }

      // images
      for (const im of ex.images ?? []) {
        if (im.id && !seen.img.has(im.id)) {
          seen.img.add(im.id);
          images.push({
            id: im.id,
            uuid: im.uuid ?? null,
            exercise_id: exId,
            image_url: im.image ?? null,
            is_main: im.is_main ?? false,
            style: im.style ?? null,
            license_id: im.license ?? null,
            license_author: im.license_author ?? null,
          });
        }
      }

      // videos
      for (const v of ex.videos ?? []) {
        if (v.id && !seen.vid.has(v.id)) {
          seen.vid.add(v.id);
          videos.push({
            id: v.id,
            uuid: v.uuid ?? null,
            exercise_id: exId,
            video_url: v.video ?? null,
            is_main: v.is_main ?? false,
            size: v.size ?? null,
            duration: v.duration ?? null,
            width: v.width ?? null,
            height: v.height ?? null,
            codec: v.codec ?? null,
            codec_long: v.codec_long ?? null,
            license_id: v.license ?? null,
            license_author: v.license_author ?? null,
          });
        }
      }
    }

    // ---- Write to DB (upserts) ----
    // base tables first
    if (categories.length) {
      const { error } = await supabase.from("wger_exercise_categories").upsert(categories, { onConflict: "id" });
      if (error) throw error;
    }
    if (licenses.length) {
      const { error } = await supabase.from("wger_licenses").upsert(licenses, { onConflict: "id" });
      if (error) throw error;
    }
    if (muscles.length) {
      const { error } = await supabase.from("wger_muscles").upsert(muscles, { onConflict: "id" });
      if (error) throw error;
    }
    if (equipment.length) {
      const { error } = await supabase.from("wger_equipment").upsert(equipment, { onConflict: "id" });
      if (error) throw error;
    }

    // exercises
    {
      const { error } = await supabase.from("wger_exercises").upsert(exercises, { onConflict: "id" });
      if (error) throw error;
    }

    // Replace relation rows for this page’s exercises (keeps things accurate)
    if (exerciseIds.length) {
      await supabase.from("wger_exercise_muscles").delete().in("exercise_id", exerciseIds);
      await supabase.from("wger_exercise_equipment").delete().in("exercise_id", exerciseIds);
    }

    if (exMuscles.length) {
      const { error } = await supabase.from("wger_exercise_muscles").insert(exMuscles);
      if (error) throw error;
    }
    if (exEquipment.length) {
      const { error } = await supabase.from("wger_exercise_equipment").insert(exEquipment);
      if (error) throw error;
    }

    // translations/images/videos (upsert by ID)
    if (translations.length) {
      const { error } = await supabase.from("wger_exercise_translations").upsert(translations, { onConflict: "id" });
      if (error) throw error;
    }
    if (images.length) {
      const { error } = await supabase.from("wger_exercise_images").upsert(images, { onConflict: "id" });
      if (error) throw error;
    }
    if (videos.length) {
      const { error } = await supabase.from("wger_exercise_videos").upsert(videos, { onConflict: "id" });
      if (error) throw error;
    }

    // next page
    url = data.next ?? null;

    // small breather (be nice to wger)
    await new Promise((r) => setTimeout(r, 150));
  }

  return Response.json({
    ok: true,
    pages,
    totalExercises,
    note: "Synced from wger /api/v2/exerciseinfo (paged).",
  });
});
