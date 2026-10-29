"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Menu, LogOut, List, UserRound } from "lucide-react";
import { GlobalSearch } from "@/components/crm/global-search";
import { useAuth } from "@/contexts/auth-context";
import { profileApi } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AdminHomeProfile {
  id: string;
  name: string;
}

function profileSlug(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function responseItems(response: any) {
  const data = response?.data?.data ?? response?.data;
  return Array.isArray(data) ? data : data?.profiles ?? [];
}

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();
  const { user, profile, roles = [], tenant, logout, isAdmin, isSuperAdmin } = useAuth();
  const searchParams = useSearchParams();
  const isAuthenticated = Boolean(user);
  const showHomeSelector = isAuthenticated && isAdmin && !isSuperAdmin;
  const [adminHomeOpen, setAdminHomeOpen] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const [userDetailsOpen, setUserDetailsOpen] = React.useState(false);
  const [adminProfiles, setAdminProfiles] = React.useState<AdminHomeProfile[]>([]);
  const dropdownRefreshId = React.useRef(0);

  const refreshAdminDropdownData = React.useCallback(() => {
    if (!isAuthenticated || !isAdmin || isSuperAdmin) {
      dropdownRefreshId.current += 1;
      setAdminProfiles([]);
      return;
    }

    const refreshId = ++dropdownRefreshId.current;
    profileApi.list({ limit: 100 })
      .then((profilesResponse) => {
        const profileItems = responseItems(profilesResponse) as Array<{ id?: string; name?: string }>;
        const uniqueProfiles: AdminHomeProfile[] = Array.from(
          new Map(
            profileItems
              .filter((item) => !!item?.id && !!item?.name)
              .map((item) => [item.id as string, { id: item.id as string, name: item.name as string }])
          ).values()
        ).sort((a, b) => a.name.localeCompare(b.name));

        if (refreshId === dropdownRefreshId.current) {
          setAdminProfiles(uniqueProfiles);
        }
      })
      .catch((error) => {
        console.error("Failed to load admin profiles:", error);
      });
  }, [isAdmin, isAuthenticated, isSuperAdmin]);

  React.useEffect(() => {
    refreshAdminDropdownData();
  }, [refreshAdminDropdownData]);

  const userName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User"
    : "User";
  const profileName = profile?.name || (isSuperAdmin ? "Superadmin" : "Not assigned");

  const handleLogout = async () => {
    await logout();
  };

  const selectedProfileId = searchParams.get("profileId");
  const selectedProfile = adminProfiles.find((item) => item.id === selectedProfileId);

  const handleProfileNavigation = (selected: AdminHomeProfile) => {
    setAdminHomeOpen(false);
    const profileParams = new URLSearchParams({
      profileId: selected.id,
      profileLabel: selected.name,
    });
    router.push(`/profiles/${profileSlug(selected.name)}?${profileParams}`);
  };

  const handleAdminHomeNavigation = () => {
    setAdminHomeOpen(false);
    router.push("/dashboard");
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 min-w-0 max-w-full items-center gap-2 border-b border-sky-100 bg-[#eef8ff] px-3 sm:gap-3 sm:px-4">
        <Button variant="ghost" size="icon" onClick={onMenuClick} className="shrink-0 lg:hidden" aria-label="Open navigation menu">
          <Menu className="h-4 w-4" />
        </Button>
        <div className="flex min-w-0 flex-1 justify-center">
          <div className="w-full min-w-0 max-w-3xl">
            <GlobalSearch />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {showHomeSelector && (
            <DropdownMenu
              modal={false}
              open={adminHomeOpen}
              onOpenChange={(isOpen) => {
                setAdminHomeOpen(isOpen);
                if (isOpen) {
                  refreshAdminDropdownData();
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={selectedProfile?.name || "Admin Home"}
                  title={selectedProfile?.name || "Admin Home"}
                  className="h-9 w-9 shrink-0"
                >
                  <List className="h-5 w-5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[70vh] w-64 overflow-y-auto">
                <DropdownMenuItem onSelect={handleAdminHomeNavigation} className="text-sm">
                  Admin Home
                </DropdownMenuItem>
                {adminProfiles.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Profiles</DropdownMenuLabel>
                    {adminProfiles.map((item) => (
                      <DropdownMenuItem
                        key={`profile-${item.id}`}
                        onSelect={() => handleProfileNavigation(item)}
                        className="text-sm"
                      >
                        {item.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <span className="max-w-[7rem] truncate px-2 text-sm sm:max-w-[10rem]">
            {profileName}
          </span>
          <DropdownMenu modal={false} open={userMenuOpen} onOpenChange={setUserMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 shrink-0 rounded-full p-0" aria-label="Open user menu">
                <Avatar className="h-9 w-9">
                  {user?.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
                  <AvatarFallback className="bg-sky-100 text-[#075d91]">
                    <UserRound className="h-5 w-5" aria-hidden="true" />
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onSelect={() => {
                  setUserMenuOpen(false);
                  setUserDetailsOpen(true);
                }}
                className="h-auto items-start py-2"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-medium">{userName}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{user?.email || ""}</span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <Dialog open={userDetailsOpen} onOpenChange={setUserDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{userName}</DialogTitle>
            <DialogDescription>Logged-in user profile details</DialogDescription>
          </DialogHeader>
          <dl className="grid gap-3 text-sm">
              {user?.id && (
                <div>
                  <dt className="text-muted-foreground">User ID</dt>
                  <dd className="break-all font-medium">{user.id}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium">{user?.email || "Not provided"}</dd>
            </div>
            {user?.phone && (
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="font-medium">{user.phone}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Profile</dt>
              <dd className="font-medium">{profileName}</dd>
            </div>
            {profile?.description && (
              <div>
                <dt className="text-muted-foreground">Profile description</dt>
                <dd className="font-medium">{profile.description}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Account type</dt>
              <dd className="font-medium">{isSuperAdmin ? "Super Admin" : "Company user"}</dd>
            </div>
            {roles.length > 0 && (
              <div>
                <dt className="text-muted-foreground">Roles</dt>
                <dd className="font-medium">{roles.join(", ")}</dd>
              </div>
            )}
            {tenant?.name && (
              <div>
                <dt className="text-muted-foreground">Company</dt>
                <dd className="font-medium">{tenant.name}</dd>
              </div>
            )}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}