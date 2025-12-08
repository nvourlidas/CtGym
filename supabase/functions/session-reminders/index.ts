// supabase/functions/session-reminders/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(URL, SERVICE, {
  auth: { persistSession: false },
});

type SessionRow = {
  id: string;
  tenant_id: string;
  starts_at: string;
  classes?: { title: string | null }[] | null; // ← array
};

type Payload = {
  test_session_id?: string | null;
};

const ATHENS_TIME_FORMAT = new Intl.DateTimeFormat("el-GR", {
  timeZone: "Europe/Athens",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return jsonResponse(null, 204);
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let payload: Payload = {};
  try {
    if (req.body) {
      payload = (await req.json()) as Payload;
    }
  } catch {
    // ignore, default empty payload
  }

  try {
    let sessions: SessionRow[] = [];

    if (payload.test_session_id) {
      // 👉 TEST MODE: συγκεκριμένο session
      const { data, error } = await supabase
        .from("class_sessions")
        .select(
          `
          id,
          tenant_id,
          starts_at,
          classes ( title )
        `,
        )
        .eq("id", payload.test_session_id)
        .maybeSingle();

      if (error) throw error;
      if (data) sessions = [data as SessionRow];
    } else {
      // 👉 NORMAL MODE: sessions που ξεκινάνε σε ~1 ώρα
      const now = new Date();
      const startWindow = new Date(now.getTime() + 60 * 60 * 1000); // +60'
      const endWindow = new Date(now.getTime() + 65 * 60 * 1000); // +65' window

      const { data, error } = await supabase
        .from("class_sessions")
        .select(
          `
          id,
          tenant_id,
          starts_at,
          classes ( title )
        `,
        )
        .gte("starts_at", startWindow.toISOString())
        .lt("starts_at", endWindow.toISOString());

      if (error) throw error;
      sessions = (data as SessionRow[]) ?? [];
    }

    if (!sessions.length) {
      return jsonResponse({ message: "No sessions to notify", sessions: [] });
    }

    let totalNotifications = 0;
    const perSession: any[] = [];

    for (const session of sessions) {
      // 1) Βρες bookings με status = 'booked'
      const { data: bookings, error: bErr } = await supabase
        .from("bookings")
        .select("user_id")
        .eq("session_id", session.id)
        .eq("status", "booked");

      if (bErr) throw bErr;

      const userIds = [
        ...new Set((bookings ?? []).map((b: any) => b.user_id as string)),
      ];
      if (!userIds.length) {
        perSession.push({
          sessionId: session.id,
          notifiedUsers: 0,
          reason: "no_bookings",
        });
        continue;
      }

      // 2) Βρες tokens για τους users αυτούς & tenant
      const { data: tokens, error: tErr } = await supabase
        .from("push_tokens")
        .select("expo_push_token")
        .eq("tenant_id", session.tenant_id)
        .eq("is_active", true)
        .in("user_id", userIds);

      if (tErr) throw tErr;

      const expoTokens = (tokens ?? [])
        .map((t: any) => t.expo_push_token as string)
        .filter((t) => typeof t === "string" && t.length > 0);

      if (!expoTokens.length) {
        perSession.push({
          sessionId: session.id,
          notifiedUsers: 0,
          reason: "no_tokens",
        });
        continue;
      }

      // 3) Υπολογισμός ώρας & κειμένου
      const starts = new Date(session.starts_at);
      const timeStr = ATHENS_TIME_FORMAT.format(starts);

      const classTitle = (Array.isArray(session.classes) &&
        session.classes[0]?.title?.trim()) ||
        "Μάθημα";

      const title = "Υπενθύμιση κράτησης";
      const body =
        `Το μάθημά σου "${classTitle}" ξεκινά σε 1 ώρα (ώρα έναρξης: ${timeStr}).`;

      const messages = expoTokens.map((token) => ({
        to: token,
        sound: "default",
        title,
        body,
        data: {
          type: "session_reminder",
          sessionId: session.id,
          startsAt: session.starts_at,
        },
      }));

      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
        },
        body: JSON.stringify(messages),
      });

      const json = await res.json();
      console.log("Expo push response for session", session.id, json);

      totalNotifications += messages.length;

      perSession.push({
        sessionId: session.id,
        notifiedUsers: expoTokens.length,
      });
    }

    return jsonResponse({
      message: "Reminders processed",
      sessionsProcessed: sessions.length,
      notificationsSent: totalNotifications,
      details: perSession,
    });
  } catch (err) {
    console.error("session-reminders error", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
