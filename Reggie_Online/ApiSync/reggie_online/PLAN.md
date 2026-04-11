# Frontend Migration Plan (React + TypeScript + Vite + Tailwind)

This plan covers architecture and migration strategy only. It does not implement application code.

## 1) Recommended Project Folder Structure

```text
reggie_online/
  src/
    api/
      client.ts
      permissions.ts
      metadata.ts
    websocket/
      pingSocket.ts
    components/
      Header/
        Header.tsx
      Dashboard/
        SensorGrid.tsx
        SensorCard.tsx
      Modals/
        SensorDetailsModal.tsx
        ExperimentModal.tsx
        ConfirmModal.tsx
    pages/
      DashboardPage.tsx
    store/
      dashboard.store.ts
    hooks/
      useRealtimePing.ts
    utils/
      date.ts
    App.tsx
    main.tsx
```

This lighter structure is recommended for Phase 1 and can be expanded later if the app grows.

## 2) Proposed Page Structure

- `DashboardPage`: primary operational page; contains header, selection context, grid, filters, and modal host.
- Routing model: start with one main route (`/`) and internal panels; keep route split minimal in phase 1 to preserve behavior.
- Setup flow note: keep setup initially as a section/panel inside `DashboardPage`; if complexity grows, promote it to a dedicated page later.

## 3) Proposed Component Tree

- `App`
- `DashboardPage`
- `Header`
- `SensorGrid`
- `SensorCard` (status, validation, LLA copy, ping pulse, actions)

Earliest implementation option:
- start with no modals, or only `SensorDetailsModal` if metadata inspection is needed early.

Later-phase modal additions:
- `ExperimentModal` (start/end flow)
- `ConfirmModal`

## 4) Proposed API Layer Structure

- `src/api/client.ts`
  - Central fetch wrapper (base URL, timeout, JSON parsing, typed errors).
- `src/api/permissions.ts`
  - `resolvePermissions(email)` using `/GCP-FS/permissions/resolve`.
- `src/api/metadata.ts`
  - `getActiveMetadata(owner, macAddress, lla)` -> `/GCP-FS/metadata/active`
  - `getSensorsMetadata(owner, macAddress, expName?)` -> `/GCP-FS/metadata/sensors`
  - `getLastPackage(owner, macAddress, expName?)` -> `/GCP-FS/last-package`
  - `getExperiments(owner, macAddress)` -> `/GCP-FS/metadata/experiments`
- metadata write calls (`/FS/sensor/update-metadata`) are added when edit flows are enabled in later phases.
- Contract rule: preserve existing backend field names and compatibility (`owner`/`hostname`, `mac_address`, `LLA`, `Active_Exp`, `Last_Package`).

## 5) Proposed WebSocket Layer Structure

- `src/websocket/pingSocket.ts`
  - lifecycle: connect, disconnect, reconnect, parse incoming ping payloads.
- frontend behavior to preserve:
  - treat `Ping` as primary realtime stream.
  - do not expect `Last_Package` broadcast (default backend mode stores only).
  - maintain duplicate-by-LLA suppression and update existing card on repeated ping.
  - keep validation-based display split:
    - valid or "LLA not found" -> main sensor grid
    - other validation failures -> error/debug panel.

## 6) Proposed State Management Approach

- Use one initial store: `src/store/dashboard.store.ts`.
- Initial store domains:
  - `sensors`
  - `experiments`
  - `metadata`
  - `websocket`
  - `ui`
- Data flow:
  - WS events update `sensors` immediately.
  - REST queries hydrate metadata/experiments and enrich sensor cards.
  - derived selectors drive filtered/sorted views to keep rendering deterministic.
- If complexity grows, split this store into domain stores in later phases.

## 7) Mapping: Old HTML Features -> New React Components

- header icons + actions -> `Header`
- MAC / experiment / active stats strip -> `Header`
- owner/device/experiment selection -> `DashboardPage` (selection block)
- sensor grid cards -> `SensorGrid` + `SensorCard`
- sort dropdown -> `DashboardPage` controls (later extract to dedicated component if needed)
- activity/label filter dropdown -> `DashboardPage` controls (later extract to dedicated component if needed)
- sensor details modal (active/inactive edit behavior) -> `SensorDetailsModal`
- experiment start/end flow modal -> `ExperimentModal`
- custom alert confirm dialog -> `ConfirmModal`
- setup checklist block -> later phase component
- alerts assignment/summary modal -> later phase component
- labels assignment/summary modal -> later phase component
- 2D/3D map modal -> later phase component
- swap sensor unit modal -> later phase component
- batch names modal -> later phase component
- batch coordinates modal -> later phase component
- verify sensors before start -> later phase component
- ping/new-copy toasts -> later phase component
- error/debug list panel -> later phase component

## 8) Recommended Migration Order (Phases)

- Phase 0: Skeleton only
  - create app skeleton and base file layout without feature workflows.
- Phase 1: Read-only parity
  - dashboard page, header, selection context, sensor grid rendering, ping websocket, sorting/filtering basics, health check.
- Phase 2: Metadata interaction
  - `SensorDetailsModal` and metadata fetch by LLA.
- Phase 3: Guarded action flows
  - `ExperimentModal` and `ConfirmModal` for guarded actions.
- Phase 4: Advanced workflows
  - remaining modal workflows (alerts, labels, map, swap, batch names/coords, verify), plus CSV import/export and label helpers.
- Phase 5: Hardening
  - accessibility, test coverage, performance checks, UX consistency, error instrumentation.

## 9) Risks / Things To Be Careful About

- Contract drift risk: backend field casing and aliases are inconsistent (`owner` vs `hostname`, `LLA` casing); use strict mappers.
- Realtime assumptions risk: frontend must not assume `Last_Package` websocket broadcast while disabled by backend.
- Data merge risk: ping stream and REST metadata can race; merge by `LLA` deterministically.
- UX regression risk: modal workflows are numerous; preserve close behavior, unsaved-state handling, and status colors.
- Sorting/filtering parity risk: current logic includes activity classes (active/inactive/indefinite/replaced) and label filters.
- Bulk update safety: batch metadata writes should validate payload shape and show partial-failure feedback.
- Time display consistency: preserve UTC input and local formatting behavior.

## 10) Features To Postpone Until Later

- deep visual redesign beyond parity.
- map visualization enhancement beyond existing 2D/3D behavior.
- advanced alert-rule builder UX improvements.
- websocket message types beyond current `Ping` handling needs.
- offline mode and caching strategy changes.
- broad refactor of experiment lifecycle business logic.
- performance optimization passes before behavioral parity is reached.
- utility expansion (`csv`, label parsing, validation helper modules) beyond `utils/date.ts`.

## Migration Success Criteria (Planning-Level)

- same backend endpoint contracts and websocket expectations are preserved.
- operator can complete core flows: connect, monitor ping, inspect metadata, edit permitted metadata.
- old dashboard sections are represented by clear React component boundaries.
- architecture supports future growth without reintroducing monolithic page logic.
