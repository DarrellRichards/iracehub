"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

interface BonusPointsConfig {
  pole: number;
  raceWinner: number;
  stageWin: number;
  stageFinish1: number;
  stageFinish2: number;
  stageFinish3: number;
  stageFinish4: number;
  stageFinish5: number;
  stageFinish6: number;
  stageFinish7: number;
  stageFinish8: number;
  stageFinish9: number;
  stageFinish10: number;
  ledMostLaps: number;
  ledOneOrMoreLaps: number;
  gainedMostPositions: number;
  lostMostPositions: number;
  fastestLap: number;
  noIncidents: number;
  finishRace: number;
  fastestAverage: number;
  finishNoIncidents: number;
}

const BONUS_POINT_LABELS: Record<keyof BonusPointsConfig, string> = {
  pole: "Started on Pole",
  raceWinner: "Race Winner",
  stageWin: "Stage Winner (additional)",
  stageFinish1: "Stage Finish 1st",
  stageFinish2: "Stage Finish 2nd",
  stageFinish3: "Stage Finish 3rd",
  stageFinish4: "Stage Finish 4th",
  stageFinish5: "Stage Finish 5th",
  stageFinish6: "Stage Finish 6th",
  stageFinish7: "Stage Finish 7th",
  stageFinish8: "Stage Finish 8th",
  stageFinish9: "Stage Finish 9th",
  stageFinish10: "Stage Finish 10th",
  ledMostLaps: "Led Most Laps",
  ledOneOrMoreLaps: "Led One or More Laps",
  gainedMostPositions: "Gained Most Positions",
  lostMostPositions: "Lost Most Positions",
  fastestLap: "Fastest Lap",
  noIncidents: "No Incidents",
  finishRace: "Finish Race",
  fastestAverage: "Fastest Average Speed",
  finishNoIncidents: "Finish w/No Incidents",
};

export default function PointsSystemBuilderPage() {
  const { session, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ leagueId: string }>();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [positionPoints, setPositionPoints] = useState<Record<string, number>>(
    () => {
      const pts: Record<string, number> = {};
      for (let i = 1; i <= 40; i++) {
        pts[i] = 0;
      }
      return pts;
    },
  );
  const [bonusPoints, setBonusPoints] = useState<BonusPointsConfig>({
    pole: 1,
    raceWinner: 5,
    stageWin: 0,
    stageFinish1: 0,
    stageFinish2: 0,
    stageFinish3: 0,
    stageFinish4: 0,
    stageFinish5: 0,
    stageFinish6: 0,
    stageFinish7: 0,
    stageFinish8: 0,
    stageFinish9: 0,
    stageFinish10: 0,
    ledMostLaps: 2,
    ledOneOrMoreLaps: 1,
    gainedMostPositions: 1,
    lostMostPositions: 0,
    fastestLap: 1,
    noIncidents: 2,
    finishRace: 0,
    fastestAverage: 0,
    finishNoIncidents: 1,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useTemplate, setUseTemplate] = useState<
    "none" | "nascar" | "f1" | "indycar"
  >("none");

  useEffect(() => {
    if (!authLoading && !session?.authenticated) {
      router.replace("/");
    }
  }, [authLoading, session, router]);

  const applyTemplate = (template: "nascar" | "f1" | "indycar") => {
    if (template === "nascar") {
      setPositionPoints({
        "1": 40,
        "2": 34,
        "3": 32,
        "4": 31,
        "5": 30,
        "6": 29,
        "7": 28,
        "8": 27,
        "9": 26,
        "10": 25,
        "11": 24,
        "12": 23,
        "13": 22,
        "14": 21,
        "15": 20,
        "16": 19,
        "17": 18,
        "18": 17,
        "19": 16,
        "20": 15,
        "21": 14,
        "22": 13,
        "23": 12,
        "24": 11,
        "25": 10,
        "26": 9,
        "27": 8,
        "28": 7,
        "29": 6,
        "30": 5,
        "31": 4,
        "32": 3,
        "33": 2,
        "34": 1,
        "35": 0,
        "36": 0,
        "37": 0,
        "38": 0,
        "39": 0,
        "40": 0,
      });
      setName("NASCAR-Style");
      setBonusPoints({
        pole: 1,
        raceWinner: 5,
        stageWin: 1,
        stageFinish1: 10,
        stageFinish2: 9,
        stageFinish3: 8,
        stageFinish4: 7,
        stageFinish5: 6,
        stageFinish6: 5,
        stageFinish7: 4,
        stageFinish8: 3,
        stageFinish9: 2,
        stageFinish10: 1,
        ledMostLaps: 2,
        ledOneOrMoreLaps: 1,
        gainedMostPositions: 1,
        lostMostPositions: 0,
        fastestLap: 1,
        noIncidents: 2,
        finishRace: 0,
        fastestAverage: 0,
        finishNoIncidents: 1,
      });
    } else if (template === "f1") {
      const f1Pts: Record<string, number> = {};
      const f1Values = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
      for (let i = 1; i <= 40; i++) {
        f1Pts[i] = f1Values[i - 1] || 0;
      }
      setPositionPoints(f1Pts);
      setName("Formula 1-Style");
      setBonusPoints({
        pole: 3,
        raceWinner: 0,
        stageWin: 0,
        stageFinish1: 0,
        stageFinish2: 0,
        stageFinish3: 0,
        stageFinish4: 0,
        stageFinish5: 0,
        stageFinish6: 0,
        stageFinish7: 0,
        stageFinish8: 0,
        stageFinish9: 0,
        stageFinish10: 0,
        ledMostLaps: 0,
        ledOneOrMoreLaps: 0,
        gainedMostPositions: 0,
        lostMostPositions: 0,
        fastestLap: 1,
        noIncidents: 0,
        finishRace: 0,
        fastestAverage: 0,
        finishNoIncidents: 0,
      });
    } else if (template === "indycar") {
      setPositionPoints({
        "1": 50,
        "2": 40,
        "3": 35,
        "4": 32,
        "5": 30,
        "6": 28,
        "7": 26,
        "8": 24,
        "9": 22,
        "10": 20,
        "11": 19,
        "12": 18,
        "13": 17,
        "14": 16,
        "15": 15,
        "16": 14,
        "17": 13,
        "18": 12,
        "19": 11,
        "20": 10,
        "21": 9,
        "22": 8,
        "23": 7,
        "24": 6,
        "25": 5,
        "26": 4,
        "27": 3,
        "28": 2,
        "29": 1,
        "30": 0,
        "31": 0,
        "32": 0,
        "33": 0,
        "34": 0,
        "35": 0,
        "36": 0,
        "37": 0,
        "38": 0,
        "39": 0,
        "40": 0,
      });
      setName("IndyCar-Style");
      setBonusPoints({
        pole: 2,
        raceWinner: 3,
        stageWin: 0,
        stageFinish1: 0,
        stageFinish2: 0,
        stageFinish3: 0,
        stageFinish4: 0,
        stageFinish5: 0,
        stageFinish6: 0,
        stageFinish7: 0,
        stageFinish8: 0,
        stageFinish9: 0,
        stageFinish10: 0,
        ledMostLaps: 2,
        ledOneOrMoreLaps: 1,
        gainedMostPositions: 0,
        lostMostPositions: 0,
        fastestLap: 1,
        noIncidents: 1,
        finishRace: 0,
        fastestAverage: 0,
        finishNoIncidents: 0,
      });
    }
  };

  const handlePositionPointChange = (position: string, value: number) => {
    setPositionPoints((prev) => ({
      ...prev,
      [position]: value,
    }));
  };

  const handleBonusPointChange = (
    key: keyof BonusPointsConfig,
    value: number,
  ) => {
    setBonusPoints((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Points system name is required");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/leagues/${params.leagueId}/points-systems`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            positionPoints,
            bonusPoints,
          }),
        },
      );

      if (!res.ok) {
        const data = (await res.json()) as { error?: string; message?: string };
        throw new Error(data.message || data.error || "Failed to save");
      }

      // Return to admin page
      router.push(`/app/${params.leagueId}/admin`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving system");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-red-400 hover:text-red-300 mb-4"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold mb-2">Create Points System</h1>
          <p className="text-zinc-400">
            Define finish position points and bonus point multipliers for your
            league
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500 rounded-lg text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Basic Info & Templates */}
          <div>
            <h2 className="text-xl font-bold mb-6 text-zinc-100">
              System Details
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  System Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., My Custom System"
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your points system..."
                  rows={3}
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-red-500 resize-none"
                />
              </div>

              <div className="pt-4 border-t border-zinc-700">
                <p className="text-sm font-medium text-zinc-300 mb-3">
                  Quick Templates
                </p>
                <div className="space-y-2 text-sm">
                  {(
                    [
                      { value: "nascar", label: "🏁 NASCAR" },
                      { value: "f1", label: "🏎️ Formula 1" },
                      { value: "indycar", label: "🚗 IndyCar" },
                    ] as const
                  ).map((template) => (
                    <button
                      key={template.value}
                      onClick={() => {
                        setUseTemplate(template.value);
                        setDescription("");
                        applyTemplate(template.value);
                      }}
                      className={`w-full px-3 py-2 rounded-lg border text-left transition-colors ${
                        useTemplate === template.value
                          ? "bg-red-500/20 border-red-500 text-red-300"
                          : "border-zinc-700 bg-zinc-800 hover:border-zinc-600 text-zinc-300"
                      }`}
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Bonus Points */}
          <div>
            <h2 className="text-xl font-bold mb-6 text-zinc-100">
              Bonus Points
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 max-h-96 overflow-y-auto pr-2">
              {(
                Object.entries(BONUS_POINT_LABELS) as Array<
                  [keyof BonusPointsConfig, string]
                >
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    {label}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={bonusPoints[key]}
                    onChange={(e) =>
                      handleBonusPointChange(key, parseInt(e.target.value) || 0)
                    }
                    className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-2 py-1 text-sm focus:outline-none focus:border-red-500"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Finish Position Points - Full Width */}
        <div className="mt-12 pt-8 border-t border-zinc-800">
          <h2 className="text-xl font-bold mb-6 text-zinc-100">
            Finish Position Points
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 gap-2">
            {Array.from({ length: 40 }, (_, i) => i + 1).map((position) => (
              <div key={position}>
                <label className="block text-xs font-medium text-zinc-400 mb-1 text-center">
                  {position === 1
                    ? "1st"
                    : position === 2
                      ? "2nd"
                      : position === 3
                        ? "3rd"
                        : `${position}th`}
                </label>
                <input
                  type="number"
                  min="0"
                  max="999"
                  value={positionPoints[position] || 0}
                  onChange={(e) =>
                    handlePositionPointChange(
                      String(position),
                      parseInt(e.target.value) || 0,
                    )
                  }
                  className="w-full text-center rounded-lg bg-zinc-800 border border-zinc-700 text-white px-1 py-1 text-sm focus:outline-none focus:border-red-500"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-12 flex gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-red-600/50 transition-colors px-4 py-3 font-medium text-white"
          >
            {isSaving ? "Saving..." : "Save Points System"}
          </button>
          <button
            onClick={() => router.push(`/app/${params.leagueId}/admin`)}
            className="flex-1 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors px-4 py-3 font-medium text-zinc-300 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}
