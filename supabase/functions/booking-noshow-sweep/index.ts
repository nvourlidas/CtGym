// supabase/functions/booking-noshow-sweep/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const URL = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
serve(async () => {
  const admin = createClient(URL, SERVICE, { auth: { persistSession:false } });

  // Mark bookings as no_show if session ended and still booked
  const { data: ended } = await admin
    .from("class_sessions")
    .select("id, ends_at")
    .lte("ends_at", new Date().toISOString());

  const ids = (ended ?? []).map(s => s.id);
  if (ids.length === 0) return new Response("OK");

  await admin.rpc("mark_noshow_for_sessions", { p_session_ids: ids });
  return new Response("OK");
});
