"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { logoutAction } from "@/lib/auth-actions";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types";
import { LogOut, Settings, User } from "lucide-react";

interface UserData {
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
}

export function UserMenu() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          // Fetch the user profile for first_name and last_name
          const { data: profile } = await supabase
            .from("user_profiles")
            .select("first_name, last_name, role")
            .eq("id", user.id)
            .single();

          setUserData({
            firstName: profile?.first_name || user.user_metadata?.first_name || "",
            lastName: profile?.last_name || user.user_metadata?.last_name || "",
            email: user.email ?? "",
            role: (profile?.role as UserRole) ?? (user.app_metadata?.role as UserRole) ?? "tenant_user",
          });
        }
      } catch {
        // Failed to load user data
      } finally {
        setIsLoading(false);
      }
    }

    loadUser();
  }, []);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logoutAction();
      window.location.href = "/login";
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="hidden h-4 w-24 md:block" />
      </div>
    );
  }

  if (!userData) {
    return null;
  }

  const initials =
    userData.firstName && userData.lastName
      ? `${userData.firstName[0]}${userData.lastName[0]}`
      : userData.email.substring(0, 2).toUpperCase();

  const displayName =
    userData.firstName && userData.lastName
      ? `${userData.firstName} ${userData.lastName}`
      : userData.email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Benutzermenü öffnen"
      >
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden text-sm font-semibold md:inline-block">
          {displayName}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-semibold">{displayName}</p>
            <p className="text-xs text-muted-foreground">{userData.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard" className="cursor-pointer">
            <User className="h-4 w-4" />
            Dashboard
          </Link>
        </DropdownMenuItem>
        {(userData.role === "tenant_admin" ||
          userData.role === "platform_admin") && (
          <DropdownMenuItem asChild>
            <Link href="/settings/team" className="cursor-pointer">
              <Settings className="h-4 w-4" />
              Teamverwaltung
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          {isLoggingOut ? "Abmelden..." : "Abmelden"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
