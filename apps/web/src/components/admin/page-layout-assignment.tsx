"use client";

import * as React from "react";
import api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface LayoutChoice {
  id: string;
  name: string;
  isDefault?: boolean;
}

interface AssignmentRow {
  profileId: string;
  recordTypeKey: string;
  layoutId: string;
}

interface Matrix {
  objectName: string;
  recordTypes: { key: string; label: string }[];
  profiles: { id: string; name: string }[];
  layouts: LayoutChoice[];
  defaultLayoutId: string | null;
  assignments: AssignmentRow[];
}

export default function PageLayoutAssignment({ objectName, onClose }: { objectName: string; onClose: () => void }) {
  const { toast } = useToast();
  const [matrix, setMatrix] = React.useState<Matrix | null>(null);
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [saved, setSaved] = React.useState<Record<string, string>>({});
  const [editing, setEditing] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [bulkLayoutId, setBulkLayoutId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const response = await api.get("/api/layout-assignments", { params: { object: objectName } });
    const data = response.data?.data as Matrix;
    const next: Record<string, string> = {};
    for (const profile of data.profiles) {
      for (const recordType of data.recordTypes) {
        const current = data.assignments.find((row) => row.profileId === profile.id && row.recordTypeKey === recordType.key);
        next[`${profile.id}:${recordType.key}`] = current?.layoutId || data.defaultLayoutId || "";
      }
    }
    setMatrix(data);
    setDraft(next);
    setSaved(next);
    setSelected([]);
    setEditing(false);
    setBulkLayoutId(data.defaultLayoutId || data.layouts[0]?.id || "");
  }, [objectName]);

  React.useEffect(() => {
    void load().catch(() => {
      toast({ title: "Unable to load assignments", description: "Try again.", variant: "destructive" as any });
    });
  }, [load, toast]);

  const changes = Object.keys(draft).filter((key) => draft[key] !== saved[key]);

  const save = async () => {
    if (!matrix) return;
    setSaving(true);
    try {
      const assignments = changes.map((key) => {
        const [profileId, recordTypeKey] = key.split(":");
        return { profileId, recordTypeKey, layoutId: draft[key] };
      });
      await api.put("/api/layout-assignments", { object: matrix.objectName, assignments });
      setSaved({ ...draft });
      setEditing(false);
      toast({ title: "Assignments saved", description: `${assignments.length} profile assignment${assignments.length === 1 ? "" : "s"} updated.` });
    } catch (error: any) {
      toast({ title: "Unable to save assignments", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any });
    } finally {
      setSaving(false);
    }
  };

  if (!matrix) {
    return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading page layout assignment...</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium">Page Layout Assignment</h3>
          <p className="text-sm text-muted-foreground">
            {objectName} · {changes.length} change{changes.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!editing ? (
            <Button onClick={() => setEditing(true)}>Edit Assignment</Button>
          ) : (
            <>
              <Button onClick={() => void save()} disabled={saving || changes.length === 0}>Save</Button>
              <Button variant="outline" onClick={() => { setDraft(saved); setEditing(false); setSelected([]); }}>Cancel</Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => {
              if (!matrix.defaultLayoutId) return;
              const next = { ...draft };
              const targets = selected.length ? selected : matrix.profiles.map((profile) => profile.id);
              for (const profileId of targets) {
                for (const recordType of matrix.recordTypes) next[`${profileId}:${recordType.key}`] = matrix.defaultLayoutId;
              }
              setDraft(next);
              setEditing(true);
            }}
          >
            Reset to default
          </Button>
          <Button variant="ghost" onClick={onClose}>Back</Button>
        </div>
      </div>

      {editing && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3">
          <span className="text-sm">{selected.length} profiles selected</span>
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={bulkLayoutId} onChange={(event) => setBulkLayoutId(event.target.value)} aria-label="Layout for selected profiles">
            {matrix.layouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.name}</option>)}
          </select>
          <Button
            variant="outline"
            disabled={!selected.length || !bulkLayoutId}
            onClick={() => {
              const next = { ...draft };
              for (const profileId of selected) {
                for (const recordType of matrix.recordTypes) next[`${profileId}:${recordType.key}`] = bulkLayoutId;
              }
              setDraft(next);
            }}
          >
            Assign selected profiles
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all profiles"
                  checked={selected.length === matrix.profiles.length && matrix.profiles.length > 0}
                  onChange={(event) => setSelected(event.target.checked ? matrix.profiles.map((profile) => profile.id) : [])}
                />
              </th>
              <th className="px-3 py-2 font-medium">Profile</th>
              {matrix.recordTypes.map((recordType) => (
                <th key={recordType.key} className="px-3 py-2 font-medium">{recordType.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.profiles.map((profile) => (
              <tr key={profile.id} className="border-t">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${profile.name}`}
                    checked={selected.includes(profile.id)}
                    onChange={() => setSelected((current) => current.includes(profile.id) ? current.filter((id) => id !== profile.id) : [...current, profile.id])}
                  />
                </td>
                <td className="px-3 py-2">{profile.name}</td>
                {matrix.recordTypes.map((recordType) => {
                  const key = `${profile.id}:${recordType.key}`;
                  const changed = draft[key] !== saved[key];
                  return (
                    <td key={recordType.key} className={`px-3 py-2 ${changed ? "bg-amber-50" : ""}`}>
                      <select
                        aria-label={`${profile.name} ${recordType.label} layout`}
                        className="h-8 w-full min-w-[12rem] rounded-md border bg-background px-2 text-sm"
                        disabled={!editing}
                        value={draft[key] || ""}
                        onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                      >
                        {matrix.layouts.map((layout) => (
                          <option key={layout.id} value={layout.id}>{layout.name}{layout.isDefault ? " (default)" : ""}</option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
