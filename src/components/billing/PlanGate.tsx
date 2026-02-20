import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { useAuth } from "../../auth";
import { Rocket } from "lucide-react";

type Props = {
  allow: Array<"starter" | "pro">;
  title?: string;
  description?: string;
  onUpgradeClick?: () => void;

  asOverlay?: boolean;
  blocked?: boolean;
};

function getPlanTier(subscription: any): "free" | "starter" | "pro" {
  if (!subscription) return "free";

  // plan_id can be uuid, tier can be string, name/plan_name can contain "starter"/"pro"
  const tier = String(subscription?.tier ?? "").toLowerCase();
  const planId = String(subscription?.plan_id ?? "").toLowerCase();
  const name = String(subscription?.plan_name ?? subscription?.name ?? "").toLowerCase();

  // ✅ explicit checks only (NO "is_active => starter")
  if (tier === "pro" || planId === "pro" || name.includes("pro")) return "pro";
  if (tier === "starter" || planId === "starter" || name.includes("starter")) return "starter";

  return "free";
}

export default function PlanGate({
  allow,
  title = "Απαιτείται αναβάθμιση",
  description = "Η λειτουργία είναι διαθέσιμη από το πακέτο Starter και πάνω.",
  onUpgradeClick,
  asOverlay = false,
  blocked = false,
}: Props) {
  const { subscription } = useAuth();
  const navigate = useNavigate();

  const tier = getPlanTier(subscription as any);
  const allowed = allow.includes(tier as any);

  // ✅ correct logic
  const shouldShow = blocked || !allowed;
  if (!shouldShow) return null;

  const Card = (
    <div className="rounded-xl border border-border/15 bg-secondary-background/95 backdrop-blur p-5 shadow-2xl shadow-black/20">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/15 bg-black/10">
          <Lock className="h-5 w-5" />
        </div>

        <div className="flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-xs text-text-secondary">{description}</div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() =>
                onUpgradeClick ? onUpgradeClick() : navigate("/settings/billing")
              }
              className="inline-flex items-center gap-2 h-9 rounded-md px-4 text-sm bg-accent hover:bg-accent/90 text-black cursor-pointer"
            >
                <Rocket className="h-4 w-4" />
              Αναβάθμιση
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="h-9 rounded-md px-4 text-sm border border-border/15 hover:bg-secondary/20"
            >
              Πίσω
            </button>
          </div>

          <div className="mt-3 text-[11px] text-text-secondary opacity-80">
            Τρέχον πακέτο:{" "}
            <span className="font-semibold uppercase">{tier}</span>
          </div>
        </div>
      </div>
    </div>
  );

  if (!asOverlay) return <div className="p-6">{Card}</div>;
  return Card;
}