import { config as loadDotenv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Load environment variables
loadDotenv({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// NASCAR-style points for 1st-40th
const nascar40Points = {
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
};

// F1-style points (top 10 only)
const f1Points = {
  "1": 25,
  "2": 18,
  "3": 15,
  "4": 12,
  "5": 10,
  "6": 8,
  "7": 6,
  "8": 4,
  "9": 2,
  "10": 1,
  "11": 0,
  "12": 0,
  "13": 0,
  "14": 0,
  "15": 0,
  "16": 0,
  "17": 0,
  "18": 0,
  "19": 0,
  "20": 0,
  "21": 0,
  "22": 0,
  "23": 0,
  "24": 0,
  "25": 0,
  "26": 0,
  "27": 0,
  "28": 0,
  "29": 0,
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
};

// IndyCar-style points
const indy40Points = {
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
};

// Bonus points structure
const standardBonusPoints = {
  pole: 1,
  raceWinner: 5,
  ledMostLaps: 2,
  ledOneOrMoreLaps: 1,
  gainedMostPositions: 1,
  lostMostPositions: 0,
  fastestLap: 1,
  noIncidents: 2,
  finishRace: 0,
  fastestAverage: 0,
  finishNoIncidents: 1,
};

async function main() {
  console.log("🌱 Seeding preset points systems...");

  // Check if presets already exist
  const existingNascar = await prisma.seriesPointsSystem.findFirst({
    where: { presetType: "nascar" },
  });

  if (existingNascar) {
    console.log("✓ Preset systems already exist, skipping seed");
    return;
  }

  // Create NASCAR system
  await prisma.seriesPointsSystem.create({
    data: {
      name: "NASCAR Cup Series",
      description:
        "NASCAR-style points system with standard race finish and bonus point structure",
      positionPoints: nascar40Points,
      bonusPoints: standardBonusPoints,
      isDefault: true,
      isPreset: true,
      presetType: "nascar",
    },
  });

  // Create F1 system
  await prisma.seriesPointsSystem.create({
    data: {
      name: "Formula 1",
      description:
        "F1-style points for top 10 finishers with bonus points integration",
      positionPoints: f1Points,
      bonusPoints: {
        pole: 3,
        raceWinner: 0,
        fastestLap: 1,
        noIncidents: 0,
      },
      isDefault: false,
      isPreset: true,
      presetType: "f1",
    },
  });

  // Create IndyCar system
  await prisma.seriesPointsSystem.create({
    data: {
      name: "IndyCar Series",
      description:
        "IndyCar-style points system with emphasis on race winners and top finishers",
      positionPoints: indy40Points,
      bonusPoints: {
        pole: 2,
        raceWinner: 3,
        ledMostLaps: 2,
        ledOneOrMoreLaps: 1,
        fastestLap: 1,
        noIncidents: 1,
      },
      isDefault: false,
      isPreset: true,
      presetType: "indycar",
    },
  });

  console.log("✓ Seed complete: NASCAR, F1, and IndyCar systems created");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
