/**
 * RT LAB V2 — M5 Patient Portal / Report Verify
 * Public access only via secure token (never bare order id).
 */
(function (global) {
  'use strict';

  const RELEASE_KEY = 'rt_v2_released_reports';

  function loadReleased() {
    try {
      return JSON.parse(localStorage.getItem(RELEASE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveReleased(map) {
    localStorage.setItem(RELEASE_KEY, JSON.stringify(map));
  }

  /**
   * Store a released report snapshot for portal lookup
   */
  function releaseReport(model, html) {
    if (!model || !model.meta || !model.meta.secureToken) {
      throw new Error('Report model requires meta.secureToken');
    }
    const token = model.meta.secureToken;
    const map = loadReleased();
    map[token] = {
      token,
      reportId: model.meta.reportId,
      orderId: model.order && model.order.id,
      status: model.meta.status || 'RELEASED',
      mode: model.meta.mode,
      patientName: model.patient && model.patient.name,
      age: model.patient && model.patient.age,
      sex: model.patient && model.patient.sex,
      releasedAt: new Date().toISOString(),
      html: html || null,
      summary: model.summary || null,
      // minimal lines for verify-without-full-html
      blocks: (model.blocks || []).map(b => ({
        test_code: b.test_code,
        name: (b.definition && b.definition.name_en) || b.test_code,
        lines: (b.lines || []).map(l => ({
          param: l.param_code,
          name: l.name_en,
          value: l.value_text,
          unit: l.unit,
          ref: l.ref_text,
          flag: l.flag
        }))
      }))
    };
    saveReleased(map);
    return map[token];
  }

  function getByToken(token) {
    if (!token) return null;
    const map = loadReleased();
    return map[String(token).trim()] || null;
  }

  async function getByTokenCloud(supabase, token) {
    if (!supabase || !token) return null;
    const { data, error } = await supabase.rpc('get_report_by_token', {
      p_token: String(token).trim()
    });
    if (error) throw error;
    if (!data || !data.length) return null;
    const row = data[0];
    return {
      token,
      reportId: row.report_id,
      orderId: row.order_id,
      status: row.status,
      mode: row.mode,
      patientName: row.patient_name,
      age: row.age_text,
      sex: row.gender,
      releasedAt: row.released_at,
      html: row.html_snapshot,
      summary: row.summary_text,
      recommendations: row.recommendations,
      source: 'cloud'
    };
  }

  /**
   * Unified resolve: cloud first, then local
   */
  async function resolveToken(token, supabase) {
    const t = String(token || '').trim();
    if (!t) return { ok: false, error: 'أدخل رمز التحقق' };
    if (supabase) {
      try {
        const cloud = await getByTokenCloud(supabase, t);
        if (cloud) return { ok: true, report: cloud };
      } catch (e) {
        console.warn('cloud verify failed', e);
      }
    }
    const local = getByToken(t);
    if (local) return { ok: true, report: Object.assign({ source: 'local' }, local) };
    return { ok: false, error: 'لم يُعثر على تقرير بهذا الرمز — تأكد من Token أو أن التقرير تم إصداره' };
  }

  function parseTokenFromUrl() {
    try {
      const u = new URL(global.location.href);
      return u.searchParams.get('token') || u.searchParams.get('t') || '';
    } catch (e) {
      return '';
    }
  }

  function maskName(name) {
    const s = String(name || '').trim();
    if (s.length <= 2) return s;
    return s[0] + '***' + s[s.length - 1];
  }

  global.RTPortal = {
    releaseReport,
    getByToken,
    getByTokenCloud,
    resolveToken,
    parseTokenFromUrl,
    maskName,
    loadReleased
  };
})(typeof window !== 'undefined' ? window : globalThis);
