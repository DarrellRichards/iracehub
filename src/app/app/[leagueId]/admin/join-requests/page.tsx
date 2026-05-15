"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

interface LeagueSummary {
  id: string;
  iracingLeagueId: number | null;
  routeLeagueId: string;
  leagueName: string;
  owner: boolean;
  admin: boolean;
}

interface JoinRequestEntry {
  id: string;
  requesterCustId: number;
  fullName: string;
  state: string;
  country: string;
  whyJoin: string;
  status: "PENDING" | "APPROVED" | "DECLINED";
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  requestedSeries: Array<{ id: string; name: string }>;
  isLeagueMember: boolean;
  reviewedBy: {
    id: string;
    displayName: string | null;
    iracingCustId: number;
  } | null;
}

interface JoinRequestsPayload {
  league: {
    id: string;
    leagueName: string;
    iracingLeagueId: number | null;
    url: string | null;
  };
  requests: JoinRequestEntry[];
}

async function readJsonSafely<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function getApiErrorMessage(response: Response, fallback: string) {
  const payload = await readJsonSafely<{ error?: string; message?: string }>(
    response,
  );

  if (payload?.message) return payload.message;
  if (payload?.error) return payload.error;

  return fallback;
}

export default function JoinRequestsPage() {
  const { session, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ leagueId: string }>();

  const [league, setLeague] = useState<LeagueSummary | null>(null);
  const [requests, setRequests] = useState<JoinRequestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningRequestId, setActioningRequestId] = useState<string | null>(
    null,
  );
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [manualIracingUrl, setManualIracingUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !session?.authenticated) {
      router.replace("/");
    }
  }, [authLoading, session, router]);

  useEffect(() => {
    if (!session?.authenticated) return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const leaguesResponse = await fetch("/api/leagues", {
          cache: "no-store",
        });

        const leaguesPayload = await readJsonSafely<{
          leagues?: LeagueSummary[];
          error?: string;
        }>(leaguesResponse);

        if (!leaguesResponse.ok) {
          throw new Error(leaguesPayload?.error ?? "failed_to_load_leagues");
        }

        const foundLeague =
          leaguesPayload?.leagues?.find(
            (leagueItem) =>
              leagueItem.id === params.leagueId ||
              leagueItem.routeLeagueId === params.leagueId ||
              String(leagueItem.iracingLeagueId) === params.leagueId,
          ) ?? null;

        if (!foundLeague) {
          throw new Error("league_not_found");
        }

        if (!foundLeague.owner && !foundLeague.admin) {
          throw new Error("forbidden_not_owner_or_admin");
        }

        setLeague(foundLeague);

        const joinRequestsResponse = await fetch(
          `/api/leagues/${foundLeague.id}/join-requests`,
          {
            cache: "no-store",
          },
        );

        const joinRequestsPayload = await readJsonSafely<
          JoinRequestsPayload & { error?: string }
        >(joinRequestsResponse);

        if (!joinRequestsResponse.ok || !joinRequestsPayload) {
          throw new Error(
            joinRequestsPayload?.error ?? "failed_to_load_join_requests",
          );
        }

        setRequests(joinRequestsPayload.requests);
      } catch (err) {
        setError(err instanceof Error ? err.message : "unknown_error");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [session?.authenticated, params.leagueId]);

  const pendingCount = useMemo(
    () => requests.filter((request) => request.status === "PENDING").length,
    [requests],
  );

  async function reviewRequest(
    requestId: string,
    action: "approve" | "decline",
  ) {
    if (!league) return;

    setActioningRequestId(requestId);
    setActionNotice(null);
    setManualIracingUrl(null);

    try {
      const response = await fetch(
        `/api/leagues/${league.id}/join-requests/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );

      if (!response.ok) {
        const message = await getApiErrorMessage(response, "failed_to_review");
        throw new Error(message);
      }

      const payload =
        (await readJsonSafely<{
          request?: {
            id: string;
            status: "PENDING" | "APPROVED" | "DECLINED";
            reviewedAt: string | null;
          };
          needsManualIracingAdd?: boolean;
          iracingLeagueAdminUrl?: string | null;
        }>(response)) ?? {};

      setRequests((prev) =>
        prev.map((entry) =>
          entry.id === requestId
            ? {
                ...entry,
                status: payload.request?.status ?? entry.status,
                reviewedAt: payload.request?.reviewedAt ?? entry.reviewedAt,
              }
            : entry,
        ),
      );

      if (action === "approve") {
        if (payload.needsManualIracingAdd && payload.iracingLeagueAdminUrl) {
          setManualIracingUrl(payload.iracingLeagueAdminUrl);
          setActionNotice(
            "Request approved. Driver is not on your synced roster yet—add them in iRacing, then sync members.",
          );
        } else {
          setActionNotice("Request approved.");
        }
      } else {
        setActionNotice("Request declined.");
      }
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : "review_failed");
    } finally {
      setActioningRequestId(null);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
      </div>
    );
  }

  if (!session?.authenticated) return null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link
            href="/dashboard"
            className="text-xl font-black tracking-tight transition-opacity hover:opacity-80"
          >
            i<span className="text-red-500">Race</span>Hub
          </Link>
          <div className="flex items-center gap-3">
            {league && (
              <>
                <Link
                  href={`/app/${league.routeLeagueId}/admin`}
                  className="text-sm text-zinc-400 transition-colors hover:text-white"
                >
                  ← Admin Panel
                </Link>
                <Link
                  href={`/app/${league.routeLeagueId}`}
                  className="text-sm text-zinc-400 transition-colors hover:text-white"
                >
                  League View
                </Link>
              </>
            )}
            <button
              onClick={logout}
              className="rounded-lg border border-zinc-700 px-4 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        {error ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <Link
              href="/dashboard"
              className="mt-4 inline-block text-sm text-zinc-400 hover:text-white"
            >
              ← Back to Dashboard
            </Link>
          </div>
        ) : league ? (
          <>
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">
                Admin
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">
                Join Requests
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                {league.leagueName} · {pendingCount} pending
              </p>
            </div>

            {actionNotice && (
              <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-200">
                <p>{actionNotice}</p>
                {manualIracingUrl && (
                  <a
                    href={manualIracingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm font-semibold text-red-300 hover:text-red-200"
                  >
                    Open iRacing league page →
                  </a>
                )}
              </div>
            )}

            {requests.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
                <p className="text-sm text-zinc-400">No join requests yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {requests.map((request) => (
                  <article
                    key={request.id}
                    className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-bold text-white">
                          {request.fullName}
                        </h2>
                        <p className="mt-1 text-sm text-zinc-400">
                          iRacing ID: {request.requesterCustId} ·{" "}
                          {request.state}, {request.country}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest ${
                          request.status === "PENDING"
                            ? "border border-amber-500/40 bg-amber-500/10 text-amber-300"
                            : request.status === "APPROVED"
                              ? "border border-green-500/40 bg-green-500/10 text-green-300"
                              : "border border-zinc-700 bg-zinc-800 text-zinc-300"
                        }`}
                      >
                        {request.status}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                          Why they want to join
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">
                          {request.whyJoin}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                          Requested Series
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {request.requestedSeries.map((series) => (
                            <span
                              key={series.id}
                              className="rounded-full border border-zinc-700 bg-zinc-950/70 px-2.5 py-1 text-xs text-zinc-200"
                            >
                              {series.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                      <span>
                        Submitted {new Date(request.createdAt).toLocaleString()}
                      </span>
                      {request.isLeagueMember && (
                        <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-blue-300">
                          Already synced as member
                        </span>
                      )}
                      <Link
                        href={`/app/drivers/${request.requesterCustId}?league=${league.routeLeagueId}`}
                        className="text-zinc-300 hover:text-white"
                      >
                        View driver profile →
                      </Link>
                    </div>

                    {request.status === "PENDING" && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() =>
                            void reviewRequest(request.id, "approve")
                          }
                          disabled={actioningRequestId === request.id}
                          className="rounded-lg border border-green-700/60 px-3 py-1.5 text-sm font-semibold text-green-300 transition-colors hover:border-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actioningRequestId === request.id
                            ? "Saving..."
                            : "Approve"}
                        </button>
                        <button
                          onClick={() =>
                            void reviewRequest(request.id, "decline")
                          }
                          disabled={actioningRequestId === request.id}
                          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actioningRequestId === request.id
                            ? "Saving..."
                            : "Decline"}
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
