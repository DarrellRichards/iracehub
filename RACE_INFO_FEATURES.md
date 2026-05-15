# Race Information & Registration Features

## Overview

The upcoming race display now includes:

- ⚡ **Weather Information** - Current or forecasted weather conditions
- 🚪 **Room Open Time** - When the practice room will open
- 🏁 **Green Flag Time** - Official race start time
- 🏆 **Track Information** - Race venue and length
- 👥 **Registration Status** - Number of registered drivers
- 🔥 **Registration Button** - One-click registration for league members

## Features Added

### 1. Enhanced Featured Race Display

The featured/next upcoming race is now prominently displayed on the league landing page with:

- Eye-catching gradient border and shadow effects
- Real-time countdown indicator ("🔥 Imminent" when race is within 24 hours)
- All timing information in easy-to-read cards
- Registration button for eligible drivers
- Weather display with temperature, humidity, wind conditions

### 2. Database Fields

Two new DateTime fields were added to the `Schedule` model:

- `roomOpenTime` - When drivers can enter the practice room
- `greenFlagTime` - Official race start time (can differ from `eventDate`)

The `weather` field already existed and now displays detailed information including:

- Type (Set or Realistic)
- Temperature
- Humidity
- Wind speed and direction
- Fog conditions
- Sky conditions

### 3. Utility Functions

New helper functions added to `landing-utils.ts`:

- `formatWeather()` - Formats weather data into readable string
- `timeUntilEvent()` - Calculates time remaining until race with user-friendly labels
- Helper interfaces for type safety

## Setting Up Race Information

### For League Admins: Update Schedule Details

Use the API endpoint to set weather and timing information:

```bash
PATCH /api/leagues/{leagueId}/schedules/{scheduleId}/details
```

#### Request Body

```json
{
  "weather": {
    "type": "Realistic",
    "temp": 72,
    "humidity": 65,
    "windSpeed": 8,
    "windDirection": "NW",
    "skies": "Partly Cloudy",
    "fog": 0
  },
  "roomOpenTime": "2026-05-17T19:00:00Z",
  "greenFlagTime": "2026-05-17T20:00:00Z"
}
```

#### Example cURL Request

```bash
curl -X PATCH \
  "http://localhost:2300/api/leagues/your-league-id/schedules/your-schedule-id/details" \
  -H "Content-Type: application/json" \
  -H "Cookie: irh_access_token=YOUR_TOKEN" \
  -d '{
    "weather": {
      "type": "Realistic",
      "temp": 72,
      "humidity": 65,
      "windSpeed": 8,
      "windDirection": "NW",
      "skies": "Partly Cloudy"
    },
    "roomOpenTime": "2026-05-17T19:00:00Z",
    "greenFlagTime": "2026-05-17T20:00:00Z"
  }'
```

### Using GraphQL (if implementing)

You can extend the GraphQL API to accept these fields when creating/updating schedules.

### Prisma Studio (Direct Database)

```bash
npx prisma studio
```

Then navigate to the Schedule table and edit the fields directly.

## Frontend Display

### Weather Display

The featured race card shows:

- 🌤️ **Weather** - Temperature, conditions, humidity, wind
- Example: "72°F Partly Cloudy · 65% humid · NW 8 mph"

### Timing Display

- 🏁 **Green Flag**: Shows `greenFlagTime` or defaults to `eventDate`
- 🚪 **Room Opens**: Shows `roomOpenTime` and calculates minutes until race
- 📅 **Date**: Displayed for reference

### Registration Section

- Shows number of registered drivers
- For authenticated league members:
  - **Register** button (green gradient) if not registered
  - **Unregister** button (red) if already registered
  - Disabled if registration is closed (within 20 min of event)

## Data Fields

### Weather Object Structure

```typescript
interface WeatherData {
  type?: "Set" | "Realistic";
  skies?: string; // e.g., "Clear", "Partly Cloudy", "Heavy Rain"
  temp?: number; // Temperature in Fahrenheit
  humidity?: number; // 0-100
  fog?: number; // 0-100
  windDirection?: string; // e.g., "NW", "E", "S"
  windSpeed?: number; // mph
}
```

### Important Notes

1. **Timestamps** use ISO 8601 format with UTC timezone
2. **greenFlagTime** is optional - if not set, displays `eventDate`
3. **roomOpenTime** is optional - if not set, doesn't display room info
4. **weather** can be partially filled - missing fields are hidden in display
5. All fields are nullable and can be set to `null` to clear them

## Testing

To test the features locally:

1. Start the dev server:

```bash
npm run dev
```

2. Navigate to a league page: `http://localhost:2300/app/your-league-id`

3. You should see the enhanced featured race card with:
   - Weather information
   - Room open time
   - Green flag time
   - Registration button

4. Try registering/unregistering if you're a league member

## UI Styling

The featured race card uses:

- **Red gradient border** with glowing shadow effect
- **"⚡ Next Race"** badge
- **"🔥 Imminent"** badge (animated when race is within 24 hours)
- **Info cards** with semi-transparent backgrounds and backdrop blur
- **Action button** - green gradient for register, red for unregister
- **Status messages** - green for "You're registered", amber for warnings, red for errors

## Future Enhancements

Potential additions:

1. **Admin UI** - Form to edit weather/timing without API calls
2. **Weather Integration** - Pull real weather from weather APIs
3. **Calendar Sync** - Show all race times in calendar format
4. **Notifications** - Alert drivers when room opens or race starts
5. **Multi-stage Weather** - Different weather for different stages of race
6. **Historical Weather** - Record actual weather that occurred
7. **Track Surface Temp** - Additional racing-specific weather data

## Troubleshooting

### Weather not displaying

- Check that weather object is valid JSON in database
- Ensure at least one weather field is set (temp, skies, etc.)
- Verify weather is not an empty object `{}`

### Timing shows wrong times

- Verify timestamps are in correct ISO 8601 format
- Check timezone - system uses UTC internally
- Confirm `eventDate` exists if `greenFlagTime` is not set

### Registration button not showing

- Verify you're logged in
- Confirm you're a league member
- Check that registration is enabled and not closed
- Verify `registrationEnabled` field is `true` on schedule

## API Response Format

```typescript
{
  "id": "schedule-123",
  "eventDate": "2026-05-17T20:00:00Z",
  "raceName": "Monaco Grand Prix",
  "weather": {
    "type": "Realistic",
    "temp": 72,
    "humidity": 65,
    "windSpeed": 8,
    "windDirection": "NW",
    "skies": "Partly Cloudy"
  },
  "roomOpenTime": "2026-05-17T19:00:00Z",
  "greenFlagTime": "2026-05-17T20:00:00Z"
}
```
