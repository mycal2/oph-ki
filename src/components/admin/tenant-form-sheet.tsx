"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, MoreHorizontal, Power, PowerOff, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TenantInviteDialog } from "@/components/admin/tenant-invite-dialog";
import type {
  Tenant,
  TenantStatus,
  ErpType,
  TenantUserListItem,
  UserRole,
  UserStatus,
} from "@/lib/types";
import type { CreateTenantInput, UpdateTenantInput } from "@/lib/validations";

const ERP_OPTIONS: { value: ErpType; label: string }[] = [
  { value: "SAP", label: "SAP" },
  { value: "Dynamics365", label: "Dynamics 365" },
  { value: "Sage", label: "Sage" },
  { value: "Custom", label: "Custom" },
];

const STATUS_OPTIONS: { value: TenantStatus; label: string }[] = [
  { value: "active", label: "Aktiv" },
  { value: "inactive", label: "Inaktiv" },
  { value: "trial", label: "Testphase" },
];

const ROLE_LABELS: Record<UserRole, string> = {
  tenant_user: "Benutzer",
  tenant_admin: "Administrator",
  platform_admin: "Platform-Admin",
};

const STATUS_BADGES: Record<UserStatus, { label: string; className: string }> = {
  active: { label: "Aktiv", className: "bg-green-100 text-green-800" },
  inactive: { label: "Inaktiv", className: "text-muted-foreground" },
};

interface TenantFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string | null;
  onSave: (
    data: CreateTenantInput | UpdateTenantInput,
    isNew: boolean
  ) => Promise<Tenant | null>;
  onFetchTenant: (id: string) => Promise<Tenant | null>;
  onFetchUsers: (id: string) => Promise<TenantUserListItem[]>;
  onInviteUser: (email: string, role: "tenant_user" | "tenant_admin") => Promise<{ ok: boolean; error?: string }>;
  onToggleUserStatus: (userId: string, status: "active" | "inactive") => Promise<boolean>;
  isMutating: boolean;
}

/** Auto-generates a URL-safe slug from a name. */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export function TenantFormSheet({
  open,
  onOpenChange,
  tenantId,
  onSave,
  onFetchTenant,
  onFetchUsers,
  onInviteUser,
  onToggleUserStatus,
  isMutating,
}: TenantFormSheetProps) {
  const isNew = !tenantId;

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [erpType, setErpType] = useState<ErpType>("SAP");
  const [status, setStatus] = useState<TenantStatus>("active");

  // UI state
  const [isLoadingTenant, setIsLoadingTenant] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [users, setUsers] = useState<TenantUserListItem[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tenantName, setTenantName] = useState("");

  // Reset form
  const resetForm = useCallback(() => {
    setName("");
    setSlug("");
    setSlugTouched(false);
    setContactEmail("");
    setErpType("SAP");
    setStatus("active");
    setUsers([]);
    setActiveTab("profile");
    setTenantName("");
  }, []);

  // Populate form from tenant data
  const populateForm = useCallback((tenant: Tenant) => {
    setName(tenant.name);
    setSlug(tenant.slug);
    setSlugTouched(true); // Slug is locked for existing tenants
    setContactEmail(tenant.contact_email);
    setErpType(tenant.erp_type);
    setStatus(tenant.status);
    setTenantName(tenant.name);
  }, []);

  // Load tenant on open
  useEffect(() => {
    if (!open) return;

    if (isNew) {
      resetForm();
      return;
    }

    setIsLoadingTenant(true);
    onFetchTenant(tenantId).then((tenant) => {
      if (tenant) {
        populateForm(tenant);
      }
      setIsLoadingTenant(false);
    });
  }, [open, tenantId, isNew, onFetchTenant, populateForm, resetForm]);

  // Load users when switching to users tab
  const loadUsers = useCallback(() => {
    if (isNew || !tenantId) return;
    setIsLoadingUsers(true);
    onFetchUsers(tenantId).then((u) => {
      setUsers(u);
      setIsLoadingUsers(false);
    });
  }, [isNew, tenantId, onFetchUsers]);

  useEffect(() => {
    if (activeTab !== "users") return;
    loadUsers();
  }, [activeTab, loadUsers]);

  // Auto-generate slug from name (only when creating)
  const handleNameChange = (newName: string) => {
    setName(newName);
    if (isNew && !slugTouched) {
      setSlug(generateSlug(newName));
    }
  };

  const handleSlugChange = (newSlug: string) => {
    setSlugTouched(true);
    setSlug(newSlug.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isNew) {
      const data: CreateTenantInput = {
        name,
        slug,
        contact_email: contactEmail,
        erp_type: erpType,
        status,
      };
      const result = await onSave(data, true);
      if (result) {
        onOpenChange(false);
      }
    } else {
      const data: UpdateTenantInput = {
        name,
        contact_email: contactEmail,
        erp_type: erpType,
        status,
      };
      const result = await onSave(data, false);
      if (result) {
        onOpenChange(false);
      }
    }
  };

  const handleToggleUser = async (userId: string, currentStatus: UserStatus) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    const ok = await onToggleUserStatus(userId, newStatus);
    if (ok) {
      loadUsers();
    }
  };

  const handleInvite = async (email: string, role: "tenant_user" | "tenant_admin") => {
    const result = await onInviteUser(email, role);
    if (result.ok) {
      loadUsers();
    }
    return result;
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-0">
            <SheetTitle>
              {isNew ? "Neuen Mandanten anlegen" : "Mandant bearbeiten"}
            </SheetTitle>
          </SheetHeader>

          {isLoadingTenant ? (
            <div className="flex-1 p-6 space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="flex flex-col flex-1 min-h-0"
              >
                <div className="px-6 pt-4">
                  <TabsList className="w-full">
                    <TabsTrigger value="profile" className="flex-1">
                      Profil
                    </TabsTrigger>
                    {!isNew && (
                      <TabsTrigger value="users" className="flex-1">
                        Benutzer
                      </TabsTrigger>
                    )}
                  </TabsList>
                </div>

                <ScrollArea className="flex-1">
                  {/* Tab: Profile */}
                  <TabsContent value="profile" className="px-6 pb-6 space-y-4 mt-0">
                    <div className="space-y-2">
                      <Label htmlFor="tenant-name">Name *</Label>
                      <Input
                        id="tenant-name"
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="z.B. Dental GmbH"
                        required
                        maxLength={200}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tenant-slug">Slug *</Label>
                      <Input
                        id="tenant-slug"
                        value={slug}
                        onChange={(e) => handleSlugChange(e.target.value)}
                        placeholder="z.B. dental-gmbh"
                        required
                        maxLength={50}
                        disabled={!isNew}
                        className={!isNew ? "bg-muted" : ""}
                      />
                      <p className="text-xs text-muted-foreground">
                        {isNew
                          ? "URL-sicherer Bezeichner (Kleinbuchstaben, Zahlen, Bindestriche). Kann nach Erstellung nicht geaendert werden."
                          : "Slug ist nach Erstellung unveraenderlich."}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tenant-email">Kontakt-E-Mail *</Label>
                      <Input
                        id="tenant-email"
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="kontakt@beispiel.de"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tenant-erp">ERP-Typ *</Label>
                      <Select
                        value={erpType}
                        onValueChange={(v) => setErpType(v as ErpType)}
                      >
                        <SelectTrigger id="tenant-erp">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ERP_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tenant-status">Status *</Label>
                      <Select
                        value={status}
                        onValueChange={(v) => setStatus(v as TenantStatus)}
                      >
                        <SelectTrigger id="tenant-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TabsContent>

                  {/* Tab: Users */}
                  {!isNew && (
                    <TabsContent value="users" className="px-6 pb-6 mt-0">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-sm font-medium">
                          Benutzer von {tenantName}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setInviteOpen(true)}
                        >
                          <UserPlus className="mr-1.5 h-4 w-4" />
                          Einladen
                        </Button>
                      </div>

                      {isLoadingUsers ? (
                        <div className="space-y-2">
                          {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full" />
                          ))}
                        </div>
                      ) : users.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                          Noch keine Benutzer vorhanden.
                        </p>
                      ) : (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead className="hidden sm:table-cell">Rolle</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="hidden sm:table-cell">Letzter Login</TableHead>
                                <TableHead className="w-10" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {users.map((u) => {
                                const sBadge = STATUS_BADGES[u.status];
                                return (
                                  <TableRow key={u.id}>
                                    <TableCell>
                                      <span className="font-medium text-sm">
                                        {u.first_name} {u.last_name}
                                      </span>
                                      <p className="text-xs text-muted-foreground">
                                        {u.email}
                                      </p>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell">
                                      <Badge variant="secondary" className="text-xs">
                                        {ROLE_LABELS[u.role]}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      {u.status === "inactive" ? (
                                        <Badge variant="outline" className={`text-xs ${sBadge.className}`}>
                                          {sBadge.label}
                                        </Badge>
                                      ) : (
                                        <Badge variant="secondary" className={`text-xs ${sBadge.className}`}>
                                          {sBadge.label}
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                                      {u.last_sign_in_at
                                        ? new Date(u.last_sign_in_at).toLocaleDateString("de-DE")
                                        : "—"}
                                    </TableCell>
                                    <TableCell>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            type="button"
                                          >
                                            <MoreHorizontal className="h-4 w-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          {u.status === "active" ? (
                                            <DropdownMenuItem
                                              onClick={() => handleToggleUser(u.id, u.status)}
                                              className="text-destructive"
                                            >
                                              <PowerOff className="mr-2 h-4 w-4" />
                                              Deaktivieren
                                            </DropdownMenuItem>
                                          ) : (
                                            <DropdownMenuItem
                                              onClick={() => handleToggleUser(u.id, u.status)}
                                            >
                                              <Power className="mr-2 h-4 w-4" />
                                              Reaktivieren
                                            </DropdownMenuItem>
                                          )}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </TabsContent>
                  )}
                </ScrollArea>

                {/* Footer with save button */}
                <div className="border-t p-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={isMutating}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    type="submit"
                    disabled={isMutating || !name.trim() || !slug.trim() || !contactEmail.trim()}
                  >
                    {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isNew ? "Erstellen" : "Speichern"}
                  </Button>
                </div>
              </Tabs>
            </form>
          )}
        </SheetContent>
      </Sheet>

      {/* Invite dialog — opens on top of the sheet */}
      {!isNew && (
        <TenantInviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          tenantName={tenantName}
          onInvite={handleInvite}
          isMutating={isMutating}
        />
      )}
    </>
  );
}
