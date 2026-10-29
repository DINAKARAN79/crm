"use client";

import { formatDate, formatDateTime } from "@/lib/date-format";

import * as React from "react";

import { useRouter, useParams } from "next/navigation";

import { useAuth } from "@/contexts/auth-context";

import { companyApi, fetchAuthenticatedImage } from "@/lib/api";

import { CompanyImpersonationPanel, CompanySetupHomeButton } from "@/components/crm/company-setup-home";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import { useToast } from "@/hooks/use-toast";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  ArrowLeft,
  Edit,
  Power,
  PowerOff,
  Upload,
  X,
  Loader2,
  AlertCircle,
  ImageOff,
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  Clock,
  DollarSign,
  Users,
  UserCheck,
  Calendar,
  Settings,
  AlertTriangle,
  Shield,
  Search,
  KeyRound,
} from "lucide-react";

type CompanyStatisticType = "users" | "roles" | "leads" | "projects";

interface CompanyStatisticRecord {
  id: string;
  name?: string;
  number?: string | null;
  email?: string | null;
  phone?: string | null;
  isActive?: boolean;
  profile?: string;
  roles?: string[];
  description?: string | null;
  userCount?: number;
  totalUnits?: number | null;
  projectType?: string | null;
  company?: string;
  status?: string;
  createdAt?: string;
}

interface ProfileBreakdown {
  profileId: string;
  profileName: string;
  isAdmin: boolean;
  count: number;
}

interface CapacityData {
  maxTotalUsers: number;
  maxAdminUsers: number;
  currentTotalUsers: number;
  currentAdminUsers: number;
  availableSlots: number;
  availableAdminSlots: number;
  profileBreakdown: ProfileBreakdown[];
  noProfileUsers: number;
}

interface CompanyDetails {
  id: string;
  name: string;
  companyCode: string;
  slug: string;
  email?: string;
  phone?: string;
  website?: string;
  logo?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  timezone?: string;
  currency?: string;
  description?: string;
  isActive: boolean;
  companyStartDate?: string | null;
  companyExpiryDate?: string | null;
  lifecycleStatus?: string;
  adminUserCount?: number;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  _count: {
    users: number;
    roles: number;
    leads: number;
    projects: number;
  };
}

export default function CompanyDetailsPage() {
  const { isSuperAdmin, isAdmin } = useAuth();
  const router = useRouter();
  const params = useParams();
  const companyId = params.id as string;
  const { toast } = useToast();
  const [company, setCompany] = React.useState<CompanyDetails | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = React.useState<string>();
  const [capacity, setCapacity] = React.useState<CapacityData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statusTarget, setStatusTarget] = React.useState<"activate" | "deactivate" | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = React.useState(false);
  const [showCapacityEdit, setShowCapacityEdit] = React.useState(false);
  const [capacityForm, setCapacityForm] = React.useState({ maxTotalUsers: 10, maxAdminUsers: 2 });
  const [isSavingCapacity, setIsSavingCapacity] = React.useState(false);
  const [selectedStatistic, setSelectedStatistic] = React.useState<CompanyStatisticType | null>(null);
  const [statisticSearch, setStatisticSearch] = React.useState("");
  const [debouncedStatisticSearch, setDebouncedStatisticSearch] = React.useState("");
  const [statisticPage, setStatisticPage] = React.useState(1);
  const [statisticTotalPages, setStatisticTotalPages] = React.useState(1);
  const [statisticRecords, setStatisticRecords] = React.useState<CompanyStatisticRecord[]>([]);
  const [isLoadingStatistic, setIsLoadingStatistic] = React.useState(false);
  const [statisticError, setStatisticError] = React.useState<string | null>(null);
  const [passwordResetUserId, setPasswordResetUserId] = React.useState<string | null>(null);
  const [resetPassword, setResetPassword] = React.useState("");
  const [confirmResetPassword, setConfirmResetPassword] = React.useState("");
  const [isResettingPassword, setIsResettingPassword] = React.useState(false);

  const fetchCompany = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [companyRes, capacityRes] = await Promise.all([
        companyApi.get(companyId),
        companyApi.getCapacity(companyId),
      ]);
      if (companyRes.data.success) {
        setCompany(companyRes.data.data);
      } else {
        setError(companyRes.data.error || "Company not found");
      }
      if (capacityRes.data.success) {
        const capData = capacityRes.data.data as CapacityData;
        setCapacity(capData);
        setCapacityForm({ maxTotalUsers: capData.maxTotalUsers, maxAdminUsers: capData.maxAdminUsers });
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load company");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  React.useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  React.useEffect(() => {
    if (!company?.logo) {
      setCompanyLogoUrl(undefined);
      return;
    }

    let active = true;
    let objectUrl: string | undefined;
    void fetchAuthenticatedImage(`/api/proxy/api/super-admin/logos/${company.logo}`)
      .then((url) => {
        objectUrl = url;
        if (active) setCompanyLogoUrl(url);
        else URL.revokeObjectURL(url);
      })
      .catch((error) => {
        console.error("Unable to load company logo", error);
        if (active) setCompanyLogoUrl(undefined);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [company?.logo]);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedStatisticSearch(statisticSearch.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [statisticSearch]);

  React.useEffect(() => {
    if (!selectedStatistic) return;
    let isCurrentRequest = true;
    setIsLoadingStatistic(true);
    setStatisticError(null);
    companyApi.statistics(companyId, selectedStatistic, {
      page: statisticPage,
      limit: 20,
      search: debouncedStatisticSearch,
    }).then((response) => {
      if (!isCurrentRequest) return;
      if (response.data.success) {
        setStatisticRecords(response.data.data || []);
        setStatisticTotalPages(response.data.pagination?.totalPages || 1);
      } else {
        setStatisticError(response.data.error || "Failed to load company records");
      }
    }).catch((err: any) => {
      if (isCurrentRequest) {
        setStatisticError(err?.response?.data?.error || "Failed to load company records");
      }
    }).finally(() => {
      if (isCurrentRequest) setIsLoadingStatistic(false);
    });
    return () => {
      isCurrentRequest = false;
    };
  }, [companyId, debouncedStatisticSearch, selectedStatistic, statisticPage]);

  const openStatistic = (type: CompanyStatisticType) => {
    setSelectedStatistic(type);
    setStatisticSearch("");
    setDebouncedStatisticSearch("");
    setStatisticPage(1);
    setStatisticRecords([]);
    setPasswordResetUserId(null);
    setResetPassword("");
    setConfirmResetPassword("");
  };

  const handleUserPasswordReset = async (userId: string) => {
    if (resetPassword.length < 8) {
      toast({ title: "Invalid password", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (resetPassword !== confirmResetPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }

    setIsResettingPassword(true);
    try {
      const response = await companyApi.resetUserPassword(companyId, userId, resetPassword);
      if (!response.data.success) {
        toast({ title: "Password reset failed", description: response.data.error || "Failed to reset user password.", variant: "destructive" });
        return;
      }
      toast({ title: "Password reset", description: "The user's password has been updated." });
      setPasswordResetUserId(null);
      setResetPassword("");
      setConfirmResetPassword("");
    } catch (err: any) {
      toast({ title: "Password reset failed", description: err?.response?.data?.error || "Failed to reset user password.", variant: "destructive" });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !company) return;
    setIsUploadingLogo(true);
    try {
      const res = await companyApi.uploadLogo(company.id, file);
      if (res.data.success) {
        toast({ title: "Logo uploaded" });
        fetchCompany();
      } else {
        toast({ title: "Upload failed", description: res.data.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.response?.data?.error || "Failed", variant: "destructive" });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!company) return;
    try {
      const res = await companyApi.removeLogo(company.id);
      if (res.data.success) {
        toast({ title: "Logo removed" });
        fetchCompany();
      }
    } catch (err: any) {
      toast({ title: "Remove failed", description: err?.response?.data?.error || "Failed", variant: "destructive" });
    }
  };

  const handleStatusToggle = async () => {
    if (!company || !statusTarget) return;
    try {
      const res = statusTarget === "deactivate"
        ? await companyApi.deactivate(company.id)
        : await companyApi.activate(company.id);
      if (res.data.success) {
        toast({ title: statusTarget === "deactivate" ? "Company deactivated" : "Company activated" });
        setStatusTarget(null);
        fetchCompany();
      }
    } catch (err: any) {
      toast({ title: "Status change failed", description: err?.response?.data?.error || "Failed", variant: "destructive" });
    }
  };

  const handleSaveCapacity = async () => {
    setIsSavingCapacity(true);
    try {
      const res = await companyApi.updateCapacity(companyId, capacityForm);
      if (res.data.success) {
        toast({ title: "Capacity updated", description: res.data.message || "User limits updated successfully" });
        setShowCapacityEdit(false);
        fetchCompany();
      } else {
        toast({ title: "Update failed", description: res.data.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Update failed", description: err?.response?.data?.error || "Failed", variant: "destructive" });
    } finally {
      setIsSavingCapacity(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground mt-2">Super Admin access required.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold">Error</h2>
        <p className="text-muted-foreground mt-2">{error || "Company not found"}</p>
        <Button className="mt-4" onClick={() => router.push("/admin/companies")}>
          Back to Companies
        </Button>
      </div>
    );
  }

  const totalExceeded = capacity ? capacity.currentTotalUsers > capacity.maxTotalUsers : false;

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{company.name}</h1>
            <p className="text-muted-foreground">{company.companyCode}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push(`/admin/companies/${company.id}/edit`)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <CompanySetupHomeButton tenantId={company.id} />
          <Button
            variant="outline"
            onClick={() => setStatusTarget(company.isActive ? "deactivate" : "activate")}
          >
            {company.isActive ? (
              <>
                <PowerOff className="mr-2 h-4 w-4 text-amber-600" />
                Deactivate
              </>
            ) : (
              <>
                <Power className="mr-2 h-4 w-4 text-green-600" />
                Activate
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardContent className="p-6">
            <div className="flex flex-col items-center gap-4">
              <div className="relative h-32 w-32 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden bg-muted">
                {company.logo && companyLogoUrl ? (
                  <>
                    <img
                      src={companyLogoUrl}
                      alt={company.name}
                      className="h-full w-full object-cover"
                    />
                    <button
                      onClick={handleRemoveLogo}
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : isUploadingLogo ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : (
                  <ImageOff className="h-12 w-12 text-muted-foreground" />
                )}
              </div>
              <label className="cursor-pointer">
                <Button variant="outline" size="sm" asChild disabled={isUploadingLogo}>
                  <span>
                    <Upload className="mr-2 h-3 w-3" />
                    {company.logo ? "Replace Logo" : "Upload Logo"}
                  </span>
                </Button>
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <div className="text-center space-y-2">
                <Badge className={
                  company.lifecycleStatus === "active" ? "bg-green-100 text-green-800" :
                  company.lifecycleStatus === "pending" ? "bg-blue-100 text-blue-800" :
                  company.lifecycleStatus === "expired" ? "bg-red-100 text-red-800" :
                  "bg-gray-100 text-gray-800"
                }>
                  {company.lifecycleStatus === "active" ? "Active" :
                   company.lifecycleStatus === "pending" ? "Pending" :
                   company.lifecycleStatus === "expired" ? "Expired" :
                   company.isActive ? "Active" : "Inactive"}
                </Badge>
                {!company.isActive && (
                  <Badge variant="outline" className="text-xs">Manually Deactivated</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Company Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {company.description && (
              <div className="md:col-span-2 space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Description</p>
                <p className="text-sm">{company.description}</p>
              </div>
            )}
            <InfoItem icon={Mail} label="Email" value={company.email} />
            <InfoItem icon={Phone} label="Phone" value={company.phone} />
            <InfoItem icon={Globe} label="Website" value={company.website} />
            <InfoItem icon={Clock} label="Timezone" value={company.timezone} />
            <InfoItem icon={DollarSign} label="Currency" value={company.currency} />
            <InfoItem icon={MapPin} label="Country" value={company.country} />
            <InfoItem icon={Calendar} label="Start Date" value={company.companyStartDate ? formatDate(company.companyStartDate) : undefined} />
            <InfoItem icon={Calendar} label="Expiry Date" value={company.companyExpiryDate ? formatDate(company.companyExpiryDate) : undefined} />
            <InfoItem icon={Shield} label="Admin Users" value={company.adminUserCount !== undefined ? String(company.adminUserCount) : undefined} />
            {company.address && (
              <div className="md:col-span-2 space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Address</p>
                <p className="text-sm">
                  {[company.address, company.city, company.state, company.postalCode, company.country]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {capacity && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                User Capacity
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setShowCapacityEdit(!showCapacityEdit)}>
                <Settings className="mr-2 h-3.5 w-3.5" />
                Configure
              </Button>
            </CardHeader>
            <CardContent>
              {totalExceeded && (
                <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 mb-4 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Current users exceed the configured limit. New user creation is blocked until usage is within the configured limit.
                </div>
              )}

              {showCapacityEdit ? (
                <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Maximum Total Users</label>
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={capacityForm.maxTotalUsers}
                        onChange={(e) => setCapacityForm({ ...capacityForm, maxTotalUsers: parseInt(e.target.value) || 1 })}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Maximum Admin Users</label>
                      <input
                        type="number"
                        min={0}
                        max={10000}
                        value={capacityForm.maxAdminUsers}
                        onChange={(e) => setCapacityForm({ ...capacityForm, maxAdminUsers: parseInt(e.target.value) || 0 })}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveCapacity} disabled={isSavingCapacity}>
                      {isSavingCapacity && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowCapacityEdit(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <CapacityCard
                    label="Total Users"
                    current={capacity.currentTotalUsers}
                    max={capacity.maxTotalUsers}
                    exceeded={totalExceeded}
                  />
                  <CapacityCard
                    label="Admin Users"
                    current={capacity.currentAdminUsers}
                    max={capacity.maxAdminUsers}
                    exceeded={capacity.currentAdminUsers > capacity.maxAdminUsers}
                  />
                  <StatCard
                    label="Available Users"
                    value={capacity.availableSlots}
                    icon={Users}
                    highlight={capacity.availableSlots === 0}
                  />
                  <StatCard
                    label="Available Admin Slots"
                    value={capacity.availableAdminSlots}
                    icon={UserCheck}
                    highlight={capacity.availableAdminSlots === 0}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Profile Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {capacity.profileBreakdown.length === 0 && capacity.noProfileUsers === 0 ? (
                <p className="text-sm text-muted-foreground">No active users in this company.</p>
              ) : (
                <div className="space-y-2">
                  {capacity.profileBreakdown.map((p) => (
                    <div key={p.profileId} className="flex items-center justify-between rounded-lg border px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{p.profileName}</span>
                        {p.isAdmin && (
                          <Badge variant="secondary" className="text-xs">Admin</Badge>
                        )}
                      </div>
                      <span className="text-sm font-mono font-semibold">{p.count}</span>
                    </div>
                  ))}
                  {capacity.noProfileUsers > 0 && (
                    <div className="flex items-center justify-between rounded-lg border px-4 py-2">
                      <span className="text-sm font-medium text-muted-foreground">No Profile Assigned</span>
                      <span className="text-sm font-mono font-semibold">{capacity.noProfileUsers}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between rounded-lg border px-4 py-2 bg-muted/50 font-semibold">
                    <span className="text-sm">Total</span>
                    <span className="text-sm font-mono">{capacity.currentTotalUsers}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

        </>
      )}

      <CompanyImpersonationPanel tenantId={company.id} />

      <Card>
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatItem icon={Users} label="Users" value={company._count.users} onClick={() => openStatistic("users")} />
            <StatItem icon={Building2} label="Roles" value={company._count.roles} onClick={() => openStatistic("roles")} />
            <StatItem icon={Building2} label="Leads" value={company._count.leads} onClick={() => openStatistic("leads")} />
            <StatItem icon={Building2} label="Projects" value={company._count.projects} onClick={() => openStatistic("projects")} />
          </div>
        </CardContent>
      </Card>

      {selectedStatistic && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedStatistic(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="company-statistic-title"
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl"
          >
            <header className="sticky top-0 z-10 shrink-0 border-b bg-background px-5 py-4 pr-14">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="company-statistic-title" className="text-lg font-semibold capitalize">
                    {selectedStatistic} · {company.name}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Search {selectedStatistic} for this company.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close company records"
                  onClick={() => setSelectedStatistic(null)}
                  className="absolute right-3 top-3"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={statisticSearch}
                  onChange={(event) => {
                    setStatisticSearch(event.target.value);
                    setStatisticPage(1);
                  }}
                  placeholder={`Search ${selectedStatistic}...`}
                  aria-label={`Search ${selectedStatistic}`}
                  className="h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {isLoadingStatistic ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                </div>
              ) : statisticError ? (
                <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{statisticError}</span>
                </div>
              ) : statisticRecords.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {statisticSearch ? "No matching records found." : `No ${selectedStatistic} found for this company.`}
                </p>
              ) : selectedStatistic === "users" ? (
                <div className="space-y-3">
                  {statisticRecords.map((record) => (
                    <article key={record.id} className="rounded-lg border p-4">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div className="min-w-0 space-y-1">
                          <h3 className="font-medium">{record.name}</h3>
                          <p className="break-all text-sm text-muted-foreground">{record.email}</p>
                          <p className="text-sm text-muted-foreground">
                            Profile: {record.profile} · Roles: {record.roles?.join(", ") || "None"}
                          </p>
                          <Badge variant="outline">{record.isActive ? "Active" : "Inactive"}</Badge>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPasswordResetUserId(passwordResetUserId === record.id ? null : record.id);
                            setResetPassword("");
                            setConfirmResetPassword("");
                          }}
                        >
                          <KeyRound className="mr-2 h-4 w-4" />
                          Forgot Password
                        </Button>
                      </div>
                      {passwordResetUserId === record.id && (
                        <form
                          className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
                          onSubmit={(event) => {
                            event.preventDefault();
                            handleUserPasswordReset(record.id);
                          }}
                        >
                          <label className="space-y-1 text-sm">
                            <span className="font-medium">Temporary password</span>
                            <input
                              type="password"
                              autoComplete="new-password"
                              minLength={8}
                              required
                              value={resetPassword}
                              onChange={(event) => setResetPassword(event.target.value)}
                              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            />
                          </label>
                          <label className="space-y-1 text-sm">
                            <span className="font-medium">Confirm password</span>
                            <input
                              type="password"
                              autoComplete="new-password"
                              minLength={8}
                              required
                              value={confirmResetPassword}
                              onChange={(event) => setConfirmResetPassword(event.target.value)}
                              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            />
                          </label>
                          <Button type="submit" size="sm" disabled={isResettingPassword}>
                            {isResettingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Reset
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={isResettingPassword}
                            onClick={() => {
                              setPasswordResetUserId(null);
                              setResetPassword("");
                              setConfirmResetPassword("");
                            }}
                          >
                            Cancel
                          </Button>
                        </form>
                      )}
                    </article>
                  ))}
                </div>
              ) : selectedStatistic === "roles" ? (
                <div className="space-y-3">
                  {statisticRecords.map((record) => (
                    <article key={record.id} className="rounded-lg border p-4">
                      <h3 className="font-medium">{record.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{record.description || "No description"}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{record.userCount} users assigned</p>
                    </article>
                  ))}
                </div>
              ) : selectedStatistic === "leads" ? (
                <div className="space-y-3">
                  {statisticRecords.map((record) => (
                    <article key={record.id} className="rounded-lg border p-4">
                      <h3 className="font-medium">{record.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[record.number, record.company, record.email, record.phone].filter(Boolean).join(" · ") || "No additional details"}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {record.status}{record.createdAt ? ` · Created ${formatDate(record.createdAt)}` : ""}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {statisticRecords.map((record) => (
                    <article key={record.id} className="rounded-lg border p-4">
                      <h3 className="font-medium">{record.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[record.description, record.projectType].filter(Boolean).join(" · ") || "No additional details"}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {record.status}{record.totalUnits != null ? ` · ${record.totalUnits} total units` : ""}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <footer className="flex shrink-0 items-center justify-between border-t bg-background px-5 py-3">
              <p className="text-sm text-muted-foreground">Page {statisticPage} of {statisticTotalPages}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={statisticPage <= 1 || isLoadingStatistic}
                  onClick={() => setStatisticPage((page) => page - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={statisticPage >= statisticTotalPages || isLoadingStatistic}
                  onClick={() => setStatisticPage((page) => page + 1)}
                >
                  Next
                </Button>
              </div>
            </footer>
          </section>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Audit Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Created</p>
            <p className="text-sm">{formatDateTime(company.createdAt)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Last Modified</p>
            <p className="text-sm">{formatDateTime(company.updatedAt)}</p>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!statusTarget} onOpenChange={() => setStatusTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget === "deactivate" ? "Deactivate" : "Activate"} Company
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget === "deactivate"
                ? "Company users will be blocked from logging in."
                : "Company users will be able to log in again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleStatusToggle}>
              {statusTarget === "deactivate" ? "Deactivate" : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="text-sm">{value || "\u2014"}</p>
    </div>
  );
}

function StatItem({ icon: Icon, label, value, onClick }: { icon: React.ElementType; label: string; value: number; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border p-3 text-center transition-colors hover:border-primary/50 hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      <Icon className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </button>
  );
}

function CapacityCard({ label, current, max, exceeded }: { label: string; current: number; max: number; exceeded: boolean }) {
  const percentage = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  return (
    <div className={`rounded-lg border p-4 ${exceeded ? "border-amber-400 bg-amber-50" : ""}`}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-1 mt-1">
        <span className={`text-xl font-semibold ${exceeded ? "text-amber-600" : ""}`}>{current}</span>
        <span className="text-sm text-muted-foreground">/ {max}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${exceeded ? "bg-amber-500" : percentage > 80 ? "bg-orange-500" : "bg-primary"}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, highlight }: { label: string; value: number; icon: React.ElementType; highlight: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "border-amber-400 bg-amber-50" : ""}`}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 mt-1">
        <Icon className={`h-5 w-5 ${highlight ? "text-amber-600" : "text-muted-foreground"}`} />
        <span className={`text-xl font-semibold ${highlight ? "text-amber-600" : ""}`}>{value}</span>
      </div>
    </div>
  );
}
