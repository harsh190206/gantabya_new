/**
 * Delete all active (CONFIRMED) bookings across every bus.
 * Cascades remove Booking, Passenger, Payment, SeatHold.
 *
 * Run: npx ts-node scripts/deleteActiveBooking.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  Deleting all active bookings...');

  const activeGroups = await prisma.bookingGroup.findMany({
    where: { status: 'CONFIRMED' },
    select: { id: true, tripId: true, bookings: { select: { seatId: true } } },
  });

  console.log(`Found ${activeGroups.length} active booking group(s).`);

  if (activeGroups.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  const groupIds = activeGroups.map((g) => g.id);

  // Release any seat holds tied to those trips/seats (best-effort)
  const seatIds = Array.from(
    new Set(activeGroups.flatMap((g) => g.bookings.map((b) => b.seatId)))
  );
  const tripIds = Array.from(new Set(activeGroups.map((g) => g.tripId)));

  const heldDeleted = await prisma.seatHold.deleteMany({
    where: { tripId: { in: tripIds }, seatId: { in: seatIds } },
  });
  console.log(`  ✅ Released ${heldDeleted.count} seat hold(s)`);

  // Payments — only ones with bookingGroupId in our set; cascade handles when group deleted,
  // but explicit cleanup keeps log clear.
  const paymentDeleted = await prisma.payment.deleteMany({
    where: { bookingGroupId: { in: groupIds } },
  });
  console.log(`  ✅ Deleted ${paymentDeleted.count} payment(s)`);

  // Delete booking groups → cascades Booking + Passenger
  const groupDeleted = await prisma.bookingGroup.deleteMany({
    where: { id: { in: groupIds } },
  });
  console.log(`  ✅ Deleted ${groupDeleted.count} booking group(s)`);

  console.log('🎉 All active bookings removed.');
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
