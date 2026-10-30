"use client";

import * as React from "react";
import { normalizeUserPhone } from "@dct-crm/shared";
import { useAuth } from "@/contexts/auth-context";
import { userApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PhoneRequiredBanner() {
  const { user, tenant, refresh } = useAuth();
  const [phone, setPhone] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  if (!user || user.phone) return null;

  const save = async () => {
    const check = normalizeUserPhone(phone, tenant?.country);
    if ("error" in check) {
      setError(check.error);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await userApi.update(user.id, { phone: phone.trim() });
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Unable to save your phone number");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-[13px] text-amber-950">
      <p className="font-medium">Add your phone number to continue</p>
      <p className="mt-1 text-amber-900">Your account is missing a phone number. You can keep working, and the next time your user record is saved a phone number is required.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="missing-phone">Phone</label>
          <Input
            id="missing-phone"
            value={phone}
            onChange={(event) => { setPhone(event.target.value); setError(""); }}
            placeholder="+91 98765 43210"
            aria-invalid={Boolean(error)}
          />
          {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        </div>
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving || !phone.trim()}>
          {saving ? "Saving..." : "Save phone"}
        </Button>
      </div>
    </div>
  );
}
