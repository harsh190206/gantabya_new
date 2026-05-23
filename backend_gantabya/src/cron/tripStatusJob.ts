import { PrismaClient, TripStatus } from "@prisma/client";

const prisma = new PrismaClient();

// Run every 20 minutes
const TRIP_STATUS_INTERVAL_MS = 20 * 60 * 1000;

const TIMEZONE = "Asia/Kolkata";

/**
 * Convert a tripDate (date-only) + "HH:MM" time + dayOffset into an absolute Date in IST.
 * Returns null if the time string is missing.
 */
function buildAbsoluteIST(
  tripDate: Date,
  timeStr: string | null,
  dayOffset: number
): Date | null {
  if (!timeStr) return null;
  const [hStr, mStr] = timeStr.split(":");
  const hours = Number(hStr);
  const minutes = Number(mStr);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  // tripDate from Prisma (@db.Date) — treat as midnight IST of that date.
  const y = tripDate.getUTCFullYear();
  const m = tripDate.getUTCMonth();
  const d = tripDate.getUTCDate();

  // Build the wall-clock IST datetime then convert to a real UTC instant.
  // IST = UTC+5:30 → subtract 5h30m to get the UTC instant.
  const istWallMs = Date.UTC(y, m, d + dayOffset, hours, minutes, 0);
  return new Date(istWallMs - (5 * 60 + 30) * 60 * 1000);
}

/**
 * Return current time as IST wall-clock Date (still real UTC instant under the hood).
 */
function nowIST(): Date {
  return new Date();
}

/**
 * Compute earliest journey start and latest journey end across BOTH directions.
 *
 *   Forward:  stops[0].departureTime (dayOffset 0)   →  stops[N].arrivalTime (stops[N].dayOffset)
 *   Return:   stops[N].returnDepartureTime (returnDayOffset 0)
 *             →  stops[0].returnArrivalTime (stops[0].returnDayOffset)
 *
 * Trip is COMPLETED only when current time >= max(forwardEnd, returnEnd).
 * Trip is ONGOING when current time >= min(forwardStart, returnStart) and not yet COMPLETED.
 */
function deriveStatus(
  tripDate: Date,
  stops: Array<{
    stopIndex: number;
    arrivalTime: string | null;
    departureTime: string | null;
    dayOffset: number;
    returnArrivalTime: string | null;
    returnDepartureTime: string | null;
    returnDayOffset: number;
  }>,
  now: Date
): TripStatus | null {
  if (stops.length < 2) return null;

  const ordered = [...stops].sort((a, b) => a.stopIndex - b.stopIndex);
  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;

  // Forward: depart first stop → arrive last stop
  const forwardStart = buildAbsoluteIST(tripDate, first.departureTime, first.dayOffset);
  const forwardEnd = buildAbsoluteIST(tripDate, last.arrivalTime, last.dayOffset);

  // Return: depart last stop (returnDeparture) → arrive first stop (returnArrival)
  const returnStart = buildAbsoluteIST(tripDate, last.returnDepartureTime, last.returnDayOffset);
  const returnEnd = buildAbsoluteIST(tripDate, first.returnArrivalTime, first.returnDayOffset);

  const starts = [forwardStart, returnStart].filter((d): d is Date => d !== null);
  const ends = [forwardEnd, returnEnd].filter((d): d is Date => d !== null);

  if (starts.length === 0 || ends.length === 0) return null;

  const earliestStart = new Date(Math.min(...starts.map((d) => d.getTime())));
  const latestEnd = new Date(Math.max(...ends.map((d) => d.getTime())));

  if (now >= latestEnd) return TripStatus.COMPLETED;
  if (now >= earliestStart) return TripStatus.ONGOING;
  return TripStatus.SCHEDULED;
}

async function updateTripStatuses(): Promise<void> {
  try {
    const now = nowIST();

    // Window: trips from yesterday → next 2 days. Avoid scanning entire history.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - 2);
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + 2);

    const trips = await prisma.trip.findMany({
      where: {
        tripDate: { gte: windowStart, lte: windowEnd },
        status: { in: [TripStatus.SCHEDULED, TripStatus.ONGOING] }, // skip CANCELLED + COMPLETED
      },
      include: {
        bus: {
          include: {
            stops: {
              orderBy: { stopIndex: "asc" },
            },
          },
        },
      },
    });

    let onGoingCount = 0;
    let completedCount = 0;

    for (const trip of trips) {
      const next = deriveStatus(trip.tripDate, trip.bus.stops, now);
      if (!next || next === trip.status) continue;

      // Forward-only transitions: SCHEDULED → ONGOING → COMPLETED
      const forward =
        (trip.status === TripStatus.SCHEDULED &&
          (next === TripStatus.ONGOING || next === TripStatus.COMPLETED)) ||
        (trip.status === TripStatus.ONGOING && next === TripStatus.COMPLETED);

      if (!forward) continue;

      await prisma.trip.update({
        where: { id: trip.id },
        data: { status: next },
      });

      if (next === TripStatus.ONGOING) onGoingCount++;
      if (next === TripStatus.COMPLETED) completedCount++;

      console.log(
        `🚍 Trip ${trip.id} (${trip.bus.busNumber} on ${trip.tripDate
          .toISOString()
          .slice(0, 10)}): ${trip.status} → ${next}`
      );
    }

    if (onGoingCount || completedCount) {
      console.log(
        `🕒 Trip status job: ${onGoingCount} → ONGOING, ${completedCount} → COMPLETED`
      );
    }
  } catch (error) {
    console.error("❌ Trip status job failed:", error);
  }
}

export function startTripStatusJob(): void {
  console.log("🚀 Starting trip status job (runs every 20 minutes)");
  updateTripStatuses(); // run immediately on boot
  setInterval(updateTripStatuses, TRIP_STATUS_INTERVAL_MS);
}

// Exported for manual trigger / tests
export { updateTripStatuses, deriveStatus, buildAbsoluteIST, TIMEZONE };
