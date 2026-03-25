"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Box,
  Users,
  ArrowLeftRight,
  Mail,
  Shield,
  BarChart3,
  Receipt,
  Building2,
  Store,
  FileCode,
  MailWarning,
  Upload,
  Settings,
  Settings2,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCurrentUserRole } from "@/hooks/use-current-user-role";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
  adminOnly?: boolean;
}

interface PlatformSubGroup {
  title: string;
  icon: LucideIcon;
  defaultOpen: boolean;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: "Übersicht",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
      { icon: Package, label: "Bestellungen", href: "/orders" },
    ],
  },
  {
    title: "Stammdaten",
    items: [
      { icon: Box, label: "Artikelstamm", href: "/settings/article-catalog" },
      { icon: Users, label: "Kundenstamm", href: "/settings/customer-catalog" },
      {
        icon: ArrowLeftRight,
        label: "Zuordnungen",
        href: "/settings/dealer-mappings",
      },
    ],
  },
  {
    title: "Einstellungen",
    items: [
      { icon: Mail, label: "Eingangs-E-Mail", href: "/settings/inbound-email" },
      { icon: Shield, label: "Datenschutz", href: "/settings/data-protection" },
    ],
  },
];

const platformSubGroups: PlatformSubGroup[] = [
  {
    title: "Dashboard",
    icon: BarChart3,
    defaultOpen: true,
    items: [
      { icon: BarChart3, label: "Reporting", href: "/admin/dashboard" },
      { icon: Receipt, label: "Abrechnung", href: "/admin/reports" },
      { icon: Upload, label: "Upload", href: "/admin/upload" },
    ],
  },
  {
    title: "Konfiguration",
    icon: Settings2,
    defaultOpen: false,
    items: [
      { icon: Building2, label: "Mandanten", href: "/admin/tenants" },
      { icon: Store, label: "Händler", href: "/admin/dealers" },
      { icon: FileCode, label: "ERP-Mapping", href: "/admin/erp-configs" },
    ],
  },
  {
    title: "Services",
    icon: MailWarning,
    defaultOpen: false,
    items: [
      {
        icon: MailWarning,
        label: "E-Mail-Quarantäne",
        href: "/admin/email-quarantine",
      },
    ],
  },
  {
    title: "Einstellungen",
    icon: Settings,
    defaultOpen: false,
    items: [
      { icon: Users, label: "Teamverwaltung", href: "/settings/team" },
      {
        icon: Settings,
        label: "Fehler-Benachrichtigungen",
        href: "/admin/settings",
      },
    ],
  },
];

function isActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname.startsWith(href);
}

function CollapseToggle() {
  const { state, toggleSidebar, isMobile } = useSidebar();

  if (isMobile) return null;

  const isExpanded = state === "expanded";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground"
          aria-label={isExpanded ? "Sidebar einklappen" : "Sidebar ausklappen"}
        >
          {isExpanded ? (
            <ChevronsLeft className="h-4 w-4" />
          ) : (
            <ChevronsRight className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {isExpanded ? "Einklappen" : "Ausklappen"}
      </TooltipContent>
    </Tooltip>
  );
}

interface PlatformSubGroupItemProps {
  subGroup: PlatformSubGroup;
  pathname: string;
  onNavigate: () => void;
}

function PlatformSubGroupItem({
  subGroup,
  pathname,
  onNavigate,
}: PlatformSubGroupItemProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const GroupIcon = subGroup.icon;
  const hasActiveChild = subGroup.items.some((item) =>
    isActive(item.href, pathname)
  );

  if (isCollapsed) {
    return (
      <SidebarMenuItem>
        <Tooltip>
          <TooltipTrigger asChild>
            <SidebarMenuButton
              isActive={hasActiveChild}
              className="justify-center"
            >
              <GroupIcon />
            </SidebarMenuButton>
          </TooltipTrigger>
          <TooltipContent side="right">{subGroup.title}</TooltipContent>
        </Tooltip>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <Collapsible defaultOpen={subGroup.defaultOpen} className="group/collapsible">
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            isActive={hasActiveChild}
            className="w-full justify-between"
          >
            <span className="flex items-center gap-2">
              <GroupIcon className="h-4 w-4 shrink-0" />
              <span>{subGroup.title}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {subGroup.items.map((item) => {
              const active = isActive(item.href, pathname);
              return (
                <SidebarMenuSubItem key={item.href}>
                  <SidebarMenuSubButton asChild isActive={active}>
                    <Link href={item.href} onClick={onNavigate}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { isPlatformAdminOrViewer } = useCurrentUserRole();
  const { setOpenMobile, isMobile } = useSidebar();

  function handleNavigate() {
    if (isMobile) {
      setOpenMobile(false);
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex items-center justify-end px-2 py-2">
        <CollapseToggle />
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActive(item.href, pathname);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                      >
                        <Link href={item.href} onClick={handleNavigate}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {isPlatformAdminOrViewer && (
          <SidebarGroup>
            <SidebarGroupLabel>Plattform</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {platformSubGroups.map((subGroup) => (
                  <PlatformSubGroupItem
                    key={subGroup.title}
                    subGroup={subGroup}
                    pathname={pathname}
                    onNavigate={handleNavigate}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}
