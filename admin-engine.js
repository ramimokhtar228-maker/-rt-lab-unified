/**
 * RT LAB V2 — M7 Administration modules
 * Finance · Expenses · Inventory · HR
 * Kept out of daily LIS result workflow.
 */
(function (global) {
  'use strict';

  const KEY = 'rt_v2_admin_store';

  function empty() {
    return {
      expenses: [],
      inventory: [],
      employees: [],
      attendance: [],
      payments: [],
      settings: {
        labSharePct: 50,
        ceoSharePct: 50,
        branch: 'الفرع الرئيسي — شبرا الخيمة'
      }
    };
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!s) return empty();
      return Object.assign(empty(), s);
    } catch (e) {
      return empty();
    }
  }

  function save(s) {
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  function id(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---- Expenses ----
  const EXPENSE_CATS = ['rent', 'electricity', 'water', 'external_tests', 'supplies', 'other'];

  function addExpense(row) {
    const s = load();
    const item = {
      id: id('EXP-'),
      date: row.date || new Date().toISOString().slice(0, 10),
      category: row.category || 'other',
      amount: Number(row.amount) || 0,
      note: row.note || '',
      createdAt: new Date().toISOString()
    };
    s.expenses.unshift(item);
    save(s);
    return item;
  }

  function deleteExpense(eid) {
    const s = load();
    s.expenses = s.expenses.filter(x => x.id !== eid);
    save(s);
  }

  // ---- Inventory ----
  function addInventoryItem(row) {
    const s = load();
    const item = {
      id: id('INV-'),
      name: row.name || '',
      sku: row.sku || '',
      unit: row.unit || 'unit',
      qty: Number(row.qty) || 0,
      minQty: Number(row.minQty) || 0,
      cost: Number(row.cost) || 0,
      expiresOn: row.expiresOn || '',
      createdAt: new Date().toISOString()
    };
    s.inventory.unshift(item);
    save(s);
    return item;
  }

  function adjustStock(iid, delta, reason) {
    const s = load();
    const item = s.inventory.find(x => x.id === iid);
    if (!item) throw new Error('Item not found');
    item.qty = Number(item.qty) + Number(delta);
    item.lastMove = { delta: Number(delta), reason: reason || '', at: new Date().toISOString() };
    save(s);
    return item;
  }

  function deleteInventory(iid) {
    const s = load();
    s.inventory = s.inventory.filter(x => x.id !== iid);
    save(s);
  }

  function lowStock() {
    return load().inventory.filter(i => Number(i.qty) <= Number(i.minQty));
  }

  // ---- HR ----
  function addEmployee(row) {
    const s = load();
    const emp = {
      id: id('EMP-'),
      name: row.name || '',
      role: row.role || '',
      salary: Number(row.salary) || 0,
      active: true,
      createdAt: new Date().toISOString()
    };
    s.employees.unshift(emp);
    save(s);
    return emp;
  }

  function updateSalary(eid, salary) {
    const s = load();
    const e = s.employees.find(x => x.id === eid);
    if (!e) throw new Error('Employee not found');
    e.salary = Number(salary) || 0;
    save(s);
    return e;
  }

  function setEmployeeActive(eid, active) {
    const s = load();
    const e = s.employees.find(x => x.id === eid);
    if (!e) throw new Error('Employee not found');
    e.active = !!active;
    save(s);
    return e;
  }

  function deleteEmployee(eid) {
    const s = load();
    s.employees = s.employees.filter(x => x.id !== eid);
    s.attendance = s.attendance.filter(a => a.empId !== eid);
    save(s);
  }

  function upsertAttendance(row) {
    const s = load();
    const existing = s.attendance.find(a => a.empId === row.empId && a.date === row.date);
    if (existing) {
      if (row.checkIn) existing.checkIn = row.checkIn;
      if (row.checkOut) existing.checkOut = row.checkOut;
      if (row.note != null) existing.note = row.note;
      save(s);
      return existing;
    }
    const a = {
      id: id('ATT-'),
      empId: row.empId,
      date: row.date,
      checkIn: row.checkIn || '',
      checkOut: row.checkOut || '',
      note: row.note || ''
    };
    s.attendance.unshift(a);
    save(s);
    return a;
  }

  function deleteAttendance(aid) {
    const s = load();
    s.attendance = s.attendance.filter(a => a.id !== aid);
    save(s);
  }

  // ---- Finance / income split ----
  function addPayment(row) {
    const s = load();
    const p = {
      id: id('PAY-'),
      date: row.date || new Date().toISOString().slice(0, 10),
      orderId: row.orderId || '',
      patientName: row.patientName || '',
      amount: Number(row.amount) || 0,
      method: row.method || 'cash',
      note: row.note || '',
      createdAt: new Date().toISOString()
    };
    s.payments.unshift(p);
    save(s);
    return p;
  }

  function deletePayment(pid) {
    const s = load();
    s.payments = s.payments.filter(x => x.id !== pid);
    save(s);
  }

  /**
   * Income report for period (inclusive dates YYYY-MM-DD)
   * net = gross - external_tests expenses - other opex - salaries (optional month)
   */
  function computeIncomeReport(fromDate, toDate) {
    const s = load();
    const inRange = (d) => {
      if (!d) return false;
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    };

    const gross = s.payments.filter(p => inRange(p.date)).reduce((a, p) => a + (Number(p.amount) || 0), 0);
    const expenses = s.expenses.filter(e => inRange(e.date));
    const external = expenses.filter(e => e.category === 'external_tests').reduce((a, e) => a + Number(e.amount), 0);
    const opex = expenses.filter(e => e.category !== 'external_tests').reduce((a, e) => a + Number(e.amount), 0);
    const salaries = s.employees.filter(e => e.active !== false).reduce((a, e) => a + Number(e.salary || 0), 0);

    // salaries only fully counted if range spans a full month heuristic: always show as "monthly payroll reference"
    const netBeforeSalary = gross - external - opex;
    const labPct = Number(s.settings.labSharePct) || 50;
    const ceoPct = Number(s.settings.ceoSharePct) || 50;
    const net = netBeforeSalary; // operations net before allocating optional salary deduction shown separately

    return {
      from: fromDate || '—',
      to: toDate || '—',
      gross,
      external,
      opex,
      salariesMonthlyRef: salaries,
      net,
      labPct,
      ceoPct,
      labShare: net * labPct / 100,
      ceoShare: net * ceoPct / 100,
      expenseRows: expenses,
      paymentRows: s.payments.filter(p => inRange(p.date))
    };
  }

  function updateSettings(partial) {
    const s = load();
    Object.assign(s.settings, partial || {});
    // normalize 50/50 if needed
    if (partial && partial.labSharePct != null && partial.ceoSharePct == null) {
      s.settings.ceoSharePct = 100 - Number(partial.labSharePct);
    }
    save(s);
    return s.settings;
  }

  function seedDemo() {
    const s = load();
    if (!s.employees.length) {
      s.employees = [
        { id: id('EMP-'), name: 'فني معامل 1', role: 'Technician', salary: 5000, active: true, createdAt: new Date().toISOString() },
        { id: id('EMP-'), name: 'استقبال', role: 'Reception', salary: 4000, active: true, createdAt: new Date().toISOString() }
      ];
    }
    if (!s.inventory.length) {
      s.inventory = [
        { id: id('INV-'), name: 'EDTA Tubes', sku: 'T-EDTA', unit: 'box', qty: 12, minQty: 5, cost: 180, expiresOn: '', createdAt: new Date().toISOString() },
        { id: id('INV-'), name: 'Glucose Reagent', sku: 'R-GLU', unit: 'kit', qty: 2, minQty: 3, cost: 900, expiresOn: '2026-12-01', createdAt: new Date().toISOString() }
      ];
    }
    if (!s.payments.length) {
      const d = new Date().toISOString().slice(0, 10);
      s.payments = [
        { id: id('PAY-'), date: d, orderId: 'RT-DEMO-1', patientName: 'أحمد', amount: 400, method: 'cash', note: '', createdAt: new Date().toISOString() },
        { id: id('PAY-'), date: d, orderId: 'RT-DEMO-2', patientName: 'مريم', amount: 250, method: 'visa', note: '', createdAt: new Date().toISOString() }
      ];
    }
    if (!s.expenses.length) {
      const d = new Date().toISOString().slice(0, 10);
      s.expenses = [
        { id: id('EXP-'), date: d, category: 'rent', amount: 8000, note: 'إيجار شهري', createdAt: new Date().toISOString() },
        { id: id('EXP-'), date: d, category: 'external_tests', amount: 350, note: 'تحاليل محوّلة', createdAt: new Date().toISOString() }
      ];
    }
    save(s);
    return s;
  }

  global.RTAdmin = {
    EXPENSE_CATS,
    load,
    save,
    addExpense,
    deleteExpense,
    addInventoryItem,
    adjustStock,
    deleteInventory,
    lowStock,
    addEmployee,
    updateSalary,
    setEmployeeActive,
    deleteEmployee,
    upsertAttendance,
    deleteAttendance,
    addPayment,
    deletePayment,
    computeIncomeReport,
    updateSettings,
    seedDemo
  };
})(typeof window !== 'undefined' ? window : globalThis);
