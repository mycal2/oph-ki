# OPH-56: Collapsible Sub-Groups in Platform Sidebar Section

## Status: In Progress
**Created:** 2026-03-25
**Last Updated:** 2026-03-25

## Dependencies
- OPH-55 (Sidebar Navigation Redesign) — this feature extends the Plattform section added in OPH-55

## User Stories
- As a platform admin, I want the Plattform section grouped into logical sub-categories so that I can find the right page without scanning 8 flat links.
- As a platform admin, I want to collapse sub-groups I'm not currently using so that the sidebar stays uncluttered.
- As a platform admin using icon-only mode, I want to see the group icon with a tooltip so that I can still orient myself without labels.

## Sidebar Structure

### Plattform Section (platform_admin and platform_viewer only)

**Dashboard**
| Icon | Label | Route |
|---|---|---|
| BarChart3 | Reporting | /admin/dashboard |
| Receipt | Abrechnung | /admin/reports |

**Konfiguration**
| Icon | Label | Route |
|---|---|---|
| Building2 | Mandanten | /admin/tenants |
| Store | Händler | /admin/dealers |
| FileCode | ERP-Mapping | /admin/erp-configs |

**Services**
| Icon | Label | Route |
|---|---|---|
| Upload | Upload | /admin/upload |
| MailWarning | E-Mail-Quarantäne | /admin/email-quarantine |

**Einstellungen**
| Icon | Label | Route |
|---|---|---|
| Users | Teamverwaltung | /settings/team |
| Settings | Fehler-Benachrichtigungen | /admin/settings |

## Acceptance Criteria

### Sub-group behavior
- [ ] The Plattform section has 4 collapsible sub-groups: Dashboard, Konfiguration, Services, Einstellungen
- [ ] Each sub-group has a trigger showing an icon + label + ChevronDown (rotates when open)
- [ ] All sub-groups are open by default
- [ ] Clicking the trigger toggles the sub-group open/closed
- [ ] Active sub-item is visually highlighted (background + primary text)

### Collapsed sidebar behavior
- [ ] When sidebar is icon-only: sub-group triggers show icon + tooltip with group name
- [ ] Sub-items are hidden in icon-only mode (only group trigger icons visible)

### Mobile behavior
- [ ] Sub-groups render normally in the mobile Sheet (full labels visible)
- [ ] Clicking a sub-item link closes the mobile Sheet

## Edge Cases
- What if sidebar is collapsed and user opens a sub-group? → The sub-group open/close state is local; in icon-only mode sub-items are never shown regardless
- What if a new admin page is added? → Add it to the appropriate sub-group's items array in app-sidebar.tsx

## Technical Requirements
- Uses existing `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` from `src/components/ui/collapsible.tsx`
- Uses existing `SidebarMenuSub`, `SidebarMenuSubItem`, `SidebarMenuSubButton` from `src/components/ui/sidebar.tsx`
- Only file changed: `src/components/layout/app-sidebar.tsx`
- No new packages required

---

## Tech Design (Solution Architect)

Extends `app-sidebar.tsx` to replace the flat Plattform `SidebarMenu` with 4 collapsible sub-groups. Each sub-group uses the `Collapsible` + `SidebarMenuSub` pattern from shadcn. No backend changes needed.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
