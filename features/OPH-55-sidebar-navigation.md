# OPH-55: Sidebar Navigation Redesign

## Status: In Progress
**Created:** 2026-03-24
**Last Updated:** 2026-03-24

## Dependencies
- None (replaces existing top-navigation links; all routes already exist)

## User Stories
- As a tenant user, I want a clearly organized sidebar so that I can quickly find the page I need without scanning through a long flat list of links.
- As a platform admin, I want tenant and platform navigation clearly separated so that I always know which context I'm working in.
- As any user, I want to collapse the sidebar to icon-only mode so that I have more screen space for content when I don't need full labels.
- As a mobile user, I want the sidebar to slide in from the left (hamburger menu) so that it doesn't take up permanent screen space on small devices.
- As any user, I want the sidebar to remember whether I left it collapsed or expanded so that I don't have to toggle it every time I reload.

## Sidebar Structure

### Tenant Sections (visible to all authenticated users)

**Übersicht**
| Icon | Label | Route |
|---|---|---|
| LayoutDashboard | Dashboard | /dashboard |
| Package | Bestellungen | /orders |

**Stammdaten**
| Icon | Label | Route |
|---|---|---|
| Box | Artikelstamm | /settings/article-catalog |
| Users | Kundenstamm | /settings/customer-catalog |
| ArrowLeftRight | Zuordnungen | /settings/dealer-mappings |

**Einstellungen**
| Icon | Label | Route |
|---|---|---|
| Mail | Eingangs-E-Mail | /settings/inbound-email |
| Shield | Datenschutz | /settings/data-protection |

### Platform Section (visible only to platform_admin and platform_viewer)

**Plattform**
| Icon | Label | Route |
|---|---|---|
| BarChart3 | Dashboard | /admin/dashboard |
| Receipt | Abrechnung | /admin/reports |
| Building2 | Mandanten | /admin/tenants |
| Store | Händler-Profile | /admin/dealers |
| FileCode | ERP-Mapping | /admin/erp-configs |
| MailWarning | E-Mail-Quarantäne | /admin/email-quarantine |
| Upload | Upload | /admin/upload |
| Settings | Einstellungen | /admin/settings |

## Acceptance Criteria

### Sidebar layout
- [ ] The sidebar replaces all navigation links currently in the top bar
- [ ] The top bar retains only: logo (left), tenant logo (center-left), user menu (right), and mobile hamburger button
- [ ] The sidebar is always visible on desktop (≥768px) — either expanded (~250px) or collapsed (~64px icon-only)
- [ ] Menu items are grouped under section headers: "Übersicht", "Stammdaten", "Einstellungen", "Plattform"
- [ ] The "Plattform" section is only visible to platform_admin and platform_viewer roles
- [ ] Each menu item has an icon (from lucide-react) and a label
- [ ] The active page is visually highlighted (e.g. background color + primary text)

### Collapse behavior
- [ ] A toggle button at the bottom of the sidebar collapses it to icon-only mode (~64px wide)
- [ ] In collapsed mode: icons remain visible, labels and section headers are hidden
- [ ] In collapsed mode: hovering over an icon shows a tooltip with the label
- [ ] The collapsed/expanded state is persisted in localStorage and restored on page load
- [ ] The main content area adjusts its width when the sidebar collapses/expands (no overlap)

### Mobile behavior
- [ ] On mobile (<768px), the sidebar is hidden by default
- [ ] The hamburger button in the top bar opens the sidebar as a Sheet (slide from left) — same as current behavior
- [ ] The mobile sidebar shows full labels and section headers (not collapsed mode)
- [ ] Clicking a link in the mobile sidebar closes the Sheet and navigates

### Content area
- [ ] The main content area sits to the right of the sidebar on desktop
- [ ] The content area uses the full remaining width (sidebar + content = 100vw)
- [ ] The existing `container mx-auto max-w-7xl` constraint on content is preserved

## Edge Cases
- What if the viewport is exactly 768px? → Sidebar switches between desktop/mobile mode at this breakpoint (same as current md: breakpoint)
- What if localStorage is not available (private browsing)? → Default to expanded; don't crash
- What if the user resizes from desktop to mobile while sidebar is expanded? → Sidebar disappears; hamburger menu appears; state is preserved for when they resize back
- What if a new menu item is added later? → The sidebar structure supports adding items to any section without layout changes
- What if user navigates with keyboard? → All sidebar links must be keyboard-accessible (Tab + Enter); collapsed tooltips visible on focus

## Technical Requirements
- Use the existing shadcn `sidebar` component (`src/components/ui/sidebar.tsx`)
- Icons from `lucide-react` (already installed)
- No new packages required
- The refactor touches: `app-layout.tsx`, `top-navigation.tsx`, and potentially the protected layout

---

## Tech Design (Solution Architect)

### Layers affected

| Layer | What changes |
|---|---|
| Layout | `app-layout.tsx` restructured from vertical stack to `SidebarProvider` + horizontal flex |
| Top bar | `top-navigation.tsx` stripped of all nav links; hamburger replaced with `SidebarTrigger` |
| New component | `app-sidebar.tsx` — all nav groups, items, icons, role filtering |
| Pages | **No changes** — layout is the right place for navigation |
| Backend / DB | **None** |

### Component structure

```
AppLayout (MODIFIED — wraps in SidebarProvider)
+-- SidebarProvider  (state, mobile Sheet, keyboard shortcut ⌘B)
    +-- AppSidebar (NEW)
    |   +-- SidebarContent (scrollable)
    |   |   +-- SidebarGroup "Übersicht"
    |   |   |   +-- Dashboard        [LayoutDashboard icon]
    |   |   |   +-- Bestellungen     [Package icon]
    |   |   +-- SidebarGroup "Stammdaten"
    |   |   |   +-- Artikelstamm     [Box icon]
    |   |   |   +-- Kundenstamm      [Users icon]
    |   |   |   +-- Zuordnungen      [ArrowLeftRight icon]
    |   |   +-- SidebarGroup "Einstellungen"
    |   |   |   +-- Eingangs-E-Mail  [Mail icon]
    |   |   |   +-- Datenschutz      [Shield icon]
    |   |   +-- SidebarGroup "Plattform"  ← admin/viewer only
    |   |       +-- Dashboard        [BarChart3 icon]
    |   |       +-- Abrechnung       [Receipt icon]
    |   |       +-- Mandanten        [Building2 icon]
    |   |       +-- Händler-Profile  [Store icon]
    |   |       +-- ERP-Mapping      [FileCode icon]
    |   |       +-- E-Mail-Quarantäne [MailWarning icon]
    |   |       +-- Upload           [Upload icon]
    |   |       +-- Einstellungen    [Settings icon]
    |   +-- SidebarFooter
    |       └── SidebarTrigger  (collapse toggle at bottom)
    +-- Main area (flex-col, fills remaining width)
        +-- TopNavigation (MODIFIED — slim top bar only)
        |   +-- SidebarTrigger  (hamburger on mobile)
        |   +-- Logo
        |   +-- TenantLogoDisplay
        |   +-- UserMenu
        +-- <main> (page content — unchanged)
```

### File changes

| File | What changes |
|---|---|
| `app-layout.tsx` | Wrap in `SidebarProvider`; change from `flex-col` to `flex-row` (sidebar left, main right) |
| `top-navigation.tsx` | Remove all nav links and `allNavLinks` array; replace custom hamburger Sheet with `SidebarTrigger` |
| `app-sidebar.tsx` | **New.** Contains all nav groups and items; reads `isPlatformAdminOrViewer` to show/hide Plattform section |

### State persistence: cookie (not localStorage)

The shadcn sidebar uses a **cookie** (`sidebar_state`) instead of localStorage. This is better: the server can read it before React hydrates, preventing a visual flash of the wrong state on page load. Cookies also work in private browsing. The spec edge case about localStorage unavailability is therefore a non-issue.

### Built-in behaviors (no custom logic needed)

| Behavior | How it's handled |
|---|---|
| Collapse to icon-only | `SidebarMenuButton` automatically shows icon-only in collapsed state |
| Tooltips in collapsed mode | `SidebarMenuButton` renders a `Tooltip` automatically when sidebar is collapsed |
| Section headers hidden when collapsed | `SidebarGroupLabel` hides itself when sidebar state is `collapsed` |
| Mobile Sheet | `SidebarProvider` detects mobile via `useIsMobile` and renders Sheet automatically |
| Keyboard shortcut | ⌘B / Ctrl+B built into `SidebarProvider` |
| Close on mobile nav click | `SidebarProvider` closes mobile Sheet on navigation |

### New packages required

None — `sidebar`, `Tooltip`, `Sheet`, lucide-react all already installed.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
