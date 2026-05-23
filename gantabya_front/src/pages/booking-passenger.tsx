import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../lib/api';
import { API_ENDPOINTS } from '../config';
import { UserNavbar } from '../components/UserNavbar';
import AdminLayout from '../components/AdminLayout';
import { Footer } from '../components/Footer';
import { roundToTwo, formatAmount, convertToINR, formatDualCurrency } from '../utils/currency';
import {
  FaArrowLeft,
  FaUser,
  FaTicketAlt,
  FaMapMarkerAlt,
  FaClock,
  FaCreditCard,
  FaMobileAlt,
  FaCheckCircle,
  FaDownload,
  FaPrint,
} from 'react-icons/fa';
import type { BusInfo, Seat } from '../types/booking';
import { loadRazorpayScript, submitEsewaForm } from '../utils/payment';

type PaymentGateway = 'RAZORPAY' | 'ESEWA';

type PassengerPageState = {
  selectedSeats: string[];
  fromStopId: string;
  toStopId: string;
  boardingPointId: string;
  droppingPointId: string;
  searchParams?: any;
  holdId?: string; // Seat hold ID for race condition prevention
};

type PassengerForm = {
  name: string;
  age: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  phone: string;
};

export function BookingPassengerPage({ isAdmin = false }: { isAdmin?: boolean }) {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as PassengerPageState) || {};

  const [busInfo, setBusInfo] = useState<BusInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [passengers, setPassengers] = useState<Record<string, PassengerForm>>({});
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentGateway>('ESEWA');
  const [paymentError, setPaymentError] = useState('');
  const [adminBookingResult, setAdminBookingResult] = useState<{ bookingGroupId: string; emailSent: boolean } | null>(null);

  const selectedSeats = state.selectedSeats || [];
  const fromStopId = state.fromStopId;
  const toStopId = state.toStopId;
  const boardingPointId = state.boardingPointId;
  const droppingPointId = state.droppingPointId;

  useEffect(() => {
    if (
      !tripId ||
      !selectedSeats.length ||
      !fromStopId ||
      !toStopId ||
      !boardingPointId ||
      !droppingPointId
    ) {
      navigate(isAdmin ? `/plus/offline-booking/${tripId ?? ''}` : `/book/${tripId ?? ''}`, { replace: true });
      return;
    }

    fetchUnreadCount();
    fetchBusInfo(fromStopId, toStopId);
  }, [tripId, selectedSeats.length, fromStopId, toStopId, boardingPointId, droppingPointId]);

  useEffect(() => {
    const handlePageShow = () => {
      setBookingLoading(false);
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  const fetchUnreadCount = async () => {
    if (isAdmin) return;
    try {
      const response = await api.get(API_ENDPOINTS.UNREAD_COUNT);
      setUnreadCount(response.data.unreadCount);
    } catch (err) {
      console.error('Failed to fetch notifications');
    }
  };

  const fetchBusInfo = async (fromId: string, toId: string) => {
    if (!tripId) return;

    setLoading(true);
    setError('');
    try {
      const response = await api.get(
        `/user/showbusinfo/${tripId}?fromStopId=${fromId}&toStopId=${toId}`
      );
      setBusInfo(response.data);
      initializePassengerForms(response.data);
    } catch (err: any) {
      setError(
        err.response?.data?.errorMessage ||
          'Failed to load passenger form. Please go back and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const initializePassengerForms = (info: BusInfo) => {
    const allSeats = [...info.seats.lowerDeck, ...info.seats.upperDeck];
    const initialPassengers: Record<string, PassengerForm> = {};

    selectedSeats.forEach((seatId) => {
      const seatExists = allSeats.some((seat) => seat.id === seatId);
      if (!seatExists) {
        return;
      }
      const seat = allSeats.find((s) => s.id === seatId);
      initialPassengers[seatId] = {
        name: '',
        age: 0,
        gender: seat?.isFemale ? 'FEMALE' : 'MALE',
        phone: '',
      };
    });

    setPassengers(initialPassengers);
  };

  const getSeatPrice = (seat: Seat): number => {
    if (!busInfo) return 0;

    if (seat.level === 'LOWER' && seat.type === 'SEATER') {
      return roundToTwo(
        Math.abs(
          busInfo.route.toStop.lowerSeaterPrice -
            busInfo.route.fromStop.lowerSeaterPrice
        )
      );
    }
    if (seat.level === 'LOWER' && seat.type === 'SLEEPER') {
      return roundToTwo(
        Math.abs(
          busInfo.route.toStop.lowerSleeperPrice -
            busInfo.route.fromStop.lowerSleeperPrice
        )
      );
    }
    if (seat.level === 'UPPER' && seat.type === 'SLEEPER') {
      return roundToTwo(
        Math.abs(
          busInfo.route.toStop.upperSleeperPrice -
            busInfo.route.fromStop.upperSleeperPrice
        )
      );
    }

    return 0;
  };

  const allSeats: Seat[] = busInfo
    ? [...busInfo.seats.lowerDeck, ...busInfo.seats.upperDeck]
    : [];

  const selectedSeatDetails = selectedSeats
    .map((seatId) => allSeats.find((seat) => seat.id === seatId))
    .filter((seat): seat is Seat => Boolean(seat));

  const baseAmount = roundToTwo(
    selectedSeatDetails.reduce(
      (sum, seat) => roundToTwo(sum + getSeatPrice(seat)),
      0
    )
  );
  const discountAmount = roundToTwo(appliedCoupon?.discountAmount ?? 0);
  const totalAmount = roundToTwo(
    appliedCoupon?.finalAmount !== undefined ? appliedCoupon.finalAmount : baseAmount
  );

  const handleApplyCoupon = async () => {
    const trimmedCode = couponCode.trim().toUpperCase();

    if (!trimmedCode || !tripId) return;

    if (baseAmount <= 0) {
      alert('Please select seats before applying a coupon.');
      return;
    }

    try {
      const response = await api.post('/user/booking/apply-coupon', {
        code: trimmedCode,
        tripId,
        totalAmount: roundToTwo(baseAmount),
      });

      setAppliedCoupon({
        ...response.data.offer,
        originalAmount: roundToTwo(response.data.originalAmount ?? baseAmount),
        discountAmount: roundToTwo(response.data.discountAmount),
        finalAmount: roundToTwo(response.data.finalAmount),
      });
      alert(`Coupon applied! You saved ₹${formatAmount(response.data.discountAmount)}`);
    } catch (err: any) {
      alert(err.response?.data?.errorMessage || 'Invalid coupon code');
    }
  };

  const handleConfirmBooking = async () => {
    if (!tripId) {
      return;
    }

    for (const seatId of selectedSeats) {
      const passenger = passengers[seatId];
      if (!passenger || !passenger.name.trim() || !passenger.age || passenger.age < 1) {
        alert('Please fill valid passenger details for each seat.');
        return;
      }
      if (!passenger.phone || !/^\+?\d{7,15}$/.test(passenger.phone.trim())) {
        alert('Please enter a valid phone number for each passenger.');
        return;
      }
      const seat = allSeats.find((s) => s.id === seatId);
      if (seat?.isFemale && passenger.gender !== 'FEMALE') {
        alert(`Seat ${seat.seatNumber} is reserved for female passengers only.`);
        return;
      }
    }

    setPaymentError('');
    setBookingLoading(true);

    try {
      const passengersArray = selectedSeats.map((seatId) => ({
        seatId,
        name: passengers[seatId].name.trim(),
        age: passengers[seatId].age,
        gender: passengers[seatId].gender,
        phone: passengers[seatId].phone.trim(),
      }));

      const bookingPayload = {
        tripId,
        fromStopId,
        toStopId,
        seatIds: selectedSeats,
        passengers: passengersArray,
        boardingPointId,
        droppingPointId,
        couponCode: appliedCoupon?.code || undefined,
        holdId: state.holdId, // Include seat hold ID for verification
      };

      if (isAdmin) {
        const response = await api.post(API_ENDPOINTS.ADMIN_OFFLINE_BOOKING, {
          tripId,
          fromStopId,
          toStopId,
          seatIds: selectedSeats,
          passengers: passengersArray,
          boardingPointId,
          droppingPointId,
          codAmount: totalAmount,
          codCurrency: 'NPR',
          adminNotes: 'Booked via admin offline booking'
        });
        setAdminBookingResult({
          bookingGroupId: response.data.bookingGroupId,
          emailSent: response.data.emailSent || false,
        });
        setBookingLoading(false);
        return;
      }

      const initiateResponse = await api.post(API_ENDPOINTS.PAYMENTS_INITIATE, {
        ...bookingPayload,
        paymentMethod,
      });

      const {
        paymentId,
        method,
        amount,
        currency,
        orderId,
        razorpayKeyId,
        form,
      } = initiateResponse.data;

      if (method === 'RAZORPAY') {
        await loadRazorpayScript();
        // Do NOT setBookingLoading(false) here, keep it true while Razorpay loads

        if (!window.Razorpay) {
          throw new Error('Failed to load Razorpay checkout. Please refresh and try again.');
        }

        const razorpay = new window.Razorpay({
          key: razorpayKeyId,
          amount: Math.round((amount || 0) * 100),
          currency: currency || 'INR',
          name: 'Go Gantabya',
          description: 'Bus ticket booking',
          order_id: orderId,
          notes: {
            tripId,
            fromStopId,
            toStopId,
          },
          handler: async (response) => {
            try {
              // Keep loading state true during verification
              await api.post(API_ENDPOINTS.PAYMENTS_VERIFY, {
                paymentId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });

              await api.post(API_ENDPOINTS.PAYMENTS_CONFIRM, {
                paymentId,
              });

              alert('Booking confirmed successfully!');
              navigate('/my-bookings');
            } catch (verificationError: any) {
              console.error('Error verifying Razorpay payment:', verificationError);
              const message =
                verificationError.response?.data?.errorMessage ||
                'Payment verification failed. Please contact support if amount was deducted.';
              setPaymentError(message);
              alert(message);
            } finally {
              setBookingLoading(false);
            }
          },
          modal: {
            ondismiss: () => {
              setBookingLoading(false);
              setPaymentError('Payment was cancelled before completion.');
            },
          },
          theme: {
            color: '#4F46E5',
          },
        });

        razorpay.on('payment.failed', (failure) => {
          console.error('Razorpay payment failed:', failure);
          const message =
            failure.error?.description || 'Payment failed. Please try again with a different method or card.';
          setPaymentError(message);
          alert(message);
          setBookingLoading(false);
        });

        razorpay.open();
        return;
      }

      if (method === 'ESEWA' && form) {
        sessionStorage.setItem('latestPaymentId', paymentId);
        // Removed alert("Redirecting to eSewa...");
        // Keep bookingLoading true until redirection happens
        submitEsewaForm(form.formUrl, form.params);
        return;
      }

      throw new Error('Unsupported payment method.');
    } catch (err: any) {
      console.error('Error initiating payment:', err);
      const message =
        err.response?.data?.errorMessage || err.message || 'Payment initiation failed. Please try again.';
      setPaymentError(message);
      alert(message);
      setBookingLoading(false);
    }
  };

  // Admin success screen with download/print
  if (isAdmin && adminBookingResult) {
    const handleDownloadPdf = async () => {
      try {
        const response = await api.get(`/admin/booking/${adminBookingResult.bookingGroupId}/pdf`, {
          responseType: 'blob',
        });
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `ticket-${adminBookingResult.bookingGroupId}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Error downloading PDF:', err);
        alert('Failed to download ticket PDF');
      }
    };

    const handlePrintPdf = async () => {
      try {
        const response = await api.get(`/admin/booking/${adminBookingResult.bookingGroupId}/pdf`, {
          responseType: 'blob',
        });
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
          printWindow.onload = () => {
            printWindow.focus();
            printWindow.print();
          };
        }
      } catch (err) {
        console.error('Error printing PDF:', err);
        alert('Failed to print ticket');
      }
    };

    const successContent = (
      <div className="max-w-2xl mx-auto mt-8 sm:mt-12 px-4">
            <div className="bg-green-50 border-2 border-green-500 rounded-2xl p-8 sm:p-12 text-center">
              <FaCheckCircle className="text-5xl sm:text-6xl text-green-600 mx-auto mb-4" />
              <h2 className="text-xl sm:text-2xl font-bold text-green-800 mb-2">
                Booking Successful!
              </h2>
              <p className="text-green-700 mb-6">
                Offline booking created successfully. Payment marked as COD.
              </p>

              {adminBookingResult.emailSent && (
                <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 mb-6">
                  <p className="text-blue-700 text-sm">
                    Ticket PDF has been sent to the customer's email.
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={handleDownloadPdf}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
                >
                  <FaDownload />
                  Download Ticket
                </button>
                <button
                  onClick={handlePrintPdf}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
                >
                  <FaPrint />
                  Print Ticket
                </button>
                <button
                  onClick={() => navigate('/plus/offline-booking')}
                  className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition"
                >
                  Book Another
                </button>
              </div>
            </div>
      </div>
    );

    return <AdminLayout>{successContent}</AdminLayout>;
  }

  if (loading) {
    const loadingContent = (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {!isAdmin && <UserNavbar unreadCount={unreadCount} currentPage="booking" />}
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
            <p className="mt-4 text-gray-600">Preparing passenger forms...</p>
          </div>
        </div>
      </div>
    );
    return isAdmin ? <AdminLayout>{loadingContent}</AdminLayout> : loadingContent;
  }

  if (error || !busInfo) {
    const errorContent = (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {!isAdmin && <UserNavbar unreadCount={unreadCount} currentPage="booking" />}
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Something went wrong</h2>
            <p className="mt-2 text-sm text-gray-600">{error || 'Unable to load passenger details.'}</p>
            <button
              onClick={() => navigate(isAdmin ? `/plus/offline-booking/${tripId}` : `/book/${tripId}`)}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700"
            >
              <FaArrowLeft />
              Back to seats
            </button>
          </div>
        </div>
      </div>
    );
    return isAdmin ? <AdminLayout>{errorContent}</AdminLayout> : errorContent;
  }

  const boardingPoint = busInfo.route.boardingPoints.find((point) => point.id === boardingPointId);
  const droppingPoint = busInfo.route.droppingPoints.find((point) => point.id === droppingPointId);

  const handleBackToBoarding = () => {
    navigate(isAdmin ? `/plus/offline-booking/${tripId}/boarding` : `/book/${tripId}/boarding`, {
      state: {
        selectedSeats,
        fromStopId,
        toStopId,
        boardingPointId,
        droppingPointId,
        searchParams: state.searchParams,
      },
    });
  };

  const mainContent = (
    <div className="min-h-screen bg-gray-50">
      {!isAdmin && <UserNavbar unreadCount={unreadCount} currentPage="booking" />}

      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-10">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={handleBackToBoarding}
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-indigo-600 shadow"
          >
            <FaArrowLeft />
            Back
          </button>
          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
              Step 2 of 2
            </div>
            <h1 className="text-lg font-bold text-gray-900">Passenger details & confirmation</h1>
          </div>
        </div>

        <div className="mb-6 rounded-3xl bg-white p-5 shadow-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">Route</div>
              <div className="text-sm font-semibold text-gray-900">
                {busInfo.route.fromStop.city} → {busInfo.route.toStop.city}
              </div>
              <div className="mt-1 flex flex-wrap gap-4 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <FaClock />
                  {busInfo.route.fromStop.departureTime || '--'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <FaClock />
                  {busInfo.route.toStop.arrivalTime || '--'}
                </span>
              </div>
            </div>
            <div className="rounded-2xl bg-indigo-50 px-4 py-3 text-sm text-indigo-700 shadow-inner">
              <div className="flex items-center gap-2 font-semibold">
                <FaTicketAlt />
                Total Fare
              </div>
              <div className="mt-1 text-lg font-bold text-indigo-600">{formatDualCurrency(totalAmount)}</div>
              {appliedCoupon && (
                <div className="text-xs text-green-600">Saved {formatDualCurrency(discountAmount)}</div>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 text-xs text-gray-500">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Boarding</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {boardingPoint?.name || 'N/A'}
              </div>
              <div className="mt-1 inline-flex items-center gap-1">
                <FaMapMarkerAlt className="text-indigo-500" />
                {boardingPoint?.landmark || '--'}
              </div>
              <div className="mt-1 inline-flex items-center gap-1">
                <FaClock className="text-indigo-500" />
                {boardingPoint?.time || '--'}
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Dropping</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {droppingPoint?.name || 'N/A'}
              </div>
              <div className="mt-1 inline-flex items-center gap-1">
                <FaMapMarkerAlt className="text-indigo-500" />
                {droppingPoint?.landmark || '--'}
              </div>
              <div className="mt-1 inline-flex items-center gap-1">
                <FaClock className="text-indigo-500" />
                {droppingPoint?.time || '--'}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {selectedSeatDetails.map((seat) => {
            const passenger = passengers[seat.id] || {
              name: '',
              age: 0,
              gender: (seat.isFemale ? 'FEMALE' : 'MALE') as PassengerForm['gender'],
              phone: '',
            };

            return (
              <div key={seat.id} className="rounded-3xl bg-white p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    Seat {seat.seatNumber} • {seat.level} {seat.type}
                    {seat.isFemale && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-pink-100 text-pink-700 border border-pink-300">
                        FEMALE ONLY
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-indigo-600">{formatDualCurrency(getSeatPrice(seat))}</div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Passenger Name
                    </label>
                    <div className="mt-2 flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2">
                      <FaUser className="text-gray-400" />
                      <input
                        type="text"
                        value={passenger.name}
                        onChange={(event) =>
                          setPassengers((prev) => ({
                            ...prev,
                            [seat.id]: {
                              ...prev[seat.id],
                              name: event.target.value,
                            },
                          }))
                        }
                        placeholder="Full name as per ID"
                        className="w-full bg-transparent text-sm text-gray-800 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Age
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={passenger.age || ''}
                      onChange={(event) =>
                        setPassengers((prev) => ({
                          ...prev,
                          [seat.id]: {
                            ...prev[seat.id],
                            age: parseInt(event.target.value || '0', 10),
                          },
                        }))
                      }
                      className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                      placeholder="Age"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Gender
                    </label>
                    <select
                      value={passenger.gender}
                      disabled={!!seat.isFemale}
                      onChange={(event) =>
                        setPassengers((prev) => ({
                          ...prev,
                          [seat.id]: {
                            ...prev[seat.id],
                            gender: event.target.value as PassengerForm['gender'],
                          },
                        }))
                      }
                      className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:opacity-70"
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={passenger.phone}
                      onChange={(event) =>
                        setPassengers((prev) => ({
                          ...prev,
                          [seat.id]: {
                            ...prev[seat.id],
                            phone: event.target.value,
                          },
                        }))
                      }
                      placeholder="Enter phone with country code (e.g. +9779812345678)"
                      className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-3xl bg-white p-5 shadow-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {isAdmin ? null : (
              <div className="sm:w-2/3">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Have a coupon?
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                    placeholder="Enter coupon code"
                    className="flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  />
                  <button
                    onClick={handleApplyCoupon}
                    className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-100"
                  >
                    Apply
                  </button>
                </div>
                {appliedCoupon && (
                  <div className="mt-2 text-xs text-green-600">
                    Coupon {appliedCoupon.code} applied! You saved {formatDualCurrency(discountAmount)}.
                  </div>
                )}
              </div>
            )}
            <div className="sm:text-right">
              <div className="text-xs uppercase tracking-wide text-gray-400">Total amount</div>
              <div className="text-2xl font-bold text-indigo-600">{formatDualCurrency(totalAmount)}</div>
              {appliedCoupon && (
                <div className="text-xs text-gray-500">Discount applied: {formatDualCurrency(discountAmount)}</div>
              )}
            </div>
          </div>
          <div className="mt-5 space-y-4">
            {!isAdmin ? (
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Select payment method
                </span>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('ESEWA')}
                    className={`flex-1 flex items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${
                      paymentMethod === 'ESEWA'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 hover:border-green-300 text-gray-700'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <FaMobileAlt /> eSewa
                    </span>
                    <span className="text-[11px] text-gray-500">Pay NPR {formatAmount(totalAmount)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('RAZORPAY')}
                    className={`flex-1 flex items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${
                      paymentMethod === 'RAZORPAY'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 hover:border-indigo-300 text-gray-700'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <FaCreditCard /> Razorpay
                    </span>
                    <span className="text-[11px] text-gray-500">Pay ₹{formatAmount(convertToINR(totalAmount))}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-gray-700 bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                  Payment Method: Cash on Delivery (COD) <br/>
                  <span className="text-xs font-normal text-gray-500">Bookings placed through admin are directly registered and bypass the payment gateway.</span>
                </div>
                <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded-xl border border-gray-200">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Amount to Collect</span>
                  <div className="text-lg font-bold text-indigo-600 mt-1">{formatDualCurrency(totalAmount)}</div>
                </div>
              </div>
            )}

            {paymentError && (
              <p className="text-xs text-red-600">{paymentError}</p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500">
                By confirming, you agree to the cancellation policy and terms of service.
              </p>
              <button
                onClick={handleConfirmBooking}
                disabled={bookingLoading}
                className={`w-full sm:w-auto rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg transition-colors ${
                  bookingLoading
                    ? 'bg-gray-300 text-gray-500'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {bookingLoading ? 'Processing...' : 'Confirm booking'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return isAdmin ? <AdminLayout>{mainContent}</AdminLayout> : <>{mainContent}<Footer /></>;
}
