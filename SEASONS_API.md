# iRaceHub Seasons Management System

## Overview

The seasons system allows league administrators to:

1. **Create custom seasons** for their series
2. **Sync seasons from iRacing** automatically
3. **Manage season details** (name, description, cars, settings)
4. **Track season data** with integration to iRacing points systems

---

## Database Schema

### Season Model

```prisma
model Season {
  id                          String   @id @default(cuid())
  seriesId                    String   @map("series_id")
  iracingSeasonId             Int      @map("iracing_season_id")
  seasonName                  String   @map("season_name")
  description                 String?
  cars                        Json     @default("[]")  // Array of {car_id, car_name}

  // Season settings
  isActive                    Boolean  @default(true)
  hidden                      Boolean  @default(false)
  numDrops                    Int      @default(0)
  noDropsOnOrAfterRaceNum     Int      @default(-1)

  // iRacing integration
  iracingPointsSystemId       Int?
  iracingPointsSystemName     String?
  iracingPointsSystemDesc     String?

  // Sync tracking
  isSynced                    Boolean  @default(false)
  lastSyncedAt                DateTime?

  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt

  series Season @relation(...)
}
```

---

## API Endpoints

### 1. Fetch Seasons from iRacing

**Endpoint:** `GET /api/iracing/league-seasons?league_id={LEAGUE_ID}`

**Description:** Proxy endpoint to fetch seasons from iRacing API

**Query Parameters:**

- `league_id` (required): iRacing league ID

**Authentication:** Requires `irh_access_token` cookie

**Response:**

```json
[
  {
    "league_id": 122,
    "season_id": 76191,
    "points_system_id": 1,
    "season_name": "2022A - Cup Series",
    "active": true,
    "hidden": false,
    "num_drops": 0,
    "no_drops_on_or_after_race_num": -1,
    "points_cars": [
      {
        "car_id": 139,
        "car_name": "NASCAR Cup Series Next Gen Chevrolet Camaro ZL1"
      },
      { "car_id": 140, "car_name": "NASCAR Cup Series Next Gen Ford Mustang" }
    ],
    "points_system_name": "NASCAR",
    "points_system_desc": "1st through 40th earn points."
  }
]
```

---

### 2. Get All Seasons for a Series

**Endpoint:** `GET /api/leagues/{leagueId}/series/{seriesId}/seasons`

**Description:** Retrieve all seasons for a specific series

**Authentication:** Requires admin/owner access to league

**Response:**

```json
[
  {
    "id": "cmp0b38m90000...",
    "seriesId": "xyz123...",
    "iracingSeasonId": 76191,
    "seasonName": "2022A - Cup Series",
    "description": null,
    "cars": [
      {
        "car_id": 139,
        "car_name": "NASCAR Cup Series Next Gen Chevrolet Camaro ZL1"
      }
    ],
    "isActive": true,
    "hidden": false,
    "numDrops": 0,
    "noDropsOnOrAfterRaceNum": -1,
    "iracingPointsSystemId": 1,
    "iracingPointsSystemName": "NASCAR",
    "iracingPointsSystemDesc": "1st through 40th earn points.",
    "isSynced": true,
    "lastSyncedAt": "2026-05-10T22:09:01.000Z",
    "createdAt": "2026-05-10T22:09:01.000Z",
    "updatedAt": "2026-05-10T22:09:01.000Z"
  }
]
```

---

### 3. Create a Custom Season

**Endpoint:** `POST /api/leagues/{leagueId}/series/{seriesId}/seasons`

**Description:** Create a custom season for the series

**Request Body:**

```json
{
  "seasonName": "Custom Season 1",
  "description": "Optional description",
  "cars": [
    {
      "car_id": 139,
      "car_name": "NASCAR Cup Series Next Gen Chevrolet Camaro ZL1"
    },
    { "car_id": 140, "car_name": "NASCAR Cup Series Next Gen Ford Mustang" }
  ],
  "isActive": true,
  "hidden": false,
  "numDrops": 0,
  "noDropsOnOrAfterRaceNum": -1
}
```

**Response:** Created season object with status 201

**Notes:**

- Custom seasons have `iracingSeasonId: 0`
- `isSynced` is set to `false`
- All fields are editable

---

### 4. Sync Seasons from iRacing

**Endpoint:** `POST /api/leagues/{leagueId}/series/{seriesId}/seasons/sync`

**Description:** Fetch all seasons from iRacing and create them in the database

**Authentication:** Requires admin/owner access to league

**Request Body:** (empty)

**Response:**

```json
{
  "success": true,
  "syncedCount": 2,
  "seasons": [
    {
      "id": "cmp0b38m90000...",
      "seriesId": "xyz123...",
      "iracingSeasonId": 76191,
      "seasonName": "2022A - Cup Series",
      "isSynced": true,
      "lastSyncedAt": "2026-05-10T22:09:01.000Z",
      ...
    }
  ]
}
```

**Notes:**

- Only creates seasons that don't already exist
- Automatically sets `isSynced: true` and `lastSyncedAt` timestamp
- Fetches from iRacing using the league's iRacing ID

---

### 5. Update a Season

**Endpoint:** `PATCH /api/leagues/{leagueId}/series/{seriesId}/seasons/{seasonId}`

**Description:** Update season details

**Request Body (all optional):**

```json
{
  "seasonName": "Updated Season Name",
  "description": "Updated description",
  "cars": [...],
  "isActive": false,
  "hidden": true,
  "numDrops": 5,
  "noDropsOnOrAfterRaceNum": 10
}
```

**Response:** Updated season object

**Notes:**

- Only updatable fields that don't affect iRacing sync data
- iRacing sync fields (`iracingPointsSystemId`, etc.) cannot be modified via PATCH

---

### 6. Delete a Season

**Endpoint:** `DELETE /api/leagues/{leagueId}/series/{seriesId}/seasons/{seasonId}`

**Description:** Delete a season

**Authentication:** Requires admin/owner access to league

**Response:**

```json
{
  "success": true
}
```

---

## Usage Workflow

### Workflow 1: Sync Seasons from iRacing

```
1. User clicks "Sync with iRacing" button in admin panel
2. Frontend calls: POST /api/leagues/{leagueId}/series/{seriesId}/seasons/sync
3. Backend:
   - Fetches seasons from iRacing via /api/iracing/league-seasons
   - Creates new Season records for each iRacing season
   - Returns list of newly created seasons
4. Frontend updates UI to show synced seasons
```

### Workflow 2: Create Custom Season

```
1. User fills out form: Name, Description, Cars, Settings
2. Frontend calls: POST /api/leagues/{leagueId}/series/{seriesId}/seasons
3. Backend creates Season with iracingSeasonId: 0, isSynced: false
4. User can edit this season later
```

### Workflow 3: Manage Seasons

```
1. User views list of all seasons for a series
2. User can:
   - Edit: PATCH /api/leagues/{leagueId}/series/{seriesId}/seasons/{seasonId}
   - Delete: DELETE /api/leagues/{leagueId}/series/{seriesId}/seasons/{seasonId}
   - View details
```

---

## Key Features

### iRacing Integration

- Automatic season sync from iRacing
- Preserves iRacing season metadata:
  - Points system ID, name, description
  - Car restrictions
  - Drop rules
- Tracks sync status and timestamp
- Can re-sync to update iRacing data

### Custom Seasons

- Create seasons not from iRacing
- Full edit capability
- Can be used for test/practice seasons
- Can be hidden or disabled

### Season Settings

- **Cars**: Restricts which cars can be driven
- **Active/Hidden**: Control visibility and participation
- **Drops**: Number of races that can be dropped
- **Drop Rules**: Specify when drops are no longer allowed

---

## Future Enhancements

- [ ] Batch season operations (retire multiple seasons)
- [ ] Season duplication
- [ ] Race schedule management per season
- [ ] Driver standings per season
- [ ] Season-specific scoring customization
- [ ] Season publication/unpublication workflow
- [ ] Season archive/history management
