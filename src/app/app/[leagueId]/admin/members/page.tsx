"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

interface Helmet {
  pattern: number;
  color1: string;
  color2: string;
  color3: string;
  face_type: number;
  helmet_type: number;
}

interface Member {
  id: string;
  custId: number;
  displayName: string;
  owner: boolean;
  admin: boolean;
  leagueMailOptOut: boolean | null;
  leaguePmOptOut: boolean | null;
  leagueMemberSince: string;
  carNumber: string | null;
  nickName: string | null;
  helmet: Helmet;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface LeagueDetail {
  id: string;
  iracingLeagueId: number | null;
  routeLeagueId: string;
  leagueName: string;
  smallLogo: string | null;
  rosterCount: number | null;
  owner: boolean;
  admin: boolean;
}

export default function AdminMembersPage() {
  const { session, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ leagueId: string }>();

  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberPage, setMemberPage] = useState(1);
  const [membersPerPage, setMembersPerPage] = useState(20);
  const [memberSearch, setMemberSearch] = useState("");
  const [syncingMembers, setSyncingMembers] = useState(false);

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
        const res = await fetch("/api/leagues", { cache: "no-store" });
        const data = (await res.json()) as {
          leagues?: LeagueDetail[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "fetch_failed");

        const found =
          data.leagues?.find(
            (l) =>
              l.id === params.leagueId ||
              l.routeLeagueId === params.leagueId ||
              String(l.iracingLeagueId) === params.leagueId,
          ) ?? null;

        if (!found) {
          setError("League not found or you are not a member.");
        } else if (!found.owner && !found.admin) {
          setError("You do not have admin access to this league.");
        } else {
          setLeague(found);

          // Fetch members
          const membersRes = await fetch(`/api/leagues/${found.id}/members`, {
            cache: "no-store",
          });

          if (membersRes.ok) {
            setMembers((await membersRes.json()) as Member[]);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "unknown_error");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [session?.authenticated, params.leagueId]);

  const handleSyncMembers = async () => {
    if (!league) return;

    setSyncingMembers(true);
    try {
      const response = await fetch(`/api/leagues/${league.id}/members/sync`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to sync members");
      }

      const updated = (await response.json()) as Member[];
      setMembers(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "failed_to_sync_members");
    } finally {
      setSyncingMembers(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session?.authenticated) return null;

  if (error && !league) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <Link
            href="/dashboard"
            className="text-zinc-400 hover:text-white text-sm"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const filteredMembers = members.filter((member) => {
    if (!normalizedMemberSearch) return true;

    const searchable = [
      member.displayName,
      member.nickName ?? "",
      member.carNumber ?? "",
      String(member.custId),
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(normalizedMemberSearch);
  });

  const totalMemberPages = Math.max(
    1,
    Math.ceil(filteredMembers.length / membersPerPage),
  );
  const currentMemberPage = Math.min(memberPage, totalMemberPages);
  const memberStartIndex = (currentMemberPage - 1) * membersPerPage;
  const paginatedMembers = filteredMembers.slice(
    memberStartIndex,
    memberStartIndex + membersPerPage,
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 mb-1">Admin Panel / Members</p>
            <h1 className="text-lg font-bold">{league?.leagueName}</h1>
          </div>
          <div className="flex items-center gap-3">
            {league && (
              <Link
                href={`/app/${league.routeLeagueId}`}
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                ← League View
              </Link>
            )}
            <button
              onClick={logout}
              className="rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors px-4 py-1.5 text-sm font-medium text-zinc-300 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-12">
        {league && (
          <div>
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold mb-2">League Members</h2>
                <p className="text-zinc-400">
                  {members.length} total members synced from iRacing
                </p>
              </div>
              <button
                onClick={handleSyncMembers}
                disabled={syncingMembers}
                className="rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-60 transition-colors px-4 py-2 text-sm font-medium text-white"
              >
                {syncingMembers ? "Syncing..." : "Sync from iRacing"}
              </button>
            </div>

            {/* Search and Filtering */}
            <div className="mb-6 flex items-center gap-3">
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => {
                  setMemberSearch(e.target.value);
                  setMemberPage(1);
                }}
                placeholder="Search by name, nickname, car #, or ID..."
                className="flex-1 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 px-4 py-2.5 text-sm focus:outline-none focus:border-red-500"
              />
              <select
                value={membersPerPage}
                onChange={(e) => {
                  setMembersPerPage(Number(e.target.value));
                  setMemberPage(1);
                }}
                className="rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 px-3 py-2.5 text-sm focus:outline-none focus:border-red-500"
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
              </select>
            </div>

            {members.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-12 text-center">
                <p className="text-zinc-400 text-sm mb-4">
                  No members synced yet. Sync members from iRacing to get
                  started.
                </p>
                <button
                  onClick={handleSyncMembers}
                  disabled={syncingMembers}
                  className="text-red-400 hover:text-red-300 text-sm font-medium"
                >
                  Sync members from iRacing →
                </button>
              </div>
            ) : (
              <>
                {/* Members Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {paginatedMembers.map((member) => (
                    <div
                      key={member.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-start gap-4">
                        {/* Helmet Visual */}
                        <div className="flex-shrink-0">
                          <div
                            className="w-12 h-12 rounded-lg flex items-center justify-center text-sm font-bold text-white"
                            style={{
                              backgroundColor: member.helmet?.color1
                                ? `#${member.helmet.color1}`
                                : "#6b7280",
                            }}
                          >
                            {member.carNumber && member.carNumber.length <= 2
                              ? member.carNumber
                              : "👤"}
                          </div>
                        </div>

                        {/* Member Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-white truncate">
                            {member.displayName}
                          </h3>
                          {member.nickName && (
                            <p className="text-xs text-zinc-400 truncate">
                              {member.nickName}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {member.owner && (
                              <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                                Owner
                              </span>
                            )}
                            {member.admin && (
                              <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
                                Admin
                              </span>
                            )}
                            {member.carNumber && (
                              <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                                #{member.carNumber}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 mt-2">
                            Member since{" "}
                            {new Date(
                              member.leagueMemberSince,
                            ).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalMemberPages > 1 && (
                  <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
                    <p className="text-sm text-zinc-400">
                      Showing {memberStartIndex + 1}-
                      {Math.min(
                        memberStartIndex + membersPerPage,
                        filteredMembers.length,
                      )}{" "}
                      of {filteredMembers.length}
                      {memberSearch.trim()
                        ? ` (filtered from ${members.length})`
                        : ""}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setMemberPage((prev) => Math.max(1, prev - 1))
                        }
                        disabled={currentMemberPage === 1}
                        className="text-sm px-3 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Previous
                      </button>
                      <span className="text-sm text-zinc-400">
                        Page {currentMemberPage} of {totalMemberPages}
                      </span>
                      <button
                        onClick={() =>
                          setMemberPage((prev) =>
                            Math.min(totalMemberPages, prev + 1),
                          )
                        }
                        disabled={currentMemberPage >= totalMemberPages}
                        className="text-sm px-3 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
