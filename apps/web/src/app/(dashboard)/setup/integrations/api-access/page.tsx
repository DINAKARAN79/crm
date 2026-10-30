"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { CompanyApiKeys } from "@/components/crm/company-api-keys";

export default function ApiAccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading, isAuthenticated, isAdmin, isSuperAdmin, tenant } = useAuth();
  const tenantId = isSuperAdmin ? (searchParams.get("tenantId") || tenant?.id || "") : (tenant?.id || "");

  React.useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isAdmin)) {
      router.replace(isAuthenticated ? "/home" : "/login?redirect=/setup/integrations/api-access");
    }
  }, [isAuthenticated, isAdmin, isLoading, router]);

  if (isLoading || !isAuthenticated || !isAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={tenantId && isSuperAdmin ? `/setup?tenantId=${encodeURIComponent(tenantId)}` : "/setup"}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">API access</h1>
          <p className="text-sm text-muted-foreground">One lifetime key for this company. Company Admins see it once; Super Admins can reveal it again after password verification.</p>
        </div>
      </div>
      {tenantId ? <CompanyApiKeys tenantId={tenantId} /> : (
        <p className="text-sm text-muted-foreground">Open a company from Setup Home to manage its API key.</p>
      )}
    </div>
  );
}
