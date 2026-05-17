import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import {
  currentRoute,
  navigateTo,
  subscribeRoute,
  initRouter,
  __resetRouterForTests,
  routeToActiveView,
  activeViewToRoute,
  type RouteState,
} from '../../src/lib/router';
import { uiStore } from '../../src/lib/stores/ui';

function setPath(pathname: string): void {
  window.history.replaceState({}, '', pathname);
}

beforeEach(() => {
  __resetRouterForTests();
  setPath('/');
  uiStore.reset();
});

afterEach(() => {
  // Defensive: dispatching popstate after a test ends would invoke the
  // listener installed by initRouter in another test's context. Reset.
  __resetRouterForTests();
});

describe('routeToActiveView ↔ activeViewToRoute', () => {
  it('maps router names to uiStore ActiveView values', () => {
    expect(routeToActiveView('overview')).toBe('overview');
    expect(routeToActiveView('live')).toBe('live');
    expect(routeToActiveView('investigate')).toBe('diagnose');
    expect(routeToActiveView('endpoint')).toBe('diagnose');
    expect(routeToActiveView('report')).toBe('report');
  });

  it('maps uiStore ActiveView values back to router names', () => {
    expect(activeViewToRoute('overview')).toBe('overview');
    expect(activeViewToRoute('live')).toBe('live');
    expect(activeViewToRoute('diagnose')).toBe('investigate');
    expect(activeViewToRoute('report')).toBe('report');
  });

  it('coerces legacy strata/terminal ActiveView values to overview', () => {
    expect(activeViewToRoute('strata')).toBe('overview');
    expect(activeViewToRoute('terminal')).toBe('overview');
  });
});

describe('initRouter — URL parsing on boot', () => {
  it('parses / as overview', () => {
    setPath('/');
    initRouter();
    expect(currentRoute()).toEqual({ name: 'overview', endpointId: null });
    expect(get(uiStore).activeView).toBe('overview');
  });

  it('parses /live as live route', () => {
    setPath('/live');
    initRouter();
    expect(currentRoute()).toEqual({ name: 'live', endpointId: null });
    expect(get(uiStore).activeView).toBe('live');
  });

  it('parses /investigate as investigate landing', () => {
    setPath('/investigate');
    initRouter();
    expect(currentRoute()).toEqual({ name: 'investigate', endpointId: null });
    expect(get(uiStore).activeView).toBe('diagnose');
  });

  it('parses /report as report', () => {
    setPath('/report');
    initRouter();
    expect(currentRoute()).toEqual({ name: 'report', endpointId: null });
    expect(get(uiStore).activeView).toBe('report');
  });

  it('parses /endpoint/<valid-id> as endpoint route and writes focusedEndpointId', () => {
    setPath('/endpoint/abc123');
    initRouter();
    expect(currentRoute()).toEqual({ name: 'endpoint', endpointId: 'abc123' });
    expect(get(uiStore).activeView).toBe('diagnose');
    expect(get(uiStore).focusedEndpointId).toBe('abc123');
  });

  it('parses /endpoint/<id-with-dashes-and-underscores> correctly', () => {
    setPath('/endpoint/shared-ep-3-1721481234567');
    initRouter();
    expect(currentRoute()).toEqual({ name: 'endpoint', endpointId: 'shared-ep-3-1721481234567' });
  });

  it('URL is authoritative — overrides persisted activeView', () => {
    uiStore.setActiveView('live');
    setPath('/');
    initRouter();
    expect(get(uiStore).activeView).toBe('overview');
  });

  it('does NOT clear persisted focusedEndpointId on non-endpoint routes', () => {
    uiStore.setFocusedEndpoint('persisted-id');
    setPath('/live');
    initRouter();
    expect(get(uiStore).activeView).toBe('live');
    // The router writes focusedEndpointId only when navigating TO an
    // endpoint route. Persisted in-page focus survives.
    expect(get(uiStore).focusedEndpointId).toBe('persisted-id');
  });
});

describe('initRouter — endpointId validation (anchored regex)', () => {
  it('redirects /endpoint/abc@malicious to /investigate', () => {
    setPath('/endpoint/abc@malicious');
    initRouter();
    expect(currentRoute()).toEqual({ name: 'investigate', endpointId: null });
    expect(window.location.pathname).toBe('/investigate');
  });

  it('redirects /endpoint/abc/def to /investigate', () => {
    setPath('/endpoint/abc/def');
    initRouter();
    expect(currentRoute()).toEqual({ name: 'investigate', endpointId: null });
  });

  it('redirects /endpoint/abc.def to /investigate', () => {
    setPath('/endpoint/abc.def');
    initRouter();
    expect(currentRoute()).toEqual({ name: 'investigate', endpointId: null });
  });

  it('redirects /endpoint/<script> to /investigate', () => {
    setPath('/endpoint/<script>');
    initRouter();
    expect(currentRoute()).toEqual({ name: 'investigate', endpointId: null });
  });

  it('redirects /endpoint/ (empty id) to /investigate', () => {
    setPath('/endpoint/');
    initRouter();
    expect(currentRoute()).toEqual({ name: 'investigate', endpointId: null });
  });

  it('redirects /endpoint/<65-char-id> to /investigate (over length cap)', () => {
    const tooLong = 'a'.repeat(65);
    setPath(`/endpoint/${tooLong}`);
    initRouter();
    expect(currentRoute()).toEqual({ name: 'investigate', endpointId: null });
  });

  it('accepts /endpoint/<exactly-64-char-id> (boundary case)', () => {
    const maxLen = 'a'.repeat(64);
    setPath(`/endpoint/${maxLen}`);
    initRouter();
    expect(currentRoute()).toEqual({ name: 'endpoint', endpointId: maxLen });
  });

  it('redirects /unknown-path to / (overview)', () => {
    setPath('/unknown-path');
    initRouter();
    expect(currentRoute()).toEqual({ name: 'overview', endpointId: null });
    expect(window.location.pathname).toBe('/');
  });
});

describe('navigateTo', () => {
  beforeEach(() => initRouter());

  it('pushes /endpoint/X and writes uiStore.focusedEndpointId', () => {
    navigateTo({ name: 'endpoint', endpointId: 'aws' });
    expect(window.location.pathname).toBe('/endpoint/aws');
    expect(currentRoute()).toEqual({ name: 'endpoint', endpointId: 'aws' });
    expect(get(uiStore).focusedEndpointId).toBe('aws');
    expect(get(uiStore).activeView).toBe('diagnose');
  });

  it('navigating away from /endpoint/X does NOT clear focusedEndpointId', () => {
    navigateTo({ name: 'endpoint', endpointId: 'aws' });
    expect(get(uiStore).focusedEndpointId).toBe('aws');
    navigateTo({ name: 'live', endpointId: null });
    // Router does not own focus state; preserves prior value for in-page consumers.
    expect(get(uiStore).focusedEndpointId).toBe('aws');
  });

  it('replace: true uses replaceState instead of pushState', () => {
    const initialLength = window.history.length;
    navigateTo({ name: 'live', endpointId: null });
    const afterPush = window.history.length;
    navigateTo({ name: 'report', endpointId: null }, { replace: true });
    const afterReplace = window.history.length;
    expect(afterPush).toBe(initialLength + 1);
    expect(afterReplace).toBe(afterPush);
  });

  it('updates uiStore.activeView on every navigation', () => {
    navigateTo({ name: 'live', endpointId: null });
    expect(get(uiStore).activeView).toBe('live');
    navigateTo({ name: 'investigate', endpointId: null });
    expect(get(uiStore).activeView).toBe('diagnose');
    navigateTo({ name: 'report', endpointId: null });
    expect(get(uiStore).activeView).toBe('report');
  });
});

describe('subscribeRoute', () => {
  beforeEach(() => initRouter());

  it('fires handler on every navigateTo call', () => {
    const received: RouteState[] = [];
    subscribeRoute((state) => received.push(state));
    navigateTo({ name: 'live', endpointId: null });
    navigateTo({ name: 'investigate', endpointId: null });
    expect(received).toEqual([
      { name: 'live', endpointId: null },
      { name: 'investigate', endpointId: null },
    ]);
  });

  it('unsubscribe stops further notifications', () => {
    const received: RouteState[] = [];
    const off = subscribeRoute((state) => received.push(state));
    navigateTo({ name: 'live', endpointId: null });
    off();
    navigateTo({ name: 'investigate', endpointId: null });
    expect(received).toHaveLength(1);
  });

  it('subscriber crash does not break navigation', () => {
    subscribeRoute(() => { throw new Error('boom'); });
    expect(() => navigateTo({ name: 'live', endpointId: null })).not.toThrow();
    expect(currentRoute()).toEqual({ name: 'live', endpointId: null });
  });
});

describe('popstate (browser back/forward)', () => {
  beforeEach(() => initRouter());

  it('updates currentRoute and uiStore on popstate', () => {
    setPath('/live');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(currentRoute()).toEqual({ name: 'live', endpointId: null });
    expect(get(uiStore).activeView).toBe('live');
  });

  it('redirects to /investigate when back/forward lands on an invalid endpoint id', () => {
    setPath('/endpoint/<script>');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(currentRoute()).toEqual({ name: 'investigate', endpointId: null });
    expect(window.location.pathname).toBe('/investigate');
  });

  it('fires subscribers on popstate', () => {
    const received: RouteState[] = [];
    subscribeRoute((state) => received.push(state));
    setPath('/report');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(received).toEqual([{ name: 'report', endpointId: null }]);
  });
});
