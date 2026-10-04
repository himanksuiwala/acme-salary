# ACME Salary Management — Interface Design System

**Version:** 1.0 · **Date:** 2026-10-04 · **Status:** Design direction for implementation  
**Applies to:** Overview, employee directory and profile, compensation forms, analytics, imports, exports, and administration  
**Product behavior:** [Product UX specification](specs/product-ux-spec.md)

## 1. Design intent

ACME is a working tool for HR staff handling sensitive pay records throughout the day. The interface should feel calm, precise, and efficient: clear hierarchy, compact but readable controls, restrained surfaces, and conspicuous context around every monetary amount. A user should recognize the same action, state, and value format on every screen.

**Visual character:** Inter typography, a Tailwind Neutral foundation, small semantic status accents, Phosphor icons, low visual noise, and consistent component behavior. Use whitespace and alignment to establish hierarchy before adding borders, shadows, or color. Reserve emphasis for the employee identity, the currently effective package, the primary action, and exceptions that require attention.

The system is desktop-first because its main tasks involve dense tables and forms. Mobile layouts remain fully usable for search, inspection, and approval/review steps. No screen relies on a wide viewport to reveal essential pay context.

## 2. Technology and component ownership

The frontend is React 19, Vite, and Tailwind CSS 4. Its original shadcn setup uses `radix-nova`, `neutral`, CSS variables, and a Lucide generator setting. The employee directory now uses Coss components, Inter, and Phosphor; older unused shadcn files may remain during incremental migration. [shadcn's Vite documentation](https://ui.shadcn.com/docs/installation/vite) and [Coss UI's existing-project guide](https://coss.com/ui/docs/get-started) describe the installation paths.

**Component rule:** Use shadcn's current CLI and local `components/ui` files as the component delivery mechanism. For a new pattern offered by Coss UI, prefer its component and its neutral token system. Keep a shadcn component where it already works or where Coss does not provide the needed pattern. Wrap product-specific behavior in `components/product` so business rules do not get embedded in registry files. Add only components needed by an implemented screen; avoid installing all primitives by default.

Coss UI uses Base UI; existing shadcn components use Radix. They can coexist at the app level, but an individual dialog, menu, combobox, or other composite control must use one library's parts throughout. Coss triggers commonly use `render` where Radix compositions use `asChild`, and Coss often names overlay content `Popup` or `Panel`. Check the [Coss migration guide](https://coss.com/ui/docs/radix-migration) before replacing a component. Do not overwrite customized files with a registry command without reviewing the diff.

| Product need | Preferred source | Product-level composition |
|---|---|---|
| Navigation, actions, cards, status badges | Coss Button, Card, Badge, Breadcrumb, Tabs, Menu, Sheet | App shell, employee header, package summary |
| Search and filters | Coss Input, Combobox, Select, Popover, Date Picker | Directory filter bar with URL-backed state |
| Employee and import tables | Coss Table, Pagination, Skeleton, Empty | Server-paginated directory, validation grid, result list |
| Compensation forms | Coss Form, Field, Input, Select, Date Picker, Textarea | Money field, allowance editor, review panel |
| Feedback and long jobs | Coss Alert, Progress, Dialog, Toast | Import validation, FX coverage, conflict resolution |
| Analytics charts | shadcn Chart with Recharts, paired with Coss Table | Distribution, breakdown and trend views |
| Domain-specific displays | Local components | Money, effective-date state, FX methodology, audit diff |

This mapping uses components documented in the [Coss component catalog](https://coss.com/ui/docs/get-started) and [shadcn Chart documentation](https://ui.shadcn.com/docs/components/chart). The chart is a visual supplement; its exact numbers must also be available in a table.

## 3. Typography

Use **Inter Variable** for body, headings, controls, tables, and metrics. In this Vite app, self-host with `@fontsource-variable/inter`; replace the current Geist import in `src/index.css`, and map `--font-sans` and `--font-heading` to Inter. Coss's typography variables already distinguish sans, heading, and optional mono; its style preset also uses Inter, but its Next.js font wiring does not directly apply to this Vite app. [Coss font variables](https://coss.com/ui/docs/styling), [Fontsource variable-font setup](https://fontsource.org/docs/getting-started/variable).

| Role | Size / line height | Weight | Use |
|---|---|---:|---|
| Page title | 28 / 36 px | 600 | One per page; employee name or destination |
| Section title | 18 / 26 px | 600 | Current package, history, analytics section |
| Large metric | 26 / 32 px | 600 | Overview and analytics values |
| Important money | 20 / 28 px | 600 | Base pay in the current package |
| Body and form value | 15 / 22 px | 400 | Default reading and data entry |
| Table value | 14 / 20 px | 400–500 | Dense rows, never below 14 px |
| Label and helper | 13 / 18 px | 500 / 400 | Field labels, dates, method notes |

- Keep prose blocks near 65 characters per line; left-align text. Use at most three heading levels in a screen.
- Use sentence case for navigation, controls, headings, table headers, and state names. Reserve uppercase for codes such as `USD` and `EMP001`.
- Apply kerning and standard ligatures. Use `font-variant-numeric: tabular-nums lining-nums` for money, dates, counts, percentages, and numeric table columns. Right-align numeric table cells and decimal-align only when it improves comparison.
- Show full currency code and frequency with the value: `₹1,250,000 INR / year`. Avoid abbreviating the main salary value; summary cards may use a compact amount if the exact value is available beside it or on focus.
- Use real punctuation in visible copy: curly apostrophes and quotation marks, en dashes for date ranges, and the single ellipsis character for in-progress labels.

## 4. Color and elevation

Use the [Tailwind Neutral palette](https://tailwindcss.com/docs/colors) through semantic CSS variables. Do not scatter raw color values across components. The existing shadcn configuration already selects `neutral` and CSS variables; preserve those conventions. Coss adds semantic `info`, `success`, `warning`, and `destructive` tokens that must be defined if its components are imported manually. [Coss styling tokens](https://coss.com/ui/docs/styling).

| CSS token | Light value | Dark value | Typical use |
|---|---|---|---|
| `--background` | white | neutral-950 | Main canvas |
| `--card`, `--popover` | white | neutral-900 | Forms, summaries, popovers |
| `--muted`, `--sidebar` | neutral-50 | neutral-900 | Sidebar, filter row, quiet grouping |
| `--foreground` | neutral-900 | neutral-50 | Headings, values |
| `--muted-foreground` | neutral-600 | neutral-400 | Labels, helper copy |
| `--border`, `--input` | neutral-200 | neutral-800 | Table rules, field borders |
| `--primary` / `--primary-foreground` | neutral-900 / white | neutral-100 / neutral-950 | Save, import commit |
| `--ring` | neutral-700 | neutral-300 | Keyboard focus with offset |

Retain the existing `@theme inline` mappings from these semantic variables to Tailwind utilities. If Coss UI is added, define its extra `--info`, `--success`, `--warning`, and `--destructive-foreground` pairs in both themes. Use blue, emerald, amber, and red for these tokens; check text and badge contrast in the rendered component. Keep chart colors separate from status meaning.

Neutral is the visual default. Use emerald, amber, red, or blue only for semantic feedback or a small data-series distinction; never as decoration. A state always has a text label and, where helpful, an icon. Example: **Scheduled** uses a clock icon and text; **Partial data** uses a warning icon and explanation. Do not encode salary magnitude with red/green alone, because higher or lower compensation is not inherently good or bad.

Use a 1 px divider for tables and section boundaries, a subtle border for cards, and minimal shadow only for elevated overlays. Avoid heavy drop shadows, gradients, saturated hero panels, and nested card grids. Active navigation has a quiet neutral fill plus clear text weight. Focus indication must remain visible on both light and dark surfaces.

## 5. Spacing, shape, and responsive grid

- Base spacing unit: **4 px**. Main rhythm: 8, 12, 16, 24, 32, and 48 px. Use 24–32 px between page sections and 12–16 px within a form group.
- Radius: 8 px for controls and small panels, 10 px for cards, 12 px for overlays. Keep the app's shared radius token as the source of truth.
- Desktop shell: 232 px sidebar, 64 px top bar, content width up to 1,440 px, 32 px page padding. The top bar holds page context and account actions, not duplicate navigation.
- Tablet: collapsible sidebar and 24 px page padding. Mobile: navigation in a labeled sheet, 16 px page padding, one-column content.
- Forms use a readable column of about 640–720 px, with a contextual preview to the side on wide screens. Review and save remain in reading order on narrow screens.
- Dense desktop table rows target 40–44 px. On touch screens, interactive targets are at least 44 × 44 px. The most important identity column stays visible where a table scrolls horizontally.

## 6. Phosphor icon rules

Use the official [`@phosphor-icons/react`](https://github.com/phosphor-icons/react) package as the only product icon family. Its regular weight is the default; filled weight may mark a selected navigation item or completed step. Keep icons at 20 px in navigation, 16–18 px beside inline text, and 24 px in empty states. Use `currentColor` so icons inherit semantic text color. Do not mix Lucide and Phosphor in the rendered product, including icons copied from registry examples.

| Context | Icon meaning | Text remains visible |
|---|---|---|
| Overview / Employees / Analytics / Data operations / Administration | Destination recognition | Navigation label |
| Search / Filter / Calendar | Input affordance | Label or accessible name |
| Current / Scheduled / Past | Package state | Full state word and effective date |
| Import / Export | Direction of data movement | Action label |
| Warning / Error / Success | Outcome | Message and recovery path |

Decorative icons use `aria-hidden="true"`. Icon-only actions need an accessible name, tooltip, and sufficient hit area. Icons must never be the sole signal for a permission, date conflict, or salary change. Phosphor documents regular, fill, and other weights plus direct imports for better development performance in its [React README](https://github.com/phosphor-icons/react).

## 7. Shared interaction patterns

### Actions and forms

- One primary action per area. Put **Save package**, **Commit import**, and **Generate export** at the end of a reviewed flow. Use neutral outline/ghost actions for Cancel, Back, and secondary operations.
- Use Coss `Field` for persistent labels, descriptions, and inline errors. Placeholder text may show an example but never replace a label. Money entry shows currency and frequency beside the field, with precision guidance for the selected currency.
- Use native typing plus a date picker for effective dates. The displayed date includes the product's UTC as-of policy; validation does not silently change an entered date.
- Confirmation for a compensation change is a review section or full-page step showing employee, current package, proposed package, prior end date, changed allowances, and reason. Avoid a tiny confirmation modal for this high-impact action.
- For dangerous administration actions, use a focused confirmation dialog naming the affected user/reference item and the consequence.

### Tables and filters

- Keep filters immediately above the data they change. Show active filter chips and total result count. The directory's default sort and page are visible; pagination is server-backed.
- Header labels stay short and sentence case. Employee code/name is left-aligned; money and counts are right-aligned with tabular numerals. Sort icons appear only on sortable headers.
- Use thin horizontal rules rather than full cell boxes. Row hover and keyboard focus are distinct. A row action has a visible label on focus and a clearly named menu if secondary actions are numerous.
- At mobile widths, convert employee rows to stacked records; show name, code, status, location, and current salary state before secondary details. Preserve search and filter access.

### States and feedback

- **Current**, **Scheduled**, **Past**, and **No effective package** use stable badge/text treatments across directory and profile. Never let a past package masquerade as current.
- Empty state names the missing data and gives the next authorized action. A zero-result search offers **Clear filters**; an employee without salary offers **Add first package** to authorized users.
- Loading skeletons reflect the actual content shape. A service error says what failed and offers Retry; cached salary data shows its timestamp and is never presented as live.
- Field errors sit near the field and are summarized at the top of a long form. Import errors show row, column, entered value, reason, and fix. Preserve entered values after a conflict.
- Toasts confirm transient events; the saved package, import result, or export job remains visible in the page as durable confirmation.

## 8. Screen composition

| Screen | Layout and emphasis | Key controls and states |
|---|---|---|
| Overview | Short page title, as-of/scope bar, 3–4 compact metric cards, then scheduled changes and data-quality lists | Metric definition link, exact currency, partial-data callout |
| Employee directory | Search and filter row above full-width table; add employee action beside title | 20-row pagination, no-result reset, explicit no-pay state |
| Employee profile | Identity header; prominent Current card; quieter Scheduled and History sections; activity in a separate tab/section | As-of date, reason, allowances, clear change action |
| Compensation form | Main entry column plus sticky context/preview on desktop; preview follows form on mobile | Currency/frequency clarity, before/after, conflict recovery |
| Analytics | As-of, cohort, metric and currency controls first; summary, breakdown table, distribution/trend chart | Methodology, FX coverage, excluded counts, table equivalent |
| Import | Six-step progress at top; one task per step; validation grid and count summary before commit | Download error file, warning acknowledgement, job status |
| Export | Dataset/field selection, snapshot preview, generation status | Scope, date, currency basis, expiry, audit reference |
| Administration | Focused lists/forms for users, allowance types, references, FX, audit | Role/scope summary, destructive confirmation, audit detail |

The above screen purposes and flow states follow the [UX specification](specs/product-ux-spec.md). The design must not add payroll language or imply that estimated annual base compensation equals cash paid.

## 9. Analytics and monetary display

Analytics should read like an answer with its conditions attached. A metric card pairs the value with **as-of date**, **population**, **currency**, and a concise qualifier such as **Annualized base** or **Partial: 12 employees lack FX rates**. Put detailed formula and rate provenance in a readily reachable Methodology panel, not a hidden tooltip alone.

Use neutral bars for a single series. For multiple series, choose a small accessible sequence with direct labels; avoid relying on a legend/color match when labels fit. Charts never hide excluded hourly employees, missing compensation, or missing exchange rates. A data table below each chart gives exact values. Do not visualize percentages when old and new packages have incomparable currency or frequency.

Money formatting is locale-aware but unambiguous: full value in primary contexts, ISO code, pay frequency, and effective period. Zero, missing, and excluded are different states. Example copy:

> ₹1,250,000 INR / year · Effective from 1 Apr 2026  
> Target variable pay: Not specified  
> Estimated annual base spend: Partial · 12 records excluded because FX rates are missing

## 10. Motion and accessibility

- Keep transitions brief, about 120–180 ms for hover/focus and 180–240 ms for an overlay. Respect `prefers-reduced-motion`; no animation is needed to understand a state change.
- Meet WCAG 2.2 AA for contrast, keyboard operation, focus visibility, labels, error announcement, and chart alternatives. Test actual foreground/background pairs; palette names alone do not prove contrast.
- Preserve logical heading and tab order. Opening a sheet/dialog moves focus into it; closing restores focus to its trigger. Filters and data changes announce result count or status to assistive technology without repeated noise.
- Do not use color alone for Current/Scheduled/Past, validation, or import status. Make icon-only controls named and discoverable.
- Format dates and money for locale, while retaining ISO currency codes and a clear effective-date policy. Avoid truncating employee names or amounts without an accessible full value.

## 11. Implementation handoff

1. Establish a small token layer in `frontend/src/index.css`: Inter font mapping, Neutral semantic colors, radius, and Coss semantic status tokens. Add a light theme first; apply equivalent dark tokens only when dark mode is implemented and tested.
2. Replace Lucide icons in product components with Phosphor. `components.json` currently names Lucide, so inspect generated files and change any copied icon imports. Do not assume a registry generator can select Phosphor automatically.
3. Keep existing shadcn Button/Card/Badge until a screen is migrated. For each migrated pattern, choose one component owner, update its API use, and verify keyboard/focus behavior. Coss's Base UI overlays need an isolated application root for reliable layering; follow its [root isolation guidance](https://coss.com/ui/docs/styling).
4. Build product-level primitives first: AppShell, PageHeader, Money, PackageState, AsOfDate, EmptyState, ErrorState, FilterBar, MetricDefinition, and AuditSummary. Reuse them across screens.
5. Implement screens in the order users need them: directory → profile → compensation form → overview → imports/exports → analytics → administration. Connect sensitive screens only after authentication, role, and scope checks exist in the backend.
6. Check every finished screen at desktop, tablet, and mobile widths; keyboard-only and screen-reader use; light theme contrast; mixed-currency and missing-data states; long names and large amounts; loading, empty, error, and permission states.

The employee directory, creation sheet, and read-only compensation profile now apply this design. The other product screens in this document remain target designs until implemented.

## 12. Reference documentation

- [shadcn/ui Vite setup](https://ui.shadcn.com/docs/installation/vite) and [component configuration](https://ui.shadcn.com/docs/components-json)
- [Coss UI getting started](https://coss.com/ui/docs/get-started), [styling](https://coss.com/ui/docs/styling), and [Radix migration](https://coss.com/ui/docs/radix-migration)
- [Phosphor React package](https://github.com/phosphor-icons/react) and [icon catalog](https://phosphoricons.com/)
- [Tailwind colors](https://tailwindcss.com/docs/colors) and [Fontsource variable fonts](https://fontsource.org/docs/getting-started/variable)
