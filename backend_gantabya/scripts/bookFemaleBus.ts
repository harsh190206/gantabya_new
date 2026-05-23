/**
 * Create sample CONFIRMED bookings on the female-test bus
 * so admin booking report shows phone numbers.
 *
 * Run: npx ts-node scripts/bookFemaleBus.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🎫 Booking female-test bus...');

  const bus = await prisma.bus.findUnique({
    where: { busNumber: 'NP-02-FT-9999' },
    include: {
      stops: { include: { boardingPoints: true }, orderBy: { stopIndex: 'asc' } },
      seats: true,
    },
  });

  if (!bus) {
    throw new Error('female-test bus (NP-02-FT-9999) not found. Run scripts/seed.ts first.');
  }

  const user = await prisma.user.findUnique({ where: { email: 'user@gmail.com' } });
  if (!user) {
    throw new Error('Test user (user@gmail.com) not found. Run scripts/seed.ts first.');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const trip = await prisma.trip.findFirst({
    where: { busId: bus.id, tripDate: today },
  }) ?? await prisma.trip.upsert({
    where: { busId_tripDate: { busId: bus.id, tripDate: today } },
    update: {},
    create: { busId: bus.id, tripDate: today, status: 'SCHEDULED' },
  });

  const fromStop = bus.stops[0]!;
  const toStop = bus.stops[bus.stops.length - 1]!;
  const boardingPoint = fromStop.boardingPoints[0]!;
  const droppingPoint = toStop.boardingPoints[0]!;

  // Helper — book a group of (seatNumber, passenger) pairs
  const bookGroup = async (
    pairs: Array<{ seatNumber: string; name: string; age: number; gender: 'MALE'|'FEMALE'|'OTHER'; phone: string }>
  ) => {
    const seats = await Promise.all(
      pairs.map((p) =>
        prisma.seat.findFirst({ where: { busId: bus.id, seatNumber: p.seatNumber } })
      )
    );
    if (seats.some((s) => !s)) throw new Error('Seat lookup failed');

    const fare =
      Math.abs(toStop.lowerSeaterPrice - fromStop.lowerSeaterPrice) * pairs.length;

    const group = await prisma.bookingGroup.create({
      data: {
        userId: user.id,
        tripId: trip.id,
        fromStopId: fromStop.id,
        toStopId: toStop.id,
        boardingPointId: boardingPoint.id,
        droppingPointId: droppingPoint.id,
        totalPrice: fare,
        finalPrice: fare,
        discountAmount: 0,
        status: 'CONFIRMED',
      },
    });

    for (let i = 0; i < pairs.length; i++) {
      const seat = seats[i]!;
      const p = pairs[i]!;
      const booking = await prisma.booking.create({
        data: { groupId: group.id, tripId: trip.id, seatId: seat.id, status: 'CONFIRMED' },
      });
      await prisma.passenger.create({
        data: {
          bookingId: booking.id,
          name: p.name,
          age: p.age,
          gender: p.gender,
          phone: p.phone,
          email: `${p.name.toLowerCase().replace(/\s/g, '.')}@test.com`,
        },
      });
    }

    await prisma.payment.create({
      data: {
        userId: user.id,
        bookingGroupId: group.id,
        method: 'ESEWA',
        baseAmount: fare,
        baseCurrency: 'NPR',
        chargedAmount: fare,
        chargedCurrency: 'NPR',
        status: 'SUCCESS',
        gatewayPaymentId: `SEED-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      },
    });

    console.log(`  ✅ Group: ${pairs.map((p) => `${p.name} (seat ${p.seatNumber})`).join(', ')}`);
  };

  // Booking 1 — female-only seats 1 & 2
  await bookGroup([
    { seatNumber: '1', name: 'Sita Sharma', age: 28, gender: 'FEMALE', phone: '+9779812345001' },
    { seatNumber: '2', name: 'Gita Khadka', age: 24, gender: 'FEMALE', phone: '+9779812345002' },
  ]);

  // Booking 2 — male on regular seat
  await bookGroup([
    { seatNumber: '3', name: 'Ram Bahadur', age: 35, gender: 'MALE', phone: '+9779812345003' },
  ]);

  // Booking 3 — sleeper for couple
  await bookGroup([
    { seatNumber: '5', name: 'Hari Thapa', age: 40, gender: 'MALE', phone: '+9779812345004' },
  ]);

  // Booking 4 — female on female-only seat 8
  await bookGroup([
    { seatNumber: '8', name: 'Maya Gurung', age: 31, gender: 'FEMALE', phone: '+9779812345005' },
  ]);

  // Booking 5 — last-row 5-seater
  await bookGroup([
    { seatNumber: '14', name: 'Bikash Rai', age: 22, gender: 'MALE', phone: '+9779812345006' },
    { seatNumber: '15', name: 'Anita Magar', age: 26, gender: 'FEMALE', phone: '+9779812345007' },
    { seatNumber: '18', name: 'Suresh KC', age: 45, gender: 'MALE', phone: '+9779812345008' },
  ]);

  console.log(`\n🎉 Done. Trip date: ${today.toISOString().split('T')[0]}`);
  console.log(`   Check: Admin → Booking Report → select today's date`);
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
