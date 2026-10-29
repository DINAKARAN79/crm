"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/crm/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, MoreHorizontal, Eye, Edit, Trash2, Shield, Users, Settings, UserCog, Briefcase, Building2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "inactive";
  lastLogin: string;
  createdAt: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  userCount: number;
  permissions: string[];
}

const users: User[] = [
  {
    id: "1",
    name: "Rajesh Kumar",
    email: "rajesh@dctcrm.com",
    role: "Admin",
    status: "active",
    lastLogin: "2024-01-15T10:30:00Z",
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "2",
    name: "Priya Sharma",
    email: "priya@dctcrm.com",
    role: "Sales Manager",
    status: "active",
    lastLogin: "2024-01-15T09:15:00Z",
    createdAt: "2024-01-05T00:00:00Z",
  },
  {
    id: "3",
    name: "Amit Verma",
    email: "amit@dctcrm.com",
    role: "Sales Executive",
    status: "active",
    lastLogin: "2024-01-14T16:45:00Z",
    createdAt: "2024-01-10T00:00:00Z",
  },
  {
    id: "4",
    name: "Neha Gupta",
    email: "neha@dctcrm.com",
    role: "Sales Executive",
    status: "inactive",
    lastLogin: "2024-01-10T14:00:00Z",
    createdAt: "2024-01-08T00:00:00Z",
  },
];

const roles: Role[] = [
  {
    id: "1",
    name: "Admin",
    description: "Full access to all CRM features and settings",
    userCount: 2,
    permissions: ["leads", "site-visits", "projects", "tasks", "reports", "admin"],
  },
  {
    id: "2",
    name: "Sales Manager",
    description: "Manage sales team and view reports",
    userCount: 3,
    permissions: ["leads", "site-visits", "reports"],
  },
  {
    id: "3",
    name: "Sales Executive",
    description: "Manage leads and site visits",
    userCount: 5,
    permissions: ["leads", "site-visits", "tasks"],
  },
  {
    id: "4",
    name: "Viewer",
    description: "Read-only access to CRM data",
    userCount: 1,
    permissions: ["leads", "reports"],
  },
];

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
};

const userColumns: ColumnDef<User>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue("name")}</span>
    ),
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => (
      <Badge variant="outline">{row.getValue("role")}</Badge>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <Badge className={statusColors[status]}>
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: "lastLogin",
    header: "Last Login",
    cell: ({ row }) => new Date(row.getValue("lastLogin")).toLocaleString(),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const user = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Eye className="mr-2 h-4 w-4" />
              View
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Shield className="mr-2 h-4 w-4" />
              Reset Password
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Deactivate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

const roleColumns: ColumnDef<Role>[] = [
  {
    accessorKey: "name",
    header: "Role Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue("name")}</span>
    ),
  },
  {
    accessorKey: "description",
    header: "Description",
  },
  {
    accessorKey: "userCount",
    header: "Users",
    cell: ({ row }) => (
      <Badge variant="secondary">{row.getValue("userCount")}</Badge>
    ),
  },
  {
    accessorKey: "permissions",
    header: "Permissions",
    cell: ({ row }) => {
      const permissions = row.getValue("permissions") as string[];
      return (
        <div className="flex flex-wrap gap-1">
          {permissions.slice(0, 3).map((perm) => (
            <Badge key={perm} variant="outline" className="text-xs">
              {perm}
            </Badge>
          ))}
          {permissions.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{permissions.length - 3} more
            </Badge>
          )}
        </div>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const role = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Eye className="mr-2 h-4 w-4" />
              View Permissions
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentTab, setCurrentTab] = React.useState("users");
  const [userPage, setUserPage] = React.useState(1);
  const [rolePage, setRolePage] = React.useState(1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Admin</h1>
          <p className="text-muted-foreground">
            Manage users, roles, and system settings
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/companies">
          <Card className="hover:border-primary hover:shadow-md transition-all cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Company Management</p>
                  <p className="text-xs text-muted-foreground">Manage platform companies and tenants</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/users">
          <Card className="hover:border-primary hover:shadow-md transition-all cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <UserCog className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">User Management</p>
                  <p className="text-xs text-muted-foreground">Create, edit, activate/deactivate users</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/profiles">
          <Card className="hover:border-primary hover:shadow-md transition-all cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Briefcase className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Profile Management</p>
                  <p className="text-xs text-muted-foreground">Manage CRM profiles and permissions</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/object-manager">
          <Card className="hover:border-primary hover:shadow-md transition-all cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Settings className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Object Manager</p>
                  <p className="text-xs text-muted-foreground">Configure CRM objects and fields</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/permission-sets">
          <Card className="hover:border-primary hover:shadow-md transition-all cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Shield className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Permission Sets</p>
                  <p className="text-xs text-muted-foreground">Create and manage reusable permission sets</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

      </div>

      <Tabs value={currentTab} onValueChange={setCurrentTab}>
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-2">
            <Shield className="h-4 w-4" />
            Roles & Permissions
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => router.push("/admin/users")}>
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </div>
          <DataTable
            columns={userColumns}
            data={users}
            searchKey="name"
            searchPlaceholder="Search users..."
            totalItems={users.length}
            currentPage={userPage}
            onPageChange={setUserPage}
          />
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => router.push("/admin/profiles")}>
              <Plus className="mr-2 h-4 w-4" />
              Add Role
            </Button>
          </div>
          <DataTable
            columns={roleColumns}
            data={roles}
            searchKey="name"
            searchPlaceholder="Search roles..."
            totalItems={roles.length}
            currentPage={rolePage}
            onPageChange={setRolePage}
          />
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>System Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Company Name</p>
                  <p className="text-sm text-muted-foreground">DCT CRM</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Default Currency</p>
                  <p className="text-sm text-muted-foreground">INR (₹)</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Date Format</p>
                  <p className="text-sm text-muted-foreground">DD/MM/YYYY</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Timezone</p>
                  <p className="text-sm text-muted-foreground">Asia/Kolkata</p>
                </div>
              </div>
              <Button variant="outline" onClick={() => toast({ title: "Edit Settings", description: "Settings page coming soon" })}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
