/**
 * RT LAB V2 — M4 Booking ↔ LIS Bridge
 * Confirm booking → Patient → LabOrder → order_tests → Sample
 * Uses Supabase RPC confirm_booking_to_order when available,
 * otherwise local demo store (localStorage).
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'rt_v2_bridge_store';

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveStore(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  function uid(prefix) {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 8);
    return prefix + t + r;
  }

  function todayStamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  /**
   * Local confirm (no cloud) — mirrors SQL function logic
   */
  function confirmLocal(booking, opts) {
    opts = opts || {};
    const store = loadStore();
    store.patients = store.patients || {};
    store.orders = store.orders || {};
    store.samples = store.samples || {};
    store.bookings = store.bookings || {};

    if (!booking || !booking.id) throw new Error('booking.id required');
    if (booking.status === 'CANCELLED') throw new Error('Booking cancelled');

    let patientId = booking.patient_id;
    if (!patientId) {
      patientId = 'P-' + todayStamp() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      store.patients[patientId] = {
        id: patientId,
        full_name: booking.full_name || booking.name || 'Unknown',
        gender: booking.gender || null,
        age_text: booking.age_text || booking.age || null,
        phone: booking.phone || null,
        whatsapp: booking.whatsapp || booking.phone || null,
        address: booking.address || null,
        created_at: new Date().toISOString()
      };
    } else if (!store.patients[patientId]) {
      store.patients[patientId] = {
        id: patientId,
        full_name: booking.full_name || 'Unknown',
        gender: booking.gender,
        age_text: booking.age_text || booking.age,
        phone: booking.phone,
        whatsapp: booking.whatsapp || booking.phone,
        address: booking.address,
        created_at: new Date().toISOString()
      };
    }

    const orderId = opts.orderId || ('RT-' + new Date().getFullYear() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase());
    const tests = (booking.tests || booking.booking_tests || []).map(t => ({
      test_code: t.test_code || t.code,
      test_name: t.test_name || t.name || t.code,
      price: Number(t.price) || 0
    }));

    const order = {
      id: orderId,
      patient_id: patientId,
      booking_id: booking.id,
      doctor: booking.doctor || opts.doctor || '',
      priority: booking.priority || 'Routine',
      status: 'CREATED',
      branch: opts.branch || booking.branch || '',
      tests,
      created_by: opts.createdBy || 'Admin',
      created_at: new Date().toISOString(),
      meta: { source: 'booking_confirm' }
    };

    const sampleId = 'S-' + Math.random().toString(36).slice(2, 10).toUpperCase();
    const sample = {
      id: sampleId,
      order_id: orderId,
      sample_type: opts.sampleType || 'As required',
      status: 'PENDING',
      created_at: new Date().toISOString()
    };

    const bookingRow = Object.assign({}, booking, {
      patient_id: patientId,
      status: 'CONFIRMED',
      confirmed_at: new Date().toISOString(),
      lab_order_id: orderId
    });

    store.bookings[booking.id] = bookingRow;
    store.orders[orderId] = order;
    store.samples[sampleId] = sample;
    saveStore(store);

    return {
      mode: 'local',
      patient_id: patientId,
      order_id: orderId,
      sample_id: sampleId,
      booking: bookingRow,
      order,
      sample,
      patient: store.patients[patientId]
    };
  }

  /**
   * Cloud confirm via RPC
   */
  async function confirmCloud(supabase, bookingId, opts) {
    opts = opts || {};
    const { data, error } = await supabase.rpc('confirm_booking_to_order', {
      p_booking_id: bookingId,
      p_order_id: opts.orderId || null,
      p_branch: opts.branch || null,
      p_created_by: opts.createdBy || null
    });
    if (error) throw error;
    return {
      mode: 'cloud',
      order_id: data,
      booking_id: bookingId
    };
  }

  /**
   * Unified entry
   * @param {object} args
   * @param {object} [args.supabase] - supabase client
   * @param {string} [args.bookingId]
   * @param {object} [args.booking] - full booking object for local path
   * @param {object} [args.opts]
   */
  async function confirmBookingToOrder(args) {
    const opts = args.opts || {};
    if (args.supabase && args.bookingId) {
      try {
        return await confirmCloud(args.supabase, args.bookingId, opts);
      } catch (e) {
        // fall through to local if booking object provided
        if (!args.booking) throw e;
        console.warn('Cloud confirm failed, using local:', e.message || e);
      }
    }
    if (!args.booking) throw new Error('Provide booking object or supabase+bookingId');
    return confirmLocal(args.booking, opts);
  }

  /** Status transitions helpers */
  const ORDER_FLOW = [
    'CREATED', 'SAMPLE_PENDING', 'COLLECTED', 'RECEIVED',
    'PROCESSING', 'RESULTS_PENDING', 'VERIFICATION', 'FINAL', 'RELEASED'
  ];

  function advanceOrderStatus(orderId, newStatus) {
    const store = loadStore();
    const order = store.orders && store.orders[orderId];
    if (!order) throw new Error('Order not found locally: ' + orderId);
    order.status = newStatus;
    order.updated_at = new Date().toISOString();
    saveStore(store);
    return order;
  }

  function listLocalPipeline() {
    const store = loadStore();
    const bookings = Object.values(store.bookings || {});
    const orders = Object.values(store.orders || {});
    const samples = Object.values(store.samples || {});
    const patients = Object.values(store.patients || {});
    return { bookings, orders, samples, patients };
  }

  function seedDemoBookings() {
    const store = loadStore();
    store.bookings = store.bookings || {};
    const demos = [
      {
        id: 'B-' + todayStamp() + '-001',
        full_name: 'أحمد محمد السيد',
        gender: 'Male',
        age_text: '43 سنة',
        phone: '01012345678',
        whatsapp: '01012345678',
        visit_type: 'branch',
        status: 'QUOTED',
        total: 400,
        tests: [
          { code: 'CBC', test_code: 'CBC', name: 'Complete Blood Count', price: 150 },
          { code: 'LIPID', test_code: 'LIPID', name: 'Lipid Profile', price: 200 }
        ],
        preferred_date: new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString()
      },
      {
        id: 'B-' + todayStamp() + '-002',
        full_name: 'مريم حسن',
        gender: 'Female',
        age_text: '28 سنة',
        phone: '01198765432',
        visit_type: 'home',
        address: 'مدينة نصر',
        status: 'QUOTED',
        total: 250,
        tests: [
          { code: 'LFT', test_code: 'LFT', name: 'Liver Function', price: 250 }
        ],
        preferred_date: new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString()
      }
    ];
    demos.forEach(b => {
      if (!store.bookings[b.id]) store.bookings[b.id] = b;
    });
    // also keep pending queue separate for UI
    store.pending_queue = demos.map(d => d.id);
    saveStore(store);
    return demos;
  }

  global.RTBookingBridge = {
    confirmBookingToOrder,
    confirmLocal,
    confirmCloud,
    advanceOrderStatus,
    listLocalPipeline,
    seedDemoBookings,
    ORDER_FLOW,
    loadStore,
    saveStore
  };
})(typeof window !== 'undefined' ? window : globalThis);
