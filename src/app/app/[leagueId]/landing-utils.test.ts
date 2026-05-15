import { describe, expect, it } from "vitest";
import {
  REGISTRATION_LOCK_WINDOW_MS,
  calculateLandingStats,
  flattenUpcomingEvents,
  fmtPoints,
  getActiveSeries,
  getRegistrationState,
  pickFeaturedNextRace,
  readJsonSafely,
  relativeEventLabel,
} from "./landing-utils";

describe("landing-utils", () => {
  it("formats points for whole and decimal values", () => {
    expect(fmtPoints(10)).toBe("10");
    expect(fmtPoints(10.5)).toBe("10.5");
    expect(fmtPoints(10.25)).toBe("10.3");
  });

  it("returns relative labels for today, tomorrow, days out, and upcoming", () => {
    const now = new Date("2026-05-15T12:00:00Z").getTime();

    expect(relativeEventLabel("2026-05-15T17:00:00Z", now)).toBe("Today");
    expect(relativeEventLabel("2026-05-16T17:00:00Z", now)).toBe("Tomorrow");
    expect(relativeEventLabel("2026-05-18T17:00:00Z", now)).toBe("In 3 days");
    expect(relativeEventLabel("2026-05-25T17:00:00Z", now)).toBe("Upcoming");
  });

  it("closes registration when disabled", () => {
    const state = getRegistrationState({
      eventDate: "2026-05-16T12:00:00Z",
      registrationEnabled: false,
      hasResults: false,
    });

    expect(state.isClosed).toBe(true);
    expect(state.summaryLabel).toBe("Disabled");
  });

  it("closes registration when results are posted", () => {
    const state = getRegistrationState({
      eventDate: "2026-05-16T12:00:00Z",
      registrationEnabled: true,
      hasResults: true,
    });

    expect(state.isClosed).toBe(true);
    expect(state.summaryLabel).toBe("Results posted");
  });

  it("closes registration once event has passed", () => {
    const now = new Date("2026-05-16T13:00:00Z").getTime();
    const state = getRegistrationState(
      {
        eventDate: "2026-05-16T12:00:00Z",
        registrationEnabled: true,
        hasResults: false,
      },
      now,
    );

    expect(state.isClosed).toBe(true);
    expect(state.summaryLabel).toBe("Event passed");
  });

  it("closes registration within lock window", () => {
    const eventDate = "2026-05-16T12:00:00Z";
    const now =
      new Date(eventDate).getTime() - REGISTRATION_LOCK_WINDOW_MS + 60_000;

    const state = getRegistrationState(
      {
        eventDate,
        registrationEnabled: true,
        hasResults: false,
      },
      now,
    );

    expect(state.isClosed).toBe(true);
    expect(state.summaryLabel).toBe("Closed within 20 min");
  });

  it("keeps registration open before lock window", () => {
    const eventDate = "2026-05-16T12:00:00Z";
    const now =
      new Date(eventDate).getTime() - REGISTRATION_LOCK_WINDOW_MS - 60_000;

    const state = getRegistrationState(
      {
        eventDate,
        registrationEnabled: true,
        hasResults: false,
      },
      now,
    );

    expect(state.isClosed).toBe(false);
    expect(state.summaryLabel).toBeNull();
  });

  it("calculates landing stats with null-safe defaults", () => {
    expect(calculateLandingStats(null)).toEqual({
      memberCount: 0,
      seriesCount: 0,
      nextEvents: 0,
    });

    expect(
      calculateLandingStats({
        league: { rosterCount: 24 },
        series: [
          { id: "a", name: "A", nextEvent: null },
          {
            id: "b",
            name: "B",
            nextEvent: {
              id: "ev-1",
              eventDate: "2026-05-20T01:00:00Z",
              raceName: "Race",
              registrationEnabled: true,
              registrationCount: 10,
              isRegisteredByMe: false,
              importedSession: null,
              trackName: null,
              raceLength: null,
            },
          },
        ],
      }),
    ).toEqual({
      memberCount: 24,
      seriesCount: 2,
      nextEvents: 1,
    });
  });

  it("picks the soonest featured race", () => {
    const featured = pickFeaturedNextRace([
      {
        id: "late",
        name: "Late Series",
        season: { seasonName: "S2" },
        nextEvent: {
          id: "ev-late",
          eventDate: "2026-06-20T12:00:00Z",
          raceName: "Late Race",
          registrationEnabled: true,
          registrationCount: 1,
          isRegisteredByMe: false,
          importedSession: null,
          trackName: null,
          raceLength: null,
        },
      },
      {
        id: "soon",
        name: "Soon Series",
        season: { seasonName: "S1" },
        nextEvent: {
          id: "ev-soon",
          eventDate: "2026-05-20T12:00:00Z",
          raceName: "Soon Race",
          registrationEnabled: true,
          registrationCount: 1,
          isRegisteredByMe: false,
          importedSession: null,
          trackName: null,
          raceLength: null,
        },
      },
    ]);

    expect(featured?.seriesId).toBe("soon");
    expect(featured?.event.id).toBe("ev-soon");
  });

  it("flattens and sorts upcoming events", () => {
    const events = flattenUpcomingEvents([
      {
        id: "2",
        name: "Second",
        nextEvent: {
          id: "ev-2",
          eventDate: "2026-05-22T12:00:00Z",
          raceName: "Two",
          registrationEnabled: true,
          registrationCount: 0,
          isRegisteredByMe: false,
          importedSession: null,
          trackName: null,
          raceLength: null,
        },
      },
      {
        id: "1",
        name: "First",
        nextEvent: {
          id: "ev-1",
          eventDate: "2026-05-20T12:00:00Z",
          raceName: "One",
          registrationEnabled: true,
          registrationCount: 0,
          isRegisteredByMe: false,
          importedSession: null,
          trackName: null,
          raceLength: null,
        },
      },
      {
        id: "none",
        name: "None",
        nextEvent: null,
      },
    ]);

    expect(events).toHaveLength(2);
    expect(events[0].seriesId).toBe("1");
    expect(events[1].seriesId).toBe("2");
  });

  it("selects active series with sensible fallback", () => {
    const series = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ];

    expect(getActiveSeries(series, "b")?.id).toBe("b");
    expect(getActiveSeries(series, "missing")?.id).toBe("a");
    expect(getActiveSeries(series, null)?.id).toBe("a");
    expect(getActiveSeries([], null)).toBeNull();
  });

  it("parses json safely and returns null for invalid payloads", async () => {
    const valid = new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
    const invalid = new Response("not-json", {
      headers: { "content-type": "application/json" },
    });
    const empty = new Response("   ");

    await expect(readJsonSafely<{ ok: boolean }>(valid)).resolves.toEqual({
      ok: true,
    });
    await expect(readJsonSafely(invalid)).resolves.toBeNull();
    await expect(readJsonSafely(empty)).resolves.toBeNull();
  });
});
