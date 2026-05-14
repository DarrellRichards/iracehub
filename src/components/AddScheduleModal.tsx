"use client";

import { useEffect, useRef, useState } from "react";
import { Track } from "@/lib/iracing/tracks";
import {
  formatMoney,
  generateEvenSplit,
  generateTopHeavySplit,
  generateWinnerHeavySplit,
  calculateSplitTotal,
} from "@/lib/money";

interface Weather {
  type: "Set" | "Realistic";
  skies?: "Clear" | "Partly Cloudy" | "Mostly Cloudy" | "Overcast";
  temp?: { unit: "F" | "C"; value: number };
  humidity?: number;
  fog?: number;
  windDirection?: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
  windSpeed?: { speed: number; unit: "MPH" | "KPH" };
}

interface ScheduleStage {
  stageNumber: number;
  endLap: number;
}

interface Schedule {
  id?: string;
  eventDate: string;
  raceName: string;
  isOffWeek: boolean;
  pointsCount: boolean;
  canDrop: boolean;
  registrationEnabled: boolean;
  trackName?: string;
  trackId?: number;
  raceLength?: string;
  virtualPurse: number;
  virtualEntryFee: number;
  virtualPayoutSplit: number[];
  stages: ScheduleStage[];
  weather: Weather;
  raceOrder: number;
}

interface AddScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    data: Omit<
      Schedule,
      "id" | "createdAt" | "updatedAt" | "seasonId" | "seriesId"
    >,
  ) => Promise<void>;
  leagueId: string;
  seriesId: string;
  seasonId: string;
  existingSchedule?: Schedule;
  nextRaceOrder: number;
}

function getTrackDisplayName(track: Track) {
  return track.config_name
    ? `${track.track_name} (${track.config_name})`
    : track.track_name;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toLocalDateInputValue(dateTime: string) {
  if (!dateTime) return "";

  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) {
    return dateTime.includes("T") ? dateTime.split("T")[0] : "";
  }

  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
}

function toLocalTimeInputValue(dateTime: string) {
  if (!dateTime) return "";

  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) {
    return dateTime.includes("T")
      ? dateTime.split("T")[1]?.slice(0, 5) || ""
      : "";
  }

  return `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
}

function mergeDateAndTime(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) return "";
  return `${dateValue}T${timeValue}`;
}

function getTodayLocalDateInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  const value = `${pad2(hours)}:${pad2(minutes)}`;

  const displayDate = new Date();
  displayDate.setHours(hours, minutes, 0, 0);

  return {
    value,
    label: displayDate.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
});

export function AddScheduleModal({
  isOpen,
  onClose,
  onSubmit,
  existingSchedule,
  nextRaceOrder,
}: AddScheduleModalProps) {
  const loadedScheduleRef = useRef<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showTrackDropdown, setShowTrackDropdown] = useState(false);

  const [formData, setFormData] = useState<Schedule>({
    eventDate: "",
    raceName: "",
    isOffWeek: false,
    pointsCount: true,
    canDrop: false,
    registrationEnabled: true,
    trackName: "",
    trackId: undefined,
    raceLength: "",
    virtualPurse: 0,
    virtualEntryFee: 0,
    virtualPayoutSplit: [],
    stages: [],
    weather: { type: "Set" },
    raceOrder: nextRaceOrder,
  });

  const [error, setError] = useState<string>("");

  // Load tracks
  useEffect(() => {
    const loadTracks = async () => {
      if (!isOpen || tracks.length > 0) return;

      setLoading(true);
      try {
        const res = await fetch("/api/iracing/tracks");
        if (!res.ok) throw new Error("Failed to load tracks");
        const data = (await res.json()) as Track[];
        setTracks(data);
      } catch (err) {
        console.error("Error loading tracks:", err);
        setError("Failed to load tracks from iRacing");
      } finally {
        setLoading(false);
      }
    };

    loadTracks();
  }, [isOpen, tracks.length]);

  // Initialize form data when modal opens or schedule changes
  useEffect(() => {
    if (!isOpen) return;

    // Only load if we have an existing schedule and haven't loaded it yet
    if (existingSchedule && loadedScheduleRef.current !== existingSchedule.id) {
      loadedScheduleRef.current = existingSchedule.id;
      setFormData({
        ...existingSchedule,
        virtualPurse: existingSchedule.virtualPurse ?? 0,
        virtualEntryFee: existingSchedule.virtualEntryFee ?? 0,
        virtualPayoutSplit: Array.isArray(existingSchedule.virtualPayoutSplit)
          ? existingSchedule.virtualPayoutSplit
          : [],
        stages: existingSchedule.stages ?? [],
      });
      setSearchQuery(existingSchedule.trackName || "");
    } else if (!existingSchedule && loadedScheduleRef.current !== undefined) {
      // Reset for new schedule
      loadedScheduleRef.current = undefined;
      setFormData({
        eventDate: "",
        raceName: "",
        isOffWeek: false,
        pointsCount: true,
        canDrop: false,
        registrationEnabled: true,
        trackName: "",
        trackId: undefined,
        raceLength: "",
        virtualPurse: 0,
        virtualEntryFee: 0,
        virtualPayoutSplit: [],
        stages: [],
        weather: { type: "Set" },
        raceOrder: nextRaceOrder,
      });
      setSearchQuery("");
    }
  }, [isOpen, existingSchedule, nextRaceOrder]);

  const filteredTracks = tracks.filter((track) => {
    const normalizedQuery = searchQuery.toLowerCase();
    const trackName = (track.track_name ?? "").toLowerCase();
    const configName = (track.config_name ?? "").toLowerCase();

    return (
      trackName.includes(normalizedQuery) ||
      configName.includes(normalizedQuery) ||
      track.track_id.toString().includes(searchQuery)
    );
  });

  const eventDateValue = toLocalDateInputValue(formData.eventDate);
  const eventTimeValue = toLocalTimeInputValue(formData.eventDate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.raceName.trim()) {
      setError("Race name is required");
      return;
    }

    if (!formData.eventDate) {
      setError("Event date is required");
      return;
    }

    if (!formData.isOffWeek && !formData.trackId) {
      setError("Track is required (unless this is an off-week)");
      return;
    }

    if (!formData.isOffWeek && formData.stages.length > 0) {
      const hasInvalidStage = formData.stages.some(
        (stage) => !Number.isInteger(stage.endLap) || stage.endLap <= 0,
      );
      if (hasInvalidStage) {
        setError("Each stage must have a valid lap number greater than 0");
        return;
      }
    }

    setSubmitting(true);
    try {
      await onSubmit({
        ...formData,
        stages: formData.isOffWeek ? [] : formData.stages,
      });
      setFormData({
        eventDate: "",
        raceName: "",
        isOffWeek: false,
        pointsCount: true,
        canDrop: false,
        registrationEnabled: true,
        trackName: "",
        trackId: undefined,
        raceLength: "",
        virtualPurse: 0,
        virtualEntryFee: 0,
        virtualPayoutSplit: [],
        stages: [],
        weather: { type: "Set" },
        raceOrder: nextRaceOrder,
      });
      setSearchQuery("");
      setShowTrackDropdown(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save schedule");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {existingSchedule ? "Edit Race Schedule" : "Add Race Schedule"}
          </h2>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Event Date / Time */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Event Date & Time *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={eventDateValue}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      eventDate: mergeDateAndTime(
                        e.target.value,
                        eventTimeValue || "19:00",
                      ),
                    })
                  }
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-4 py-2 text-sm focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Time</label>
                <select
                  required
                  value={eventTimeValue}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      eventDate: mergeDateAndTime(
                        eventDateValue || getTodayLocalDateInputValue(),
                        e.target.value,
                      ),
                    })
                  }
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-4 py-2 text-sm focus:outline-none focus:border-red-500"
                >
                  <option value="">Select time...</option>
                  {TIME_OPTIONS.map((timeOption) => (
                    <option key={timeOption.value} value={timeOption.value}>
                      {timeOption.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Calendar popup for date + 15-minute time dropdown.
            </p>
          </div>

          {/* Race Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Race (Event) Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Round 1 - Main Event"
              value={formData.raceName}
              onChange={(e) =>
                setFormData({ ...formData, raceName: e.target.value })
              }
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-4 py-2 text-sm focus:outline-none focus:border-red-500 placeholder-zinc-500"
            />
          </div>

          {/* Off Week Toggle */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isOffWeek}
                onChange={(e) =>
                  setFormData({ ...formData, isOffWeek: e.target.checked })
                }
                className="w-4 h-4 rounded border-zinc-600 text-red-500 focus:ring-red-500"
              />
              <span className="text-sm font-medium text-zinc-300">
                Off Week
              </span>
            </label>
            <p className="text-xs text-zinc-500 mt-1">
              If selected, other details will be hidden
            </p>
          </div>

          {/* Conditional content - only show if not off week */}
          {!formData.isOffWeek && (
            <>
              {/* Points Count */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-3">
                  Points Count
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, pointsCount: true })
                    }
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                      formData.pointsCount
                        ? "bg-red-500 border-red-500 text-white"
                        : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, pointsCount: false })
                    }
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                      !formData.pointsCount
                        ? "bg-red-500 border-red-500 text-white"
                        : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>

              {/* Can Drop */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-3">
                  Can Be Dropped
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, canDrop: true })}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                      formData.canDrop
                        ? "bg-red-500 border-red-500 text-white"
                        : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, canDrop: false })}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                      !formData.canDrop
                        ? "bg-red-500 border-red-500 text-white"
                        : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>

              {/* Registration Enabled */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-3">
                  Driver Registration
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, registrationEnabled: true })
                    }
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                      formData.registrationEnabled
                        ? "bg-red-500 border-red-500 text-white"
                        : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
                    }`}
                  >
                    Enabled
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, registrationEnabled: false })
                    }
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                      !formData.registrationEnabled
                        ? "bg-red-500 border-red-500 text-white"
                        : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
                    }`}
                  >
                    Disabled
                  </button>
                </div>
              </div>

              {/* Track Selection */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Track *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search tracks..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowTrackDropdown(true);
                    }}
                    onFocus={() => setShowTrackDropdown(true)}
                    className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-4 py-2 text-sm focus:outline-none focus:border-red-500 placeholder-zinc-500"
                  />

                  {/* Track Dropdown */}
                  {showTrackDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg max-h-64 overflow-y-auto z-10">
                      {loading ? (
                        <div className="px-4 py-3 text-xs text-zinc-400 text-center">
                          Loading tracks...
                        </div>
                      ) : filteredTracks.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-zinc-400 text-center">
                          No tracks found
                        </div>
                      ) : (
                        <ul className="divide-y divide-zinc-700">
                          {filteredTracks.map((track) => (
                            <li key={track.track_id}>
                              <button
                                type="button"
                                onClick={() => {
                                  const displayName =
                                    getTrackDisplayName(track);
                                  setFormData({
                                    ...formData,
                                    trackId: track.track_id,
                                    trackName: displayName,
                                  });
                                  setSearchQuery(displayName);
                                  setShowTrackDropdown(false);
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-zinc-700 text-sm text-white transition-colors"
                              >
                                <div className="font-medium">
                                  {getTrackDisplayName(track)}
                                </div>
                                <div className="text-xs text-zinc-400">
                                  ID: {track.track_id}
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {formData.trackId && (
                    <div className="mt-2 px-3 py-2 bg-zinc-800 rounded-lg text-sm">
                      <span className="text-zinc-300">Selected: </span>
                      <span className="text-white font-medium">
                        {formData.trackName} (ID: {formData.trackId})
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Race Length */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Race Length
                </label>
                <input
                  type="text"
                  placeholder="e.g., '50 laps' or '1:30:00'"
                  value={formData.raceLength || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, raceLength: e.target.value })
                  }
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-4 py-2 text-sm focus:outline-none focus:border-red-500 placeholder-zinc-500"
                />
              </div>

              {/* Virtual Purse + Payout Split */}
              <div className="rounded-lg border border-zinc-800 p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Race Entry Fee
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      min={0}
                      value={formData.virtualEntryFee}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          virtualEntryFee: Math.max(
                            0,
                            Number.parseInt(e.target.value, 10) || 0,
                          ),
                        })
                      }
                      className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 text-white px-4 py-2 text-sm focus:outline-none focus:border-red-500"
                    />
                    <span className="text-zinc-400 text-sm font-medium">
                      {formData.virtualEntryFee > 0
                        ? formatMoney(formData.virtualEntryFee)
                        : "$0"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    Charged to each driver when they register for this race.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Race Purse
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      min={0}
                      value={formData.virtualPurse}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          virtualPurse: Math.max(
                            0,
                            Number.parseInt(e.target.value, 10) || 0,
                          ),
                        })
                      }
                      className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 text-white px-4 py-2 text-sm focus:outline-none focus:border-red-500"
                    />
                    <span className="text-zinc-400 text-sm font-medium">
                      {formData.virtualPurse > 0
                        ? formatMoney(formData.virtualPurse)
                        : "$0"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    Total purse to distribute among finishers.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-3">
                    Distribution Pattern
                  </label>

                  {formData.virtualPurse > 0 ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const split = generateEvenSplit(
                              formData.virtualPurse,
                              20,
                            );
                            setFormData({
                              ...formData,
                              virtualPayoutSplit: split,
                            });
                          }}
                          className="px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition-colors"
                        >
                          Even Split
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const split = generateTopHeavySplit(
                              formData.virtualPurse,
                              20,
                            );
                            setFormData({
                              ...formData,
                              virtualPayoutSplit: split,
                            });
                          }}
                          className="px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition-colors"
                        >
                          Top Heavy
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const split = generateWinnerHeavySplit(
                              formData.virtualPurse,
                              20,
                            );
                            setFormData({
                              ...formData,
                              virtualPayoutSplit: split,
                            });
                          }}
                          className="px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition-colors"
                        >
                          Winner Heavy
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              virtualPayoutSplit: [],
                            });
                          }}
                          className="px-3 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition-colors"
                        >
                          Clear
                        </button>
                      </div>

                      {formData.virtualPayoutSplit.length > 0 && (
                        <>
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-zinc-400">
                                Split Preview (Top 10)
                              </span>
                              <span className="text-xs text-zinc-400">
                                Total:{" "}
                                {formatMoney(
                                  calculateSplitTotal(
                                    formData.virtualPayoutSplit,
                                  ),
                                )}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {formData.virtualPayoutSplit
                                .slice(0, 10)
                                .map((amount, index) => (
                                  <div
                                    key={`payout-preview-${index}`}
                                    className="flex items-center justify-between text-xs"
                                  >
                                    <span className="text-zinc-500 w-16">
                                      P{index + 1}:
                                    </span>
                                    <div className="flex-1 bg-zinc-800 rounded mx-2 h-6 flex items-center px-2">
                                      <div
                                        className="bg-red-500 h-4 rounded"
                                        style={{
                                          width: `${(amount / Math.max(1, ...formData.virtualPayoutSplit)) * 100}%`,
                                        }}
                                      />
                                    </div>
                                    <span className="text-zinc-300 w-16 text-right">
                                      {formatMoney(amount)}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          </div>

                          <div>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData({
                                  ...formData,
                                  virtualPayoutSplit: [
                                    ...formData.virtualPayoutSplit,
                                    0,
                                  ],
                                });
                              }}
                              className="w-full rounded-lg border border-zinc-700 hover:border-zinc-600 px-3 py-2 text-xs text-zinc-300 transition-colors font-medium"
                            >
                              + Add Extra Position
                            </button>
                          </div>

                          {formData.virtualPayoutSplit.length > 10 && (
                            <div className="bg-zinc-950 rounded-lg p-3">
                              <details>
                                <summary className="text-xs text-zinc-400 cursor-pointer">
                                  Full Split (
                                  {formData.virtualPayoutSplit.length}{" "}
                                  positions)
                                </summary>
                                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                                  {formData.virtualPayoutSplit.map(
                                    (amount, index) => (
                                      <div
                                        key={`payout-full-${index}`}
                                        className="flex items-center justify-between text-xs"
                                      >
                                        <span className="text-zinc-500">
                                          P{index + 1}:
                                        </span>
                                        <input
                                          type="number"
                                          min={0}
                                          value={amount}
                                          onChange={(e) => {
                                            const next = [
                                              ...formData.virtualPayoutSplit,
                                            ];
                                            next[index] = Math.max(
                                              0,
                                              Number.parseInt(
                                                e.target.value,
                                                10,
                                              ) || 0,
                                            );
                                            setFormData({
                                              ...formData,
                                              virtualPayoutSplit: next,
                                            });
                                          }}
                                          className="w-20 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 px-2 py-1 text-xs focus:outline-none focus:border-red-500"
                                        />
                                        <span className="text-zinc-400 w-14 text-right">
                                          {formatMoney(amount)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const next =
                                              formData.virtualPayoutSplit.filter(
                                                (_, payoutIndex) =>
                                                  payoutIndex !== index,
                                              );
                                            setFormData({
                                              ...formData,
                                              virtualPayoutSplit: next,
                                            });
                                          }}
                                          className="text-xs text-zinc-500 hover:text-red-400 w-8 text-right"
                                        >
                                          rm
                                        </button>
                                      </div>
                                    ),
                                  )}
                                </div>
                              </details>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 text-center py-4">
                      Enter a race purse above to configure earnings
                      distribution.
                    </p>
                  )}
                </div>
              </div>

              {/* Stage Configuration */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-3">
                  Use Stages
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, stages: [] })}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                      formData.stages.length === 0
                        ? "bg-red-500 border-red-500 text-white"
                        : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
                    }`}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        stages:
                          formData.stages.length > 0
                            ? formData.stages
                            : [
                                { stageNumber: 1, endLap: 25 },
                                { stageNumber: 2, endLap: 50 },
                              ],
                      })
                    }
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                      formData.stages.length > 0
                        ? "bg-red-500 border-red-500 text-white"
                        : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
                    }`}
                  >
                    Yes
                  </button>
                </div>
              </div>

              {formData.stages.length > 0 && (
                <div className="rounded-lg border border-zinc-800 p-4">
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Number of Stages
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={formData.stages.length}
                      onChange={(e) => {
                        const nextCount = Math.max(
                          1,
                          Math.min(6, parseInt(e.target.value, 10) || 1),
                        );

                        const nextStages = Array.from(
                          { length: nextCount },
                          (_, index) => {
                            const existing = formData.stages[index];
                            const fallbackLap =
                              index === 0
                                ? 25
                                : (formData.stages[index - 1]?.endLap ?? 25) +
                                  25;

                            return {
                              stageNumber: index + 1,
                              endLap: existing?.endLap ?? fallbackLap,
                            };
                          },
                        );

                        setFormData({
                          ...formData,
                          stages: nextStages,
                        });
                      }}
                      className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-4 py-2 text-sm focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div className="space-y-3">
                    {formData.stages.map((stage, index) => (
                      <div key={stage.stageNumber}>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                          Stage {stage.stageNumber} End Lap
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={stage.endLap}
                          onChange={(e) => {
                            const endLap = Math.max(
                              1,
                              parseInt(e.target.value, 10) || 1,
                            );
                            const updatedStages = [...formData.stages];
                            updatedStages[index] = {
                              ...updatedStages[index],
                              endLap,
                            };
                            setFormData({
                              ...formData,
                              stages: updatedStages,
                            });
                          }}
                          className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-4 py-2 text-sm focus:outline-none focus:border-red-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Weather Section */}
              <div className="border-t border-zinc-800 pt-6">
                <h3 className="text-sm font-semibold text-zinc-200 mb-4">
                  Weather
                </h3>

                {/* Weather Type */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-zinc-300 mb-3">
                    Weather Type
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          weather: { type: "Set" },
                        })
                      }
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                        formData.weather.type === "Set"
                          ? "bg-red-500 border-red-500 text-white"
                          : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
                      }`}
                    >
                      Set
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          weather: { type: "Realistic" },
                        })
                      }
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                        formData.weather.type === "Realistic"
                          ? "bg-red-500 border-red-500 text-white"
                          : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
                      }`}
                    >
                      Realistic
                    </button>
                  </div>
                </div>

                {/* Conditional weather fields - only show if type is "Set" */}
                {formData.weather.type === "Set" && (
                  <>
                    {/* Skies */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        Skies
                      </label>
                      <select
                        value={formData.weather.skies || ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setFormData({
                            ...formData,
                            weather: {
                              ...formData.weather,
                              skies:
                                (value as
                                  | "Clear"
                                  | "Partly Cloudy"
                                  | "Mostly Cloudy"
                                  | "Overcast") || undefined,
                            },
                          });
                        }}
                        className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-4 py-2 text-sm focus:outline-none focus:border-red-500"
                      >
                        <option value="">Select skies...</option>
                        <option value="Clear">Clear</option>
                        <option value="Partly Cloudy">Partly Cloudy</option>
                        <option value="Mostly Cloudy">Mostly Cloudy</option>
                        <option value="Overcast">Overcast</option>
                      </select>
                    </div>

                    {/* Temperature */}
                    <div className="mb-4 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                          Temperature
                        </label>
                        <input
                          type="number"
                          placeholder="Value"
                          value={formData.weather.temp?.value || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              weather: {
                                ...formData.weather,
                                temp: {
                                  unit: formData.weather.temp?.unit || "F",
                                  value: parseInt(e.target.value) || 0,
                                },
                              },
                            })
                          }
                          className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-4 py-2 text-sm focus:outline-none focus:border-red-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                          Unit
                        </label>
                        <select
                          value={formData.weather.temp?.unit || "F"}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              weather: {
                                ...formData.weather,
                                temp: {
                                  value: formData.weather.temp?.value || 0,
                                  unit: e.target.value as "F" | "C",
                                },
                              },
                            })
                          }
                          className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-4 py-2 text-sm focus:outline-none focus:border-red-500"
                        >
                          <option value="F">°F</option>
                          <option value="C">°C</option>
                        </select>
                      </div>
                    </div>

                    {/* Humidity */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        Humidity (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.weather.humidity || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            weather: {
                              ...formData.weather,
                              humidity: parseInt(e.target.value) || 0,
                            },
                          })
                        }
                        className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-4 py-2 text-sm focus:outline-none focus:border-red-500"
                      />
                    </div>

                    {/* Fog */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        Fog (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.weather.fog || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            weather: {
                              ...formData.weather,
                              fog: parseInt(e.target.value) || 0,
                            },
                          })
                        }
                        className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-4 py-2 text-sm focus:outline-none focus:border-red-500"
                      />
                    </div>

                    {/* Wind Direction */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        Wind Direction
                      </label>
                      <select
                        value={formData.weather.windDirection || ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setFormData({
                            ...formData,
                            weather: {
                              ...formData.weather,
                              windDirection:
                                (value as
                                  | "N"
                                  | "NE"
                                  | "E"
                                  | "SE"
                                  | "S"
                                  | "SW"
                                  | "W"
                                  | "NW") || undefined,
                            },
                          });
                        }}
                        className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-4 py-2 text-sm focus:outline-none focus:border-red-500"
                      >
                        <option value="">Select direction...</option>
                        <option value="N">North (N)</option>
                        <option value="NE">Northeast (NE)</option>
                        <option value="E">East (E)</option>
                        <option value="SE">Southeast (SE)</option>
                        <option value="S">South (S)</option>
                        <option value="SW">Southwest (SW)</option>
                        <option value="W">West (W)</option>
                        <option value="NW">Northwest (NW)</option>
                      </select>
                    </div>

                    {/* Wind Speed */}
                    <div className="mb-4 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                          Wind Speed
                        </label>
                        <input
                          type="number"
                          placeholder="Speed"
                          value={formData.weather.windSpeed?.speed || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              weather: {
                                ...formData.weather,
                                windSpeed: {
                                  speed: parseInt(e.target.value) || 0,
                                  unit:
                                    formData.weather.windSpeed?.unit || "MPH",
                                },
                              },
                            })
                          }
                          className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-4 py-2 text-sm focus:outline-none focus:border-red-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                          Unit
                        </label>
                        <select
                          value={formData.weather.windSpeed?.unit || "MPH"}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              weather: {
                                ...formData.weather,
                                windSpeed: {
                                  speed: formData.weather.windSpeed?.speed || 0,
                                  unit: e.target.value as "MPH" | "KPH",
                                },
                              },
                            })
                          }
                          className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-4 py-2 text-sm focus:outline-none focus:border-red-500"
                        >
                          <option value="MPH">MPH</option>
                          <option value="KPH">KPH</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="flex gap-3 pt-6 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 rounded-lg border border-zinc-700 text-white px-4 py-2 text-sm font-medium hover:border-zinc-600 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 text-white px-4 py-2 text-sm font-medium transition-colors disabled:bg-red-600/50"
            >
              {submitting
                ? "Saving..."
                : existingSchedule
                  ? "Update Schedule"
                  : "Add Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
