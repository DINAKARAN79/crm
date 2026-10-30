"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { companyApi } from "@/lib/api";
import { normalizeUserPhone } from "@dct-crm/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Upload, X, Loader2, AlertCircle, ImageOff, UserPlus, Shield, Copy, Download } from "lucide-react";

export default function CompanyFormPage() {
  const { isSuperAdmin } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<{ id: string; name: string; apiKey: string } | null>(null);
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
  const [createAdmin, setCreateAdmin] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    companyCode: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
    timezone: "",
    currency: "",
    description: "",
  });
  const [adminForm, setAdminForm] = React.useState({
    username: "",
    adminName: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
  });

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAdminChange = (field: string, value: string) => {
    setAdminForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Only JPEG, PNG, GIF, and WebP are allowed.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Logo must be under 5MB.", variant: "destructive" });
      return;
    }

    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("Company name is required");
      return;
    }
    if (!form.companyCode.trim()) {
      setError("Company code is required");
      return;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(form.companyCode)) {
      setError("Company code must be alphanumeric with hyphens or underscores");
      return;
    }
    if (!form.email.trim()) {
      setError("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Valid email is required");
      return;
    }
    if (!form.phone.trim()) {
      setError("Phone is required");
      return;
    }

    if (createAdmin) {
      if (!adminForm.username.trim()) {
        setError("Admin username is required");
        return;
      }
      if (!adminForm.email.trim()) {
        setError("Admin email is required");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminForm.email)) {
        setError("Valid admin email is required");
        return;
      }
      if (!adminForm.password) {
        setError("Admin password is required");
        return;
      }
      if (adminForm.password.length < 8) {
        setError("Admin password must be at least 8 characters");
        return;
      }
      if (adminForm.password !== adminForm.confirmPassword) {
        setError("Admin passwords do not match");
        return;
      }
      const adminPhone = normalizeUserPhone(adminForm.phone, form.country);
      if ("error" in adminPhone) {
        setError(adminPhone.error);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload: any = { ...form };
      Object.keys(payload).forEach((key) => {
        if (payload[key] === "") delete payload[key];
      });

      if (createAdmin) {
        payload.initialAdmin = {
          username: adminForm.username,
          adminName: adminForm.adminName,
          email: adminForm.email,
          phone: adminForm.phone,
          password: adminForm.password,
          confirmPassword: adminForm.confirmPassword,
        };
      }

      const res = await companyApi.create(payload);
      if (res.data.success) {
        const companyId = res.data.data.id;
        const apiKey = typeof res.data.apiKey === "string" ? res.data.apiKey : "";

        if (logoFile) {
          try {
            await companyApi.uploadLogo(companyId, logoFile);
          } catch {
            toast({ title: "Logo upload failed", description: "Company was created but logo upload failed.", variant: "destructive" });
          }
        }

        toast({ title: "Company created", description: `${form.name} has been created.${createAdmin ? " Initial admin account created." : ""}` });
        if (apiKey) {
          setCreated({ id: companyId, name: form.name, apiKey });
        } else {
          router.push(`/admin/companies/${companyId}`);
        }
      } else {
        setError(res.data.error || "Failed to create company");
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to create company");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyCreatedKey = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.apiKey);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard access is unavailable.", variant: "destructive" });
    }
  };

  const downloadCreatedKey = () => {
    if (!created) return;
    const blob = new Blob([`Save this key now. It will not be shown again.\n\n${created.apiKey}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dct-api-key.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (created) {
    return (
      <div className="w-full min-w-0 space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Company created</h1>
          <p className="text-muted-foreground">{created.name} is ready. Its API key was generated by the system.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Save this key now. It will not be shown again.</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <code className="block break-all rounded-md border bg-muted p-3 text-sm">{created.apiKey}</code>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void copyCreatedKey()}>
                <Copy className="mr-1.5 h-4 w-4" /> Copy
              </Button>
              <Button type="button" variant="outline" onClick={downloadCreatedKey}>
                <Download className="mr-1.5 h-4 w-4" /> Download as .txt
              </Button>
              <Button type="button" onClick={() => router.push(`/admin/companies/${created.id}`)}>Continue</Button>
            </div>
            <p className="text-sm text-muted-foreground">If you leave without saving it, open the company API page and click Rotate to issue a new one.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground mt-2">Super Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Create Company</h1>
          <p className="text-muted-foreground">Add a new company to the platform</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Company Logo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="h-24 w-24 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden bg-muted">
                {logoPreview ? (
                  <img src={logoPreview} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <ImageOff className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="logo-upload">
                  <Button type="button" variant="outline" asChild>
                    <span className="cursor-pointer">
                      <Upload className="mr-2 h-4 w-4" />
                      Choose Logo
                    </span>
                  </Button>
                </label>
                <input
                  id="logo-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleLogoChange}
                  className="hidden"
                />
                {logoFile && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">{logoFile.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">JPEG, PNG, GIF, WebP. Max 5MB.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Company Name <span className="text-destructive">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Acme Corporation"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Company Code <span className="text-destructive">*</span></label>
              <input
                type="text"
                value={form.companyCode}
                onChange={(e) => handleChange("companyCode", e.target.value)}
                placeholder="ACME-CORP"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                required
              />
              <p className="text-xs text-muted-foreground">Unique identifier. Alphanumeric, hyphens, underscores only.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email <span className="text-destructive">*</span></label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="contact@acme.com"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone <span className="text-destructive">*</span></label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                placeholder="+1 234 567 890"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Website</label>
              <input
                type="text"
                inputMode="url"
                value={form.website}
                onChange={(e) => handleChange("website", e.target.value)}
                placeholder="https://acme.com"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Address</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => handleChange("address", e.target.value)}
                placeholder="123 Main Street"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">City</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => handleChange("city", e.target.value)}
                placeholder="New York"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">State</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => handleChange("state", e.target.value)}
                placeholder="New York"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Country</label>
              <input
                type="text"
                value={form.country}
                onChange={(e) => handleChange("country", e.target.value)}
                placeholder="United States"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Postal Code</label>
              <input
                type="text"
                value={form.postalCode}
                onChange={(e) => handleChange("postalCode", e.target.value)}
                placeholder="10001"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Timezone</label>
              <input
                type="text"
                value={form.timezone}
                onChange={(e) => handleChange("timezone", e.target.value)}
                placeholder="America/New_York"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Currency</label>
              <input
                type="text"
                value={form.currency}
                onChange={(e) => handleChange("currency", e.target.value)}
                placeholder="USD"
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="Brief description of the company..."
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Initial Admin Account
            </CardTitle>
            <Button
              type="button"
              variant={createAdmin ? "destructive" : "outline"}
              size="sm"
              onClick={() => setCreateAdmin(!createAdmin)}
            >
              {createAdmin ? "Skip Admin" : "Create Admin"}
            </Button>
          </CardHeader>
          <CardContent>
            {!createAdmin ? (
              <p className="text-sm text-muted-foreground">
                Optionally create the first Admin account for this company during creation. You can also create users later.
              </p>
            ) : (
              <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Username <span className="text-destructive">*</span></label>
                    <input
                      type="text"
                      value={adminForm.username}
                      onChange={(e) => handleAdminChange("username", e.target.value)}
                      placeholder="admin_username"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Admin Name</label>
                    <input
                      type="text"
                      value={adminForm.adminName}
                      onChange={(e) => handleAdminChange("adminName", e.target.value)}
                      placeholder="John Smith"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">Admin Phone <span className="text-destructive">*</span></label>
                    <input
                      type="tel"
                      value={adminForm.phone}
                      onChange={(e) => handleAdminChange("phone", e.target.value)}
                      placeholder="+91 98765 43210"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">Admin Email <span className="text-destructive">*</span></label>
                    <input
                      type="email"
                      value={adminForm.email}
                      onChange={(e) => handleAdminChange("email", e.target.value)}
                      placeholder="admin@company.com"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Password <span className="text-destructive">*</span></label>
                    <input
                      type="password"
                      value={adminForm.password}
                      onChange={(e) => handleAdminChange("password", e.target.value)}
                      placeholder="Min 8 characters"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Confirm Password <span className="text-destructive">*</span></label>
                    <input
                      type="password"
                      value={adminForm.confirmPassword}
                      onChange={(e) => handleAdminChange("confirmPassword", e.target.value)}
                      placeholder="Confirm password"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Shield className="h-3.5 w-3.5" />
                  The admin will be linked to this company and receive the Admin profile. Password is hashed server-side.
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Create Company
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
