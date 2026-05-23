import React, { useState, useEffect } from 'react';
import {
  FaBus,
  FaTicketAlt,
  FaRupeeSign,
  FaChair,
  FaBed,
  FaSearch,
  FaArrowUp,
  FaArrowDown,
  FaRoute,
  FaUsers,
  FaChevronDown,
  FaChevronUp,
} from 'react-icons/fa';
import AdminLayout from '../components/AdminLayout';
import DualDatePicker from '../components/DualDatePicker';
import api from '../lib/api';
import { API_ENDPOINTS } from '../config';
import { getDualDateDisplay } from '../utils/nepaliDateConverter';
import { getTodayIST } from '../utils/currency';

interface SeatInfo {
  seatNumber: string;
  type: 'SEATER' | 'SLEEPER';
  level: 'UPPER' | 'LOWER';
  passengerName: string;
  passengerAge: number | null;
  passengerGender: string | null;
  passengerPhone?: string | null;
}

interface BookingInfo {
  bookingId: string;
  passenger: {
    name: string;
    email: string;
    phone: string;
  };
  route: string;
  boardingPoint: string;
  droppingPoint: string;
  seats: SeatInfo[];
  seatCount: number;
  amount: number;
  discount: number;
  finalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  bookedAt: string;
}

interface RouteWiseStat {
  route: string;
  bookings: number;
  revenue: number;
}

interface BusReport {
  busId: string;
  busNumber: string;
  busName: string;
  route: string;
  tripStatus: string;
  totalSeats: number;
  seatsBooked: number;
  availableSeats: number;
  seatBreakdown: {
    lowerSeater: number;
    lowerSleeper: number;
    upperSeater: number;
    upperSleeper: number;
    total: number;
  };
  routeWiseStats: RouteWiseStat[];
  totalBookings: number;
  totalRevenue: number;
  bookings: BookingInfo[];
}

interface ReportData {
  summary: {
    date: string;
    totalBuses: number;
    totalBookings: number;
    totalSeatsBooked: number;
    totalRevenue: number;
    seatTypeBreakdown: {
      lowerSeater: number;
      lowerSleeper: number;
      upperSeater: number;
      upperSleeper: number;
    };
  };
  buses: BusReport[];
}

const AdminBookingsReport: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayIST());
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedBuses, setExpandedBuses] = useState<Set<string>>(new Set());

  const fetchReport = async () => {
    if (!selectedDate) {
      setError('Please select a date');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.get(`${API_ENDPOINTS.ADMIN_BOOKINGS_DATE_REPORT}?date=${selectedDate}`);
      setReportData(response.data);
      // Expand all buses by default
      if (response.data.buses) {
        setExpandedBuses(new Set(response.data.buses.map((b: BusReport) => b.busId)));
      }
    } catch (err: any) {
      setError(err.response?.data?.errorMessage || 'Failed to fetch report');
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Auto-fetch on initial load
    fetchReport();
  }, []);

  const toggleBusExpansion = (busId: string) => {
    setExpandedBuses((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(busId)) {
        newSet.delete(busId);
      } else {
        newSet.add(busId);
      }
      return newSet;
    });
  };

  const formatDate = (dateString: string) => {
    const dual = getDualDateDisplay(dateString);
    return `${dual.ad} (${dual.bs})`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NP', {
      style: 'currency',
      currency: 'NPR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Booking Report</h1>
            <p className="text-gray-600 mt-1">View date-wise booking details and analytics</p>
          </div>
        </div>

        {/* Date Picker Card */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1 max-w-xs">
              <DualDatePicker
                value={selectedDate}
                onChange={(date) => setSelectedDate(date)}
                label="Select Date"
              />
            </div>
            <button
              onClick={fetchReport}
              disabled={loading}
              className="px-6 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FaSearch />
              <span>{loading ? 'Loading...' : 'Get Report'}</span>
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
          </div>
        )}

        {/* Report Data */}
        {reportData && !loading && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Total Buses */}
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100 text-sm font-medium">Buses with Trips</p>
                    <p className="text-3xl font-bold mt-2">{reportData.summary.totalBuses}</p>
                  </div>
                  <div className="bg-blue-400 bg-opacity-30 p-4 rounded-full">
                    <FaBus className="text-3xl" />
                  </div>
                </div>
              </div>

              {/* Total Bookings */}
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100 text-sm font-medium">Total Bookings</p>
                    <p className="text-3xl font-bold mt-2">{reportData.summary.totalBookings}</p>
                  </div>
                  <div className="bg-green-400 bg-opacity-30 p-4 rounded-full">
                    <FaTicketAlt className="text-3xl" />
                  </div>
                </div>
              </div>

              {/* Total Seats */}
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-100 text-sm font-medium">Seats Booked</p>
                    <p className="text-3xl font-bold mt-2">{reportData.summary.totalSeatsBooked}</p>
                  </div>
                  <div className="bg-purple-400 bg-opacity-30 p-4 rounded-full">
                    <FaUsers className="text-3xl" />
                  </div>
                </div>
              </div>

              {/* Total Revenue */}
              <div className="bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl shadow-lg p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-yellow-100 text-sm font-medium">Total Revenue</p>
                    <p className="text-2xl font-bold mt-2">{formatCurrency(reportData.summary.totalRevenue)}</p>
                  </div>
                  <div className="bg-yellow-400 bg-opacity-30 p-4 rounded-full">
                    <FaRupeeSign className="text-3xl" />
                  </div>
                </div>
              </div>
            </div>

            {/* Seat Type Breakdown */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Seat Type Breakdown</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center space-x-2 mb-2">
                    <FaArrowDown className="text-blue-500" />
                    <FaChair className="text-blue-500" />
                  </div>
                  <p className="text-2xl font-bold text-blue-600">
                    {reportData.summary.seatTypeBreakdown.lowerSeater}
                  </p>
                  <p className="text-sm text-gray-600">Lower Seater</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center space-x-2 mb-2">
                    <FaArrowDown className="text-green-500" />
                    <FaBed className="text-green-500" />
                  </div>
                  <p className="text-2xl font-bold text-green-600">
                    {reportData.summary.seatTypeBreakdown.lowerSleeper}
                  </p>
                  <p className="text-sm text-gray-600">Lower Sleeper</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center space-x-2 mb-2">
                    <FaArrowUp className="text-purple-500" />
                    <FaChair className="text-purple-500" />
                  </div>
                  <p className="text-2xl font-bold text-purple-600">
                    {reportData.summary.seatTypeBreakdown.upperSeater}
                  </p>
                  <p className="text-sm text-gray-600">Upper Seater</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center space-x-2 mb-2">
                    <FaArrowUp className="text-orange-500" />
                    <FaBed className="text-orange-500" />
                  </div>
                  <p className="text-2xl font-bold text-orange-600">
                    {reportData.summary.seatTypeBreakdown.upperSleeper}
                  </p>
                  <p className="text-sm text-gray-600">Upper Sleeper</p>
                </div>
              </div>
            </div>

            {/* No Data Message */}
            {reportData.buses.length === 0 && (
              <div className="bg-gray-100 rounded-xl p-8 text-center">
                <FaBus className="text-6xl text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-600">No Trips Found</h3>
                <p className="text-gray-500 mt-2">
                  There are no trips scheduled for {formatDate(selectedDate)}
                </p>
              </div>
            )}

            {/* Bus-wise Report */}
            {reportData.buses.map((bus) => (
              <div key={bus.busId} className="bg-white rounded-xl shadow-md overflow-hidden">
                {/* Bus Header */}
                <div
                  className="bg-gradient-to-r from-slate-700 to-slate-800 text-white p-4 cursor-pointer"
                  onClick={() => toggleBusExpansion(bus.busId)}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-center space-x-4">
                      <div className="bg-yellow-500 p-3 rounded-full">
                        <FaBus className="text-xl" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold">{bus.busNumber} - {bus.busName}</h3>
                        <p className="text-sm text-gray-300 flex items-center space-x-2">
                          <FaRoute className="text-yellow-400" />
                          <span>{bus.route}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        bus.tripStatus === 'SCHEDULED' ? 'bg-blue-500' :
                        bus.tripStatus === 'ONGOING' ? 'bg-green-500' :
                        bus.tripStatus === 'COMPLETED' ? 'bg-gray-500' :
                        'bg-red-500'
                      }`}>
                        {bus.tripStatus}
                      </span>
                      <div className="text-right">
                        <p className="text-sm text-gray-300">Revenue</p>
                        <p className="font-bold text-yellow-400">{formatCurrency(bus.totalRevenue)}</p>
                      </div>
                      <button className="bg-slate-600 p-2 rounded-lg hover:bg-slate-500 transition">
                        {expandedBuses.has(bus.busId) ? <FaChevronUp /> : <FaChevronDown />}
                      </button>
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-600">
                    <div>
                      <p className="text-sm text-gray-400">Bookings</p>
                      <p className="text-xl font-bold">{bus.totalBookings}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Seats Booked</p>
                      <p className="text-xl font-bold">{bus.seatsBooked} / {bus.totalSeats}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Lower</p>
                      <p className="text-xl font-bold">
                        {bus.seatBreakdown.lowerSeater + bus.seatBreakdown.lowerSleeper}
                        <span className="text-sm text-gray-400 ml-1">
                          ({bus.seatBreakdown.lowerSeater}S / {bus.seatBreakdown.lowerSleeper}Sl)
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Upper</p>
                      <p className="text-xl font-bold">
                        {bus.seatBreakdown.upperSeater + bus.seatBreakdown.upperSleeper}
                        <span className="text-sm text-gray-400 ml-1">
                          ({bus.seatBreakdown.upperSeater}S / {bus.seatBreakdown.upperSleeper}Sl)
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {expandedBuses.has(bus.busId) && (
                  <div className="p-4 space-y-6">
                    {/* Route-wise Stats */}
                    {bus.routeWiseStats.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-gray-700 mb-3">Route-wise Breakdown</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {bus.routeWiseStats.map((stat, idx) => (
                            <div
                              key={idx}
                              className="bg-gray-50 rounded-lg p-3 flex justify-between items-center"
                            >
                              <div>
                                <p className="font-medium text-gray-800">{stat.route}</p>
                                <p className="text-sm text-gray-500">{stat.bookings} booking(s)</p>
                              </div>
                              <p className="font-bold text-green-600">{formatCurrency(stat.revenue)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Booking Details Table */}
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-3">Booking Details</h4>
                      {bus.bookings.length === 0 ? (
                        <p className="text-gray-500 text-center py-4">No bookings for this bus</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Passenger
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Phone
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  City Route
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Seat
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Boarding
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Dropping
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Amount
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Payment
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {bus.bookings.flatMap((booking) =>
                                booking.seats.map((seat, sIdx) => {
                                  const isFirst = sIdx === 0;
                                  const perSeatAmount =
                                    booking.seats.length > 0
                                      ? booking.finalAmount / booking.seats.length
                                      : booking.finalAmount;
                                  return (
                                    <tr key={`${booking.bookingId}-${sIdx}`} className="hover:bg-gray-50">
                                      <td className="px-4 py-3">
                                        <p className="font-medium text-gray-900">{seat.passengerName}</p>
                                        <p className="text-xs text-gray-500">
                                          {seat.passengerAge ?? '-'} / {seat.passengerGender ?? '-'}
                                        </p>
                                      </td>
                                      <td className="px-4 py-3">
                                        {seat.passengerPhone ? (
                                          <a
                                            href={`tel:${seat.passengerPhone}`}
                                            className="text-sm text-indigo-600 hover:underline"
                                          >
                                            📞 {seat.passengerPhone}
                                          </a>
                                        ) : (
                                          <span className="text-xs text-gray-400">-</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-sm text-gray-700">{booking.route}</td>
                                      <td className="px-4 py-3">
                                        <span
                                          className={`px-2 py-1 rounded text-xs font-medium ${
                                            seat.level === 'LOWER'
                                              ? seat.type === 'SEATER'
                                                ? 'bg-blue-100 text-blue-800'
                                                : 'bg-green-100 text-green-800'
                                              : seat.type === 'SEATER'
                                              ? 'bg-purple-100 text-purple-800'
                                              : 'bg-orange-100 text-orange-800'
                                          }`}
                                        >
                                          {seat.seatNumber} ({seat.level[0]}-{seat.type[0]})
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-xs text-gray-600">
                                        {booking.boardingPoint}
                                      </td>
                                      <td className="px-4 py-3 text-xs text-gray-600">
                                        {booking.droppingPoint}
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                                        {formatCurrency(perSeatAmount)}
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap">
                                        {isFirst && (
                                          <>
                                            <span
                                              className={`px-2 py-1 rounded text-xs font-medium ${
                                                booking.paymentStatus === 'SUCCESS'
                                                  ? 'bg-green-100 text-green-800'
                                                  : booking.paymentStatus === 'PENDING'
                                                  ? 'bg-yellow-100 text-yellow-800'
                                                  : 'bg-red-100 text-red-800'
                                              }`}
                                            >
                                              {booking.paymentStatus}
                                            </span>
                                            <p className="text-xs text-gray-500 mt-1">{booking.paymentMethod}</p>
                                          </>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminBookingsReport;
