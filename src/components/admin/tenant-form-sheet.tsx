"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, MoreHorizontal, Power, PowerOff, UserPlus, Clock, Info, AlertTriangle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TagInput } from "@/components/admin/tag-input";
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
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
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
  // OPH-16: Trial date state (read-only, for display)
  const [trialStartedAt, setTrialStartedAt] = useState<string | null>(null);
  const [trialExpiresAt, setTrialExpiresAt] = useState<string | null>(null);
  // OPH-17: Allowed email domains
  const [allowedEmailDomains, setAllowedEmailDomains] = useState<string[]>([]);
  // OPH-13: Email notifications toggle
  const [emailNotifications, setEmailNotifications] = useState(true);

  // UI state
  const [isLoadingTenant, setIsLoadingTenant] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [users, setUsers] = useState<TenantUserListItem[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tenantName, setTenantName] = useState("");

  // BUG-6: Confirmation dialog state for user deactivation
  const [confirmUserToggle, setConfirmUserToggle] = useState<{
    userId: string;
    userName: string;
    currentStatus: UserStatus;
    action: "deactivate" | "reactivate";
  } | null>(null);

  // Reset form
  const resetForm = useCallback(() => {
    setName("");
    setSlug("");
    setSlugTouched(false);
    setContactEmail("");
    setErpType("SAP");
    setStatus("active");
    setTrialStartedAt(null);
    setTrialExpiresAt(null);
    setAllowedEmailDomains([]);
    setEmailNotifications(true);
    setUsers([]);
    setActiveTab("profile");
    setTenantName("");
    setConfirmUserToggle(null);
  }, []);

  // Populate form from tenant data
  const populateForm = useCallback((tenant: Tenant) => {
    setName(tenant.name);
    setSlug(tenant.slug);
    setSlugTouched(true); // Slug is locked for existing tenants
    setContactEmail(tenant.contact_email);
    setErpType(tenant.erp_type);
    setStatus(tenant.status);
    setTrialStartedAt(tenant.trial_started_at);
    setTrialExpiresAt(tenant.trial_expires_at);
    setAllowedEmailDomains(tenant.allowed_email_domains ?? []);
    setEmailNotifications(tenant.email_notifications_enabled);
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
        allowed_email_domains: allowedEmailDomains,
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
        allowed_email_domains: allowedEmailDomains,
        email_notifications_enabled: emailNotifications,
      };
      const result = await onSave(data, false);
      if (result) {
        onOpenChange(false);
      }
    }
  };

  // BUG-6: Show confirmation dialog before toggling user status
  const handleToggleUser = (userId: string, currentStatus: UserStatus, userName: string) => {
    const action = currentStatus === "active" ? "deactivate" : "reactivate";
    setConfirmUserToggle({ userId, userName, currentStatus, action });
  };

  // BUG-6: Confirm user toggle
  const confirmToggleUser = async () => {
    if (!confirmUserToggle) return;
    const { userId, currentStatus } = confirmUserToggle;
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    const ok = await onToggleUserStatus(userId, newStatus);
    if (ok) {
      loadUsers();
    }
    setConfirmUserToggle(null);
  };

  const handleInvite = async (email: string, role: "tenant_user" | "tenant_admin") => {
    const result = await onInviteUser(email, role);
    if (result.ok) {
      loadUsers();
    }
    return result;
  };

  // OPH-17 BUG-1: Client-side domain validation for TagInput
  const validateDomain = useCallback((domain: string): string | null => {
    const d = domain.toLowerCase();
    if (d.length < 3) return "Domain muss mindestens 3 Zeichen lang sein.";
    if (d.includes("@")) return "Bitte nur die Domain eingeben, ohne @.";
    if (!d.includes(".")) return "Domain muss einen Punkt enthalten (z.B. example.de).";
    if (d.includes("..")) return "Domain darf keine aufeinanderfolgenden Punkte enthalten.";
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(d)) return "Ungueltige Domain (z.B. example.de).";
    return null;
  }, []);

  // OPH-17 BUG-3: Warn when contact_email domain is not usable as fallback
  const contactDomainWarning = useMemo(() => {
    if (allowedEmailDomains.length > 0) return null; // explicit domains configured
    const domain = contactEmail.split("@")[1]?.toLowerCase();
    if (!domain || domain.length < 3 || !domain.includes(".")) {
      return "Ohne konfigurierte Domains und ohne gueltige Kontakt-E-Mail-Domain koennen keine eingehenden E-Mails autorisiert werden.";
    }
    return null;
  }, [contactEmail, allowedEmailDomains]);

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
                      {/* OPH-16: Hint when switching to trial */}
                      {status === "trial" && isNew && (
                        <p className="text-xs text-muted-foreground">
                          Testphase: 28 Tage ab Erstellung. Startdatum und Ablaufdatum
                          werden automatisch gesetzt.
                        </p>
                      )}
                    </div>

                    {/* OPH-16: Trial period info (shown for existing trial tenants) */}
                    {!isNew && status === "trial" && trialStartedAt && trialExpiresAt && (
                      <Alert className="border-primary/30 bg-primary/5">
                        <Info className="h-4 w-4 text-primary" />
                        <AlertDescription>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Testphase gestartet:</span>
                              <span className="font-medium">
                                {new Date(trialStartedAt).toLocaleDateString("de-DE", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Ablaufdatum:</span>
                              <span className={`font-medium ${
                                new Date(trialExpiresAt).getTime() - Date.now() <= 7 * 24 * 60 * 60 * 1000
                                  ? "text-destructive"
                                  : ""
                              }`}>
                                {new Date(trialExpiresAt).toLocaleDateString("de-DE", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                })}
                              </span>
                              {(() => {
                                const days = Math.ceil(
                                  (new Date(trialExpiresAt).getTime() - Date.now()) /
                                    (1000 * 60 * 60 * 24)
                                );
                                if (days <= 0) {
                                  return (
                                    <span className="text-xs font-semibold text-destructive">
                                      (Abgelaufen)
                                    </span>
                                  );
                                }
                                return (
                                  <span className={`text-xs ${days <= 7 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                                    (Noch {days} {days === 1 ? "Tag" : "Tage"})
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* OPH-17: Allowed email domains */}
                    <div className="space-y-2">
                      <Label>Erlaubte E-Mail-Domains</Label>
                      <TagInput
                        value={allowedEmailDomains}
                        onChange={setAllowedEmailDomains}
                        placeholder="z.B. example.de + Enter"
                        maxItems={10}
                        validate={validateDomain}
                      />
                      {allowedEmailDomains.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Kein Eintrag: Domain aus Kontakt-E-Mail wird automatisch verwendet.
                        </p>
                      )}
                      {contactDomainWarning && (
                        <p className="flex items-start gap-1.5 text-xs text-amber-600">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          {contactDomainWarning}
                        </p>
                      )}
                    </div>

                    {/* OPH-13: Email notifications toggle */}
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="email-notifications" className="flex items-center gap-2 text-sm font-medium">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          E-Mail-Benachrichtigungen
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Automatische E-Mails bei Bestellungseingang und nach Extraktion.
                        </p>
                      </div>
                      <Switch
                        id="email-notifications"
                        checked={emailNotifications}
                        onCheckedChange={setEmailNotifications}
                      />
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
                                <TableHead>Rolle</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="hidden sm:table-cell">Letzter Login</TableHead>
                                <TableHead className="w-10" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {users.map((u) => {
                                const sBadge = STATUS_BADGES[u.status];
                                const displayName = [u.first_name, u.last_name].filter(Boolean).join(" ") || "—";
                                return (
                                  <TableRow key={u.id}>
                                    <TableCell>
                                      <span className="font-medium text-sm">
                                        {displayName}
                                      </span>
                                      <p className="text-xs text-muted-foreground">
                                        {u.email}
                                      </p>
                                      {/* BUG-2: Show role and last login on mobile as sub-labels */}
                                      <div className="flex items-center gap-2 mt-1 sm:hidden">
                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                          {ROLE_LABELS[u.role]}
                                        </Badge>
                                        <span className="text-[10px] text-muted-foreground">
                                          {u.last_sign_in_at
                                            ? new Date(u.last_sign_in_at).toLocaleDateString("de-DE")
                                            : "Nie eingeloggt"}
                                        </span>
                                      </div>
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
                                              onClick={() => handleToggleUser(u.id, u.status, displayName)}
                                              className="text-destructive"
                                            >
                                              <PowerOff className="mr-2 h-4 w-4" />
                                              Deaktivieren
                                            </DropdownMenuItem>
                                          ) : (
                                            <DropdownMenuItem
                                              onClick={() => handleToggleUser(u.id, u.status, displayName)}
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

      {/* Invite dialog -- opens on top of the sheet */}
      {!isNew && (
        <TenantInviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          tenantName={tenantName}
          onInvite={handleInvite}
          isMutating={isMutating}
        />
      )}

      {/* BUG-6: Confirmation dialog for user deactivation/reactivation */}
      <AlertDialog
        open={!!confirmUserToggle}
        onOpenChange={(open) => {
          if (!open) setConfirmUserToggle(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmUserToggle?.action === "deactivate"
                ? "Benutzer deaktivieren?"
                : "Benutzer reaktivieren?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmUserToggle?.action === "deactivate" ? (
                <>
                  Sind Sie sicher, dass Sie{" "}
                  <span className="font-semibold">{confirmUserToggle?.userName}</span>{" "}
                  deaktivieren moechten? Der Benutzer kann sich danach nicht mehr
                  einloggen.
                </>
              ) : (
                <>
                  Moechten Sie{" "}
                  <span className="font-semibold">{confirmUserToggle?.userName}</span>{" "}
                  reaktivieren? Der Benutzer kann sich danach wieder einloggen.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmToggleUser}
              className={
                confirmUserToggle?.action === "deactivate"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              {confirmUserToggle?.action === "deactivate"
                ? "Deaktivieren"
                : "Reaktivieren"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
