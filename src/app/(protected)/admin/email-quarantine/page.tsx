"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { ShieldAlert, CheckCircle, XCircle, RotateCcw, Inbox } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import { toast } from "sonner";
import type {
  ApiResponse,
  EmailQuarantineListItem,
  QuarantineReviewStatus,
} from "@/lib/types";

function StatusBadge({ status }: { status: QuarantineReviewStatus }) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="outline" className="text-yellow-600 border-yellow-300">
          Ausstehend
        </Badge>
      );
    case "approved":
      return (
        <Badge variant="outline" className="text-green-600 border-green-300">
          Freigegeben
        </Badge>
      );
    case "rejected":
      return (
        <Badge variant="outline" className="text-red-600 border-red-300">
          Abgelehnt
        </Badge>
      );
  }
}

export default function EmailQuarantinePage() {
  const { isPlatformAdmin, isLoading: isLoadingRole } = useCurrentUserRole();
  const [entries, setEntries] = useState<EmailQuarantineListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    entryId: string;
    action: "approved" | "rejected" | "reprocess";
    senderEmail: string;
  } | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch("/api/admin/email-quarantine");
      const json = (await res.json()) as ApiResponse<{
        entries: EmailQuarantineListItem[];
      }>;

      if (!json.success || !json.data) {
        setError(json.error ?? "Fehler beim Laden.");
        return;
      }

      setEntries(json.data.entries);
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPlatformAdmin) fetchEntries();
  }, [isPlatformAdmin, fetchEntries]);

  async function handleAction(
    entryId: string,
    action: "approved" | "rejected"
  ) {
    setActionLoading(entryId);
    try {
      const res = await fetch(`/api/admin/email-quarantine/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const json = (await res.json()) as ApiResponse;
      if (!json.success) {
        toast.error(json.error ?? "Aktion fehlgeschlagen.");
        return;
      }

      toast.success(
        action === "approved" ? "E-Mail freigegeben." : "E-Mail abgelehnt."
      );
      await fetchEntries();
    } catch {
      toast.error("Verbindungsfehler.");
    } finally {
      setActionLoading(null);
      setConfirmDialog(null);
    }
  }

  async function handleReprocess(entryId: string) {
    setActionLoading(entryId);
    try {
      const res = await fetch(
        `/api/admin/email-quarantine/${entryId}/reprocess`,
        { method: "POST" }
      );

      const json = (await res.json()) as ApiResponse<{ orderId: string }>;
      if (!json.success) {
        toast.error(json.error ?? "Verarbeitung fehlgeschlagen.");
        return;
      }

      toast.success("Bestellung erstellt. Extraktion gestartet.");
      await fetchEntries();
    } catch {
      toast.error("Verbindungsfehler.");
    } finally {
      setActionLoading(null);
      setConfirmDialog(null);
    }
  }

  if (isLoadingRole) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Nur fuer Platform-Administratoren.
        </AlertDescription>
      </Alert>
    );
  }

  const pendingCount = entries.filter((e) => e.review_status === "pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">
          E-Mail-Quarantaene
        </h1>
        <p className="text-muted-foreground mt-1">
          E-Mails von nicht-autorisierten Absendern pruefen und freigeben.
          {pendingCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {pendingCount} ausstehend
            </Badge>
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Quarantaene-Eintraege
          </CardTitle>
          <CardDescription>
            E-Mails, die von Absendern stammen, die keinem Mandanten-Team
            zugeordnet sind.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Inbox className="h-12 w-12 mb-3" />
              <p className="text-sm">Keine E-Mails in der Quarantaene.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Absender</TableHead>
                    <TableHead>Betreff</TableHead>
                    <TableHead>Mandant</TableHead>
                    <TableHead>Empfangen</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div className="font-medium text-sm">
                          {entry.sender_name || entry.sender_email}
                        </div>
                        {entry.sender_name && (
                          <div className="text-xs text-muted-foreground">
                            {entry.sender_email}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {entry.subject || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.tenant_name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(entry.received_at), {
                          addSuffix: true,
                          locale: de,
                        })}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={entry.review_status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {entry.review_status === "pending" ? (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              disabled={actionLoading === entry.id}
                              onClick={() =>
                                setConfirmDialog({
                                  open: true,
                                  entryId: entry.id,
                                  action: "approved",
                                  senderEmail: entry.sender_email,
                                })
                              }
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Freigeben
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              disabled={actionLoading === entry.id}
                              onClick={() =>
                                setConfirmDialog({
                                  open: true,
                                  entryId: entry.id,
                                  action: "rejected",
                                  senderEmail: entry.sender_email,
                                })
                              }
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Ablehnen
                            </Button>
                          </div>
                        ) : entry.review_status === "approved" &&
                          !entry.order_id ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionLoading === entry.id}
                            onClick={() =>
                              setConfirmDialog({
                                open: true,
                                entryId: entry.id,
                                action: "reprocess",
                                senderEmail: entry.sender_email,
                              })
                            }
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Verarbeiten
                          </Button>
                        ) : entry.order_id ? (
                          <a
                            href={`/orders/${entry.order_id}`}
                            className="text-sm text-primary hover:underline"
                          >
                            Bestellung anzeigen
                          </a>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <AlertDialog
        open={confirmDialog?.open ?? false}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog?.action === "approved"
                ? "E-Mail freigeben?"
                : confirmDialog?.action === "rejected"
                  ? "E-Mail ablehnen?"
                  : "E-Mail verarbeiten?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog?.action === "approved" ? (
                <>
                  Die E-Mail von{" "}
                  <strong>{confirmDialog.senderEmail}</strong> wird
                  freigegeben. Sie koennen sie anschliessend verarbeiten,
                  um eine Bestellung zu erstellen.
                </>
              ) : confirmDialog?.action === "rejected" ? (
                <>
                  Die E-Mail von{" "}
                  <strong>{confirmDialog.senderEmail}</strong> wird
                  abgelehnt und nicht weiter verarbeitet.
                </>
              ) : (
                <>
                  Aus der freigegebenen E-Mail von{" "}
                  <strong>{confirmDialog?.senderEmail}</strong> wird eine
                  Bestellung erstellt und die Extraktion gestartet.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!actionLoading}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!!actionLoading}
              className={
                confirmDialog?.action === "rejected"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
              onClick={() => {
                if (!confirmDialog) return;
                if (confirmDialog.action === "reprocess") {
                  handleReprocess(confirmDialog.entryId);
                } else {
                  handleAction(confirmDialog.entryId, confirmDialog.action);
                }
              }}
            >
              {confirmDialog?.action === "approved"
                ? "Freigeben"
                : confirmDialog?.action === "rejected"
                  ? "Ablehnen"
                  : "Verarbeiten"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
