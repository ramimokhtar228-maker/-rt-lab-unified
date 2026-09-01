/**
 * Bridge: Production LIS ↔ RT LAB V2 engines
 * Does not replace core LIS; adds V2 report/AI/portal hooks when engines are loaded.
 */
(function () {
  'use strict';

  function orderToBlocks(order, patient) {
    if (!window.RTResultEngine || !order) return [];
    const sex = (patient && patient.gender) || order.patientGender || 'Any';
    const ageText = (patient && patient.age) || order.patientAge || '';
    const codes = (order.tests || []).map(t => t.code);
    const valuesByTest = {};

    codes.forEach(code => {
      const r = (order.results && order.results[code]) || {};
      if (code === 'CBC' && typeof r === 'object') {
        valuesByTest.CBC = {
          Hb: r.hb, HCT: r.hct, RBC: r.rbc, MCV: r.mcv, MCH: r.mch, MCHC: r.mchc,
          WBC: r.wbc, PLT: r.plt, NEUT: r.neut, LYMPH: r.lymph, MONO: r.mono, EOS: r.eos, BASO: r.baso
        };
      } else if (code === 'LIPID' && typeof r === 'object') {
        valuesByTest.LIPID = {
          CHOL: r.chol, TG: r.tg, HDL: r.hdl, LDL: r.ldl, VLDL: r.vldl, RATIO: r.ratio
        };
      } else if (r && r.result != null) {
        valuesByTest[code] = {};
        valuesByTest[code][code] = r.result;
      } else if (typeof r === 'object') {
        // generic map keys as-is uppercased
        const o = {};
        Object.keys(r).forEach(k => { o[k.toUpperCase()] = r[k]; o[k] = r[k]; });
        valuesByTest[code] = o;
      }
    });

    return RTResultEngine.evaluateOrder({
      testCodes: codes.length ? codes : Object.keys(order.results || {}),
      valuesByTest,
      sex,
      ageText
    });
  }

  function openV2ReportForOrder(orderNo, mode) {
    if (!window.RTReportEngine || !window.RTResultEngine) {
      return alert('محركات V2 غير محمّلة');
    }
    const order = (window.state && state.orders || []).find(o => o.orderNo === orderNo || o.id === orderNo);
    if (!order) return alert('الطلب غير موجود');
    const patient = (state.patients || []).find(p => p.id === order.patientId) || {};
    const blocks = orderToBlocks(order, patient);
    if (!blocks.length) return alert('لا نتائج لتوليد تقرير V2');

    const model = RTReportEngine.buildReportModel({
      patient: {
        name: order.patientName || patient.name || patient.full_name,
        sex: patient.gender || order.patientGender,
        ageText: patient.age || order.patientAge
      },
      order: { id: order.orderNo, doctor: order.doctor || state.reportDoctor || '' },
      sample: { collectedAt: order.drawDateTime || order.date || '' },
      blocks,
      mode: mode || 'professional',
      version: 1,
      status: order.status === 'Released' || order.status === 'RELEASED' ? 'RELEASED' : 'FINAL',
      branch: state.branch || 'RT LAB',
      labComment: order.interpretation || ''
    });

    // optional approved AI texts
    if (window.RTAIEngine) {
      const texts = RTAIEngine.getApprovedTextsForOrder(order.orderNo);
      if (texts) {
        model.summary = texts.summary;
        model.recommendations = texts.recommendations;
        if (mode === 'premium' || !mode) {
          /* keep */
        }
      }
    }

    RTReportEngine.openPrint(model, {
      verifyBaseUrl: new URL('v2/verify.html', location.href).href
    });
    return model;
  }

  function releaseOrderToPortal(orderNo) {
    if (!window.RTPortal || !window.RTReportEngine) return alert('Portal engine غير محمّل');
    const model = openV2ReportForOrder(orderNo, 'professional');
    if (!model) return;
    model.meta.status = 'RELEASED';
    const html = RTReportEngine.renderReportHtml(model, {
      verifyBaseUrl: new URL('v2/verify.html', location.href).href
    });
    const rec = RTPortal.releaseReport(model, html);
    alert('تم الإصدار للبوابة.\nToken:\n' + rec.token);
    return rec;
  }

  function createAIJobForOrder(orderNo) {
    if (!window.RTAIEngine || !window.RTResultEngine) return alert('AI engine غير محمّل');
    const order = (state.orders || []).find(o => o.orderNo === orderNo);
    if (!order) return alert('الطلب غير موجود');
    const patient = (state.patients || []).find(p => p.id === order.patientId) || {};
    const blocks = orderToBlocks(order, patient);
    const job = RTAIEngine.createJob({
      blocks,
      patient: { name: order.patientName, sex: patient.gender, ageText: patient.age },
      orderId: order.orderNo
    });
    alert('تم إنشاء اقتراح AI: ' + job.id + '\nالحالة: PENDING_REVIEW\nافتح v2/ai-center-v2.html للمراجعة');
    return job;
  }

  function injectReportsToolbar() {
    const page = document.getElementById('pageReports');
    if (!page || document.getElementById('rtV2ReportBtns')) return;
    const bar = document.createElement('div');
    bar.id = 'rtV2ReportBtns';
    bar.className = 'no-print';
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:10px 0;';
    bar.innerHTML = `
      <button type="button" class="btn btn-secondary" id="btnV2Std">تقرير V2 STANDARD</button>
      <button type="button" class="btn" style="background:#1a237e;color:#fff" id="btnV2Pro">تقرير V2 PROFESSIONAL</button>
      <button type="button" class="btn" style="background:#4a148c;color:#fff" id="btnV2Prem">تقرير V2 PREMIUM</button>
      <button type="button" class="btn" style="background:#0f766e;color:#fff" id="btnV2Portal">إصدار بوابة V2</button>
      <button type="button" class="btn" style="background:#6a1b9a;color:#fff" id="btnV2AI">AI اقتراح (مراجعة)</button>
      <a class="btn" style="background:#334155;color:#fff;text-decoration:none" href="v2/index.html" target="_blank">مركز V2</a>
    `;
    page.insertBefore(bar, page.firstChild);
    const current = () => state.activeReportOrderNo || (state.orders[0] && state.orders[0].orderNo);
    document.getElementById('btnV2Std').onclick = () => openV2ReportForOrder(current(), 'standard');
    document.getElementById('btnV2Pro').onclick = () => openV2ReportForOrder(current(), 'professional');
    document.getElementById('btnV2Prem').onclick = () => openV2ReportForOrder(current(), 'premium');
    document.getElementById('btnV2Portal').onclick = () => releaseOrderToPortal(current());
    document.getElementById('btnV2AI').onclick = () => createAIJobForOrder(current());
  }

  function injectSidebarLinks() {
    const menu = document.querySelector('.sidebar-menu');
    if (!menu || document.getElementById('liV2Admin')) return;
    const li = document.createElement('li');
    li.id = 'liV2Admin';
    li.setAttribute('data-roles', 'Admin,Lab Manager');
    li.innerHTML = '🛠 V2 إدارة / بوابة / AI';
    li.style.cursor = 'pointer';
    li.onclick = () => { window.open('v2/index.html', '_blank'); };
    menu.appendChild(li);
  }

  function enhanceGetFlag() {
    if (!window.RTResultEngine || window.__rtFlagPatched) return;
    window.__rtFlagPatched = true;
    const orig = window.getFlag;
    // keep original signature used everywhere; optional future: gender-aware via engine
    if (typeof orig === 'function') {
      window.getFlag = function (value, min, max) {
        return orig(value, min, max);
      };
    }
  }

  function boot() {
    injectSidebarLinks();
    injectReportsToolbar();
    enhanceGetFlag();
    console.info('[RT V2 Bridge] engines:', {
      result: !!window.RTResultEngine,
      report: !!window.RTReportEngine,
      portal: !!window.RTPortal,
      ai: !!window.RTAIEngine
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 500));
  } else {
    setTimeout(boot, 500);
  }

  window.RTV2Bridge = {
    orderToBlocks,
    openV2ReportForOrder,
    releaseOrderToPortal,
    createAIJobForOrder
  };
})();
