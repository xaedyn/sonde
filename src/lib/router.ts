// src/lib/router.ts
// Hand-rolled URL router for the synthesis arc. The codebase had no
// client-side router before this; views were mounted by Layout via an
// {#if activeView === ...} switch on $uiStore.activeView.
//
// This wrapper turns the browser URL into the source of truth for the
// active view (and the focused endpoint when the route is /endpoint/:id).
// It does NOT take exclusive ownership of uiStore.focusedEndpointId —
// LiveView's solo-mode trace, ReportView's endpoint highlighting,
// keyboard shortcuts, and persisted-focus rehydration all continue to
// read and write that field directly. See the synthesis design contract
// section "Routing Infrastructure" for the full contract.

import { uiStore } from './stores/ui';
import type { ActiveView } from './types';

export type RouteName = 'overview' | 'live' | 'investigate' | 'endpoint' | 'report';

// Discriminated union so { name: 'endpoint', endpointId: null } cannot typecheck.
export type RouteState =
  | { readonly name: 'overview' | 'live' | 'investigate' | 'report'; readonly endpointId: null }
  | { readonly name: 'endpoint'; readonly endpointId: string };

const ENDPOINT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

// Map router → uiStore. The router uses 'investigate' as the user-facing
// label; uiStore retains the legacy 'diagnose' value for the same surface.
function routeToActiveView(name: RouteName): ActiveView {
  switch (name) {
    case 'overview':    return 'overview';
    case 'live':        return 'live';
    case 'investigate': return 'diagnose';
    case 'endpoint':    return 'diagnose';
    case 'report':      return 'report';
  }
}

// Map uiStore → router. Legacy persisted values ('strata', 'terminal')
// coerce to 'overview' — same fallback as readActiveView in persistence.ts.
function activeViewToRoute(active: ActiveView): RouteName {
  switch (active) {
    case 'overview': return 'overview';
    case 'live':     return 'live';
    case 'diagnose': return 'investigate';
    case 'report':   return 'report';
    case 'strata':   return 'overview';
    case 'terminal': return 'overview';
  }
}

// Build the canonical path for a RouteState. Private — only navigateTo
// and initRouter call this.
function pathFor(state: RouteState): string {
  switch (state.name) {
    case 'overview':    return '/';
    case 'live':        return '/live';
    case 'investigate': return '/investigate';
    case 'endpoint':    return `/endpoint/${state.endpointId}`;
    case 'report':      return '/report';
  }
}

// Parse a pathname into a RouteState, OR null if the pathname is unknown
// or contains an invalid endpoint id. Callers redirect to '/investigate'
// (for /endpoint/* failures) or '/' (for other unknowns) when this returns
// null. Note: /diagnose is intentionally NOT handled here — Cloudflare's
// _redirects rewrites it to /investigate at the edge before JS runs.
function parsePath(pathname: string): RouteState | null {
  if (pathname === '/' || pathname === '') {
    return { name: 'overview', endpointId: null };
  }
  if (pathname === '/live') return { name: 'live', endpointId: null };
  if (pathname === '/investigate') return { name: 'investigate', endpointId: null };
  if (pathname === '/report') return { name: 'report', endpointId: null };
  if (pathname.startsWith('/endpoint/')) {
    const id = pathname.slice('/endpoint/'.length);
    // Empty id (/endpoint/), trailing slash, or anything that fails the
    // anchored validation regex → null (caller redirects to /investigate).
    if (id === '' || !ENDPOINT_ID_PATTERN.test(id)) return null;
    return { name: 'endpoint', endpointId: id };
  }
  return null;
}

// ── Module state ────────────────────────────────────────────────────────────

let currentState: RouteState = { name: 'overview', endpointId: null };
let subscribers = new Set<(state: RouteState) => void>();
let popstateBound = false;

// ── Public API ──────────────────────────────────────────────────────────────

export function currentRoute(): RouteState {
  return currentState;
}

export interface NavigateOptions {
  readonly replace?: boolean;
}

export function navigateTo(state: RouteState, options?: NavigateOptions): void {
  const path = pathFor(state);
  const history = typeof window !== 'undefined' ? window.history : null;
  if (history) {
    if (options?.replace === true) {
      history.replaceState({}, '', path);
    } else {
      history.pushState({}, '', path);
    }
  }
  applyRouteToStore(state);
  notify(state);
}

export function subscribeRoute(handler: (state: RouteState) => void): () => void {
  subscribers.add(handler);
  return () => { subscribers.delete(handler); };
}

// Called once from App.svelte's bootstrap, AFTER initHashRouter,
// initHostedReportRouter, and loadPersistedSettings have completed.
// The URL is authoritative for activeView from this point forward. For
// focusedEndpointId, the router writes when navigating TO an endpoint
// route but does not clear when navigating away — see the contract's
// "focusedEndpointId is semantically overloaded" section.
export function initRouter(): void {
  if (typeof window === 'undefined') return;
  const initial = parsePath(window.location.pathname);

  if (initial === null) {
    // Unknown path or invalid endpoint id. Redirect to /investigate for
    // endpoint failures (preserves intent); otherwise normalize to /.
    if (window.location.pathname.startsWith('/endpoint/')) {
      navigateTo({ name: 'investigate', endpointId: null }, { replace: true });
    } else {
      navigateTo({ name: 'overview', endpointId: null }, { replace: true });
    }
  } else {
    currentState = initial;
    applyRouteToStore(initial);
  }

  if (!popstateBound) {
    window.addEventListener('popstate', handlePopstate);
    popstateBound = true;
  }
}

// ── Internals ───────────────────────────────────────────────────────────────

function applyRouteToStore(state: RouteState): void {
  currentState = state;
  uiStore.setActiveView(routeToActiveView(state.name));
  // Write focusedEndpointId only when navigating TO an endpoint route.
  // Never clear it on other routes — preserves in-page focus state for
  // Live solo-mode, Report highlighting, etc.
  if (state.name === 'endpoint') {
    uiStore.setFocusedEndpoint(state.endpointId);
  }
}

function handlePopstate(): void {
  if (typeof window === 'undefined') return;
  const next = parsePath(window.location.pathname);
  if (next === null) {
    // Browser back/forward to an unknown URL — redirect.
    if (window.location.pathname.startsWith('/endpoint/')) {
      navigateTo({ name: 'investigate', endpointId: null }, { replace: true });
    } else {
      navigateTo({ name: 'overview', endpointId: null }, { replace: true });
    }
    return;
  }
  applyRouteToStore(next);
  notify(next);
}

function notify(state: RouteState): void {
  for (const handler of subscribers) {
    try {
      handler(state);
    } catch {
      // Subscriber crashes must not break navigation. Swallow.
    }
  }
}

// Test-only escape hatch — resets module state between unit tests.
// NOT for production use; not exported from any public barrel.
export function __resetRouterForTests(): void {
  currentState = { name: 'overview', endpointId: null };
  subscribers = new Set();
  popstateBound = false;
}

// Expose mapping for callers (e.g. tests, or surfaces that need the
// uiStore equivalent of a RouteName). Pure function, no side effects.
export { routeToActiveView, activeViewToRoute };
