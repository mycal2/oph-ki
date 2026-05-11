"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
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
  Briefcase,
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
}

interface PlatformSubGroup {
  title: string;
  icon: LucideIcon;
  defaultOpen: boolean;
  items: NavItem[];
}

function isActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname.startsWith(href);
}

function CollapseToggle() {
  const t = useTranslations("layout.sidebar");
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
          aria-label={isExpanded ? t("collapseAriaLabel") : t("expandAriaLabel")}
        >
          {isExpanded ? (
            <ChevronsLeft className="h-4 w-4" />
          ) : (
            <ChevronsRight className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {isExpanded ? t("collapseTooltip") : t("expandTooltip")}
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
  const t = useTranslations("layout.sidebar");
  const pathname = usePathname();
  const { role, isPlatformAdminOrViewer, salesforceEnabled } = useCurrentUserRole();
  const { setOpenMobile, isMobile } = useSidebar();

  const navGroups: NavGroup[] = [
    {
      title: t("groupOverview"),
      items: [
        { icon: LayoutDashboard, label: t("dashboard"), href: "/dashboard" },
        { icon: Package, label: t("orders"), href: "/orders" },
      ],
    },
    {
      title: t("groupMasterData"),
      items: [
        { icon: Box, label: t("articleCatalog"), href: "/settings/article-catalog" },
        { icon: Users, label: t("customerCatalog"), href: "/settings/customer-catalog" },
        {
          icon: ArrowLeftRight,
          label: t("dealerMappings"),
          href: "/settings/dealer-mappings",
        },
      ],
    },
    {
      title: t("groupSettings"),
      items: [
        { icon: Mail, label: t("inboundEmail"), href: "/settings/inbound-email" },
        { icon: Shield, label: t("dataProtection"), href: "/settings/data-protection" },
      ],
    },
  ];

  const platformSubGroups: PlatformSubGroup[] = [
    {
      title: t("platformDashboard"),
      icon: BarChart3,
      defaultOpen: true,
      items: [
        { icon: BarChart3, label: t("platformReporting"), href: "/admin/dashboard" },
        { icon: Receipt, label: t("platformBilling"), href: "/admin/reports" },
        { icon: Upload, label: t("platformUpload"), href: "/admin/upload" },
      ],
    },
    {
      title: t("platformConfiguration"),
      icon: Settings2,
      defaultOpen: false,
      items: [
        { icon: Building2, label: t("platformTenants"), href: "/admin/tenants" },
        { icon: Store, label: t("platformDealers"), href: "/admin/dealers" },
        { icon: FileCode, label: t("platformErpMapping"), href: "/admin/erp-configs" },
      ],
    },
    {
      title: t("platformServices"),
      icon: MailWarning,
      defaultOpen: false,
      items: [
        {
          icon: MailWarning,
          label: t("platformEmailQuarantine"),
          href: "/admin/email-quarantine",
        },
      ],
    },
    {
      title: t("platformSettings"),
      icon: Settings,
      defaultOpen: false,
      items: [
        { icon: Users, label: t("platformTeamManagement"), href: "/settings/team" },
        {
          icon: Settings,
          label: t("platformErrorNotifications"),
          href: "/admin/settings",
        },
      ],
    },
  ];

  // OPH-82: Show Außendienstler under Stammdaten
  const showAussendienst = role === "platform_admin" || (role === "tenant_admin" && salesforceEnabled);

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
        {navGroups.map((group) => {
          const items = group.title === t("groupMasterData") && showAussendienst
            ? [...group.items, { icon: Briefcase, label: t("salesReps"), href: "/settings/aussendienstler" }]
            : group.items;

          return (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
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
          );
        })}

        {isPlatformAdminOrViewer && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("groupPlatform")}</SidebarGroupLabel>
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
