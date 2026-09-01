/**
 * RT LAB V2 — Result Engine (M2)
 * Pure logic: templates → references → flags → result lines (versioned)
 * Works offline (local catalog) or with Supabase tables from M1 schema.
 */
(function (global) {
  'use strict';

  const FLAG = {
    N: 'N', L: 'L', H: 'H', LL: 'LL', HH: 'HH',
    POS: 'POS', NEG: 'NEG', EQ: 'EQ', NA: 'NA'
  };

  /** Built-in catalog aligned with M1 seed (used if cloud empty) */
  const DEFAULT_DEFINITIONS = [
    { code: 'CBC', name_en: 'Complete Blood Count', name_ar: 'صورة الدم الكاملة', category: 'Hematology', test_type: 'profile', price: 150, sort_order: 10 },
    { code: 'LIPID', name_en: 'Lipid Profile', name_ar: 'دهون الدم', category: 'Chemistry', test_type: 'profile', price: 200, sort_order: 20 },
    { code: 'LFT', name_en: 'Liver Function Tests', name_ar: 'وظائف كبد', category: 'Chemistry', test_type: 'profile', price: 250, sort_order: 30 },
    { code: 'KFT', name_en: 'Kidney Function Tests', name_ar: 'وظائف كلى', category: 'Chemistry', test_type: 'profile', price: 250, sort_order: 40 },
    { code: 'URINE', name_en: 'Complete Urinalysis', name_ar: 'تحليل بول كامل', category: 'Urinalysis', test_type: 'profile', price: 80, sort_order: 50 },
    { code: 'Hb', name_en: 'Hemoglobin', name_ar: 'هيموجلوبين', category: 'Hematology', test_type: 'single', price: 60, unit: 'g/dL', sort_order: 11 },
    { code: 'GLU', name_en: 'Glucose Fasting', name_ar: 'سكر صائم', category: 'Chemistry', test_type: 'single', price: 50, unit: 'mg/dL', sort_order: 60 }
  ];

  const DEFAULT_PARAMETERS = {
    CBC: [
      { param_code: 'Hb', name_en: 'Hemoglobin', unit: 'g/dL', sort_order: 10 },
      { param_code: 'HCT', name_en: 'Hematocrit', unit: '%', sort_order: 20 },
      { param_code: 'RBC', name_en: 'RBC', unit: '10^6/µL', sort_order: 30 },
      { param_code: 'MCV', name_en: 'MCV', unit: 'fL', sort_order: 40, is_calculated: true },
      { param_code: 'MCH', name_en: 'MCH', unit: 'pg', sort_order: 50, is_calculated: true },
      { param_code: 'MCHC', name_en: 'MCHC', unit: 'g/dL', sort_order: 60, is_calculated: true },
      { param_code: 'RDW', name_en: 'RDW', unit: '%', sort_order: 70 },
      { param_code: 'WBC', name_en: 'WBC', unit: '10^3/µL', sort_order: 80 },
      { param_code: 'NEUT', name_en: 'Neutrophils', unit: '%', sort_order: 90 },
      { param_code: 'LYMPH', name_en: 'Lymphocytes', unit: '%', sort_order: 100 },
      { param_code: 'MONO', name_en: 'Monocytes', unit: '%', sort_order: 110 },
      { param_code: 'EOS', name_en: 'Eosinophils', unit: '%', sort_order: 120 },
      { param_code: 'BASO', name_en: 'Basophils', unit: '%', sort_order: 130 },
      { param_code: 'PLT', name_en: 'Platelets', unit: '10^3/µL', sort_order: 140 }
    ],
    LIPID: [
      { param_code: 'CHOL', name_en: 'Total Cholesterol', unit: 'mg/dL', sort_order: 10 },
      { param_code: 'TG', name_en: 'Triglycerides', unit: 'mg/dL', sort_order: 20 },
      { param_code: 'HDL', name_en: 'HDL', unit: 'mg/dL', sort_order: 30 },
      { param_code: 'LDL', name_en: 'LDL', unit: 'mg/dL', sort_order: 40, is_calculated: true },
      { param_code: 'VLDL', name_en: 'VLDL', unit: 'mg/dL', sort_order: 50, is_calculated: true },
      { param_code: 'RATIO', name_en: 'Chol/HDL Ratio', unit: 'ratio', sort_order: 60, is_calculated: true }
    ],
    LFT: [
      { param_code: 'ALT', name_en: 'ALT (SGPT)', unit: 'U/L', sort_order: 10 },
      { param_code: 'AST', name_en: 'AST (SGOT)', unit: 'U/L', sort_order: 20 },
      { param_code: 'ALP', name_en: 'Alkaline Phosphatase', unit: 'U/L', sort_order: 30 },
      { param_code: 'TBIL', name_en: 'Total Bilirubin', unit: 'mg/dL', sort_order: 40 },
      { param_code: 'DBIL', name_en: 'Direct Bilirubin', unit: 'mg/dL', sort_order: 50 },
      { param_code: 'ALB', name_en: 'Albumin', unit: 'g/dL', sort_order: 60 },
      { param_code: 'TP', name_en: 'Total Protein', unit: 'g/dL', sort_order: 70 }
    ],
    KFT: [
      { param_code: 'UREA', name_en: 'Urea', unit: 'mg/dL', sort_order: 10 },
      { param_code: 'CREA', name_en: 'Creatinine', unit: 'mg/dL', sort_order: 20 },
      { param_code: 'UA', name_en: 'Uric Acid', unit: 'mg/dL', sort_order: 30 },
      { param_code: 'EGFR', name_en: 'eGFR', unit: 'mL/min/1.73m²', sort_order: 40, is_calculated: true }
    ],
    URINE: [
      { param_code: 'COLOR', name_en: 'Color', unit: '', sort_order: 10 },
      { param_code: 'APPEAR', name_en: 'Appearance', unit: '', sort_order: 20 },
      { param_code: 'SG', name_en: 'Specific Gravity', unit: '', sort_order: 30 },
      { param_code: 'PH', name_en: 'pH', unit: '', sort_order: 40 },
      { param_code: 'PROTEIN', name_en: 'Protein', unit: '', sort_order: 50 },
      { param_code: 'GLUCOSE', name_en: 'Glucose', unit: '', sort_order: 60 },
      { param_code: 'KETONE', name_en: 'Ketone', unit: '', sort_order: 70 },
      { param_code: 'BLOOD', name_en: 'Blood', unit: '', sort_order: 80 },
      { param_code: 'RBC_M', name_en: 'RBCs (/HPF)', unit: '/HPF', sort_order: 90 },
      { param_code: 'WBC_M', name_en: 'WBCs (/HPF)', unit: '/HPF', sort_order: 100 }
    ]
  };

  /** reference_ranges rows (M1 shape) */
  const DEFAULT_RANGES = [
    { param_code: 'Hb', profile_code: 'CBC', sex: 'Male', min_value: 13.5, max_value: 17.5, ref_text: 'Male: 13.5 – 17.5', critical_low: 7, critical_high: 20, unit: 'g/dL', priority: 10 },
    { param_code: 'Hb', profile_code: 'CBC', sex: 'Female', min_value: 12.0, max_value: 15.5, ref_text: 'Female: 12.0 – 15.5', critical_low: 7, critical_high: 20, unit: 'g/dL', priority: 10 },
    { param_code: 'HCT', profile_code: 'CBC', sex: 'Male', min_value: 41, max_value: 50, ref_text: 'Male: 41 – 50', unit: '%', priority: 20 },
    { param_code: 'HCT', profile_code: 'CBC', sex: 'Female', min_value: 36, max_value: 46, ref_text: 'Female: 36 – 46', unit: '%', priority: 20 },
    { param_code: 'RBC', profile_code: 'CBC', sex: 'Male', min_value: 4.5, max_value: 5.9, ref_text: 'Male: 4.5 – 5.9', unit: '10^6/µL', priority: 30 },
    { param_code: 'RBC', profile_code: 'CBC', sex: 'Female', min_value: 4.1, max_value: 5.1, ref_text: 'Female: 4.1 – 5.1', unit: '10^6/µL', priority: 30 },
    { param_code: 'MCV', profile_code: 'CBC', sex: 'Any', min_value: 80, max_value: 100, ref_text: '80 – 100', unit: 'fL', priority: 40 },
    { param_code: 'MCH', profile_code: 'CBC', sex: 'Any', min_value: 27, max_value: 33, ref_text: '27 – 33', unit: 'pg', priority: 50 },
    { param_code: 'MCHC', profile_code: 'CBC', sex: 'Any', min_value: 32, max_value: 36, ref_text: '32 – 36', unit: 'g/dL', priority: 60 },
    { param_code: 'WBC', profile_code: 'CBC', sex: 'Any', min_value: 4.0, max_value: 11.0, ref_text: '4.0 – 11.0', critical_low: 2, critical_high: 30, unit: '10^3/µL', priority: 80 },
    { param_code: 'PLT', profile_code: 'CBC', sex: 'Any', min_value: 150, max_value: 450, ref_text: '150 – 450', critical_low: 50, critical_high: 1000, unit: '10^3/µL', priority: 140 },
    { param_code: 'NEUT', profile_code: 'CBC', sex: 'Any', min_value: 40, max_value: 75, ref_text: '40 – 75', unit: '%', priority: 90 },
    { param_code: 'LYMPH', profile_code: 'CBC', sex: 'Any', min_value: 20, max_value: 45, ref_text: '20 – 45', unit: '%', priority: 100 },
    { param_code: 'CHOL', profile_code: 'LIPID', sex: 'Any', max_value: 200, ref_text: 'Desirable < 200', unit: 'mg/dL', priority: 10 },
    { param_code: 'TG', profile_code: 'LIPID', sex: 'Any', max_value: 150, ref_text: 'Desirable < 150', unit: 'mg/dL', priority: 20 },
    { param_code: 'HDL', profile_code: 'LIPID', sex: 'Any', min_value: 40, ref_text: '≥ 40', unit: 'mg/dL', priority: 30 },
    { param_code: 'LDL', profile_code: 'LIPID', sex: 'Any', max_value: 100, ref_text: 'Optimal < 100', unit: 'mg/dL', priority: 40 },
    { param_code: 'ALT', profile_code: 'LFT', sex: 'Any', max_value: 41, ref_text: '< 41', unit: 'U/L', priority: 10 },
    { param_code: 'AST', profile_code: 'LFT', sex: 'Any', max_value: 40, ref_text: '< 40', unit: 'U/L', priority: 20 },
    { param_code: 'CREA', profile_code: 'KFT', sex: 'Male', min_value: 0.7, max_value: 1.3, ref_text: 'Male: 0.7 – 1.3', unit: 'mg/dL', priority: 20 },
    { param_code: 'CREA', profile_code: 'KFT', sex: 'Female', min_value: 0.6, max_value: 1.1, ref_text: 'Female: 0.6 – 1.1', unit: 'mg/dL', priority: 20 },
    { param_code: 'GLU', profile_code: null, sex: 'Any', min_value: 70, max_value: 99, ref_text: '70 – 99 (fasting)', critical_low: 40, critical_high: 400, unit: 'mg/dL', priority: 10 },
    { param_code: 'Hb', profile_code: null, sex: 'Male', min_value: 13.5, max_value: 17.5, ref_text: 'Male: 13.5 – 17.5', critical_low: 7, critical_high: 20, unit: 'g/dL', priority: 10 },
    { param_code: 'Hb', profile_code: null, sex: 'Female', min_value: 12.0, max_value: 15.5, ref_text: 'Female: 12.0 – 15.5', critical_low: 7, critical_high: 20, unit: 'g/dL', priority: 10 }
  ];

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function normalizeSex(sex) {
    const s = String(sex || '').toLowerCase();
    if (!s || s === '—' || s === 'unknown') return 'Any';
    if (s.startsWith('f') || s.includes('أنث') || s.includes('انث')) return 'Female';
    if (s.startsWith('m') || s.includes('ذكر')) return 'Male';
    return 'Any';
  }

  function parseAgeYears(ageText) {
    if (ageText == null || ageText === '') return null;
    const m = String(ageText).match(/(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const v = Number(m[1]);
    if (/شهر|month/i.test(String(ageText))) return v / 12;
    if (/يوم|day/i.test(String(ageText))) return v / 365;
    return v;
  }

  /**
   * Pick best reference row for param + patient context
   */
  function selectReference(ranges, paramCode, profileCode, sex, ageYears) {
    const sx = normalizeSex(sex);
    const list = (ranges || []).filter(r => r.param_code === paramCode && r.active !== false);
    if (!list.length) return null;

    const scored = list.map(r => {
      let score = 0;
      if (profileCode && r.profile_code === profileCode) score += 50;
      if (!r.profile_code) score += 5;
      if (r.sex === sx) score += 40;
      else if (r.sex === 'Any' || !r.sex) score += 10;
      else score -= 100;
      if (ageYears != null) {
        const amin = r.age_min_years != null ? Number(r.age_min_years) : null;
        const amax = r.age_max_years != null ? Number(r.age_max_years) : null;
        if (amin != null && ageYears < amin) score -= 50;
        if (amax != null && ageYears > amax) score -= 50;
        if (amin != null || amax != null) score += 15;
      }
      score += (1000 - (r.priority || 100));
      return { r, score };
    }).filter(x => x.score > -50);

    scored.sort((a, b) => b.score - a.score);
    return scored.length ? scored[0].r : list[0];
  }

  /**
   * Compute flag from numeric/text value + reference
   */
  function computeFlag(value, ref) {
    if (value === null || value === undefined || value === '') return FLAG.NA;
    const text = String(value).trim();
    const lower = text.toLowerCase();
    if (['positive', 'pos', '+', 'موجب'].includes(lower)) return FLAG.POS;
    if (['negative', 'neg', '-', 'سالب'].includes(lower)) return FLAG.NEG;
    if (['equivocal', 'borderline'].includes(lower)) return FLAG.EQ;

    const n = num(text);
    if (n == null || !ref) return FLAG.NA;

    const clo = ref.critical_low != null ? Number(ref.critical_low) : null;
    const chi = ref.critical_high != null ? Number(ref.critical_high) : null;
    const mn = ref.min_value != null ? Number(ref.min_value) : null;
    const mx = ref.max_value != null ? Number(ref.max_value) : null;

    if (clo != null && n < clo) return FLAG.LL;
    if (chi != null && n > chi) return FLAG.HH;
    if (mn != null && n < mn) return FLAG.L;
    if (mx != null && n > mx) return FLAG.H;
    // HDL-style: only min means higher is better already handled; only max means lower better
    return FLAG.N;
  }

  function flagClass(flag) {
    if (flag === 'LL' || flag === 'HH') return 'flag-crit';
    if (flag === 'L' || flag === 'H') return 'flag-abn';
    if (flag === 'POS') return 'flag-pos';
    if (flag === 'N') return 'flag-ok';
    return 'flag-na';
  }

  /** CBC indices */
  function calcCBC(values) {
    const hb = num(values.Hb);
    const rbc = num(values.RBC);
    const hct = num(values.HCT);
    const out = { ...values };
    if (hct != null && rbc != null && rbc !== 0) out.MCV = (hct * 10 / rbc).toFixed(1);
    if (hb != null && rbc != null && rbc !== 0) out.MCH = (hb * 10 / rbc).toFixed(1);
    if (hb != null && hct != null && hct !== 0) out.MCHC = (hb * 100 / hct).toFixed(1);
    return out;
  }

  /** Lipid derived */
  function calcLipid(values) {
    const chol = num(values.CHOL);
    const tg = num(values.TG);
    const hdl = num(values.HDL);
    const out = { ...values };
    if (tg != null) out.VLDL = (tg / 5).toFixed(1);
    if (chol != null && hdl != null && tg != null) {
      // Friedewald if TG < 400
      if (tg < 400) out.LDL = (chol - hdl - tg / 5).toFixed(1);
    }
    if (chol != null && hdl != null && hdl !== 0) out.RATIO = (chol / hdl).toFixed(2);
    return out;
  }

  function applyCalculations(testCode, values) {
    if (testCode === 'CBC') return calcCBC(values);
    if (testCode === 'LIPID') return calcLipid(values);
    return { ...values };
  }

  /**
   * Build evaluated lines for one test/profile
   */
  function evaluateTest(opts) {
    const {
      testCode,
      values = {},
      sex,
      ageText,
      definitions = DEFAULT_DEFINITIONS,
      parameters = DEFAULT_PARAMETERS,
      ranges = DEFAULT_RANGES,
      version = 1,
      enteredBy = null
    } = opts;

    const def = definitions.find(d => d.code === testCode) || { code: testCode, test_type: 'single', name_en: testCode };
    const ageYears = parseAgeYears(ageText);
    let params;
    if (def.test_type === 'profile' || parameters[testCode]) {
      params = (parameters[testCode] || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    } else {
      params = [{
        param_code: testCode,
        name_en: def.name_en || testCode,
        unit: def.unit || '',
        sort_order: 10
      }];
    }

    const computed = applyCalculations(testCode, values);
    const lines = params.map(p => {
      const raw = computed[p.param_code];
      const ref = selectReference(ranges, p.param_code, testCode, sex, ageYears);
      const flag = computeFlag(raw, ref);
      return {
        test_code: testCode,
        param_code: p.param_code,
        name_en: p.name_en,
        value_text: raw == null || raw === '' ? '' : String(raw),
        value_num: num(raw),
        unit: (ref && ref.unit) || p.unit || def.unit || '',
        ref_text: (ref && ref.ref_text) || '',
        flag,
        flag_class: flagClass(flag),
        version,
        is_current: true,
        entered_by: enteredBy,
        entered_at: new Date().toISOString(),
        is_calculated: !!p.is_calculated
      };
    });

    return {
      test_code: testCode,
      definition: def,
      lines,
      has_critical: lines.some(l => l.flag === 'LL' || l.flag === 'HH'),
      has_abnormal: lines.some(l => ['L', 'H', 'LL', 'HH', 'POS'].includes(l.flag))
    };
  }

  function evaluateOrder(opts) {
    const { testCodes = [], valuesByTest = {}, ...rest } = opts;
    return testCodes.map(code => evaluateTest({
      testCode: code,
      values: valuesByTest[code] || {},
      ...rest
    }));
  }

  /**
   * Level-2 short lab comments (not diagnosis)
   */
  function buildLabComments(evaluatedList) {
    const notes = [];
    evaluatedList.forEach(block => {
      block.lines.forEach(l => {
        if (l.flag === 'LL') notes.push(l.param_code + ': critical low (' + l.value_text + ' ' + l.unit + ')');
        else if (l.flag === 'HH') notes.push(l.param_code + ': critical high (' + l.value_text + ' ' + l.unit + ')');
        else if (l.flag === 'L') notes.push(l.param_code + ': below reference');
        else if (l.flag === 'H') notes.push(l.param_code + ': above reference');
      });
    });
    if (!notes.length) return 'All entered parameters are within the selected laboratory reference ranges.';
    return 'Out-of-range findings: ' + notes.join('; ') + '. Clinical correlation is advised.';
  }

  /** Render HTML table fragment (LTR medical style) */
  function renderBlockTable(block) {
    const rows = block.lines.map(l => {
      const bold = (l.flag !== 'N' && l.flag !== 'NA') ? 'font-weight:800;' : '';
      return `<tr>
        <td style="text-align:left">${l.name_en || l.param_code}</td>
        <td style="text-align:center;${bold}">${l.value_text || '—'} <span class="${l.flag_class}">${l.flag}</span></td>
        <td style="text-align:center">${l.unit || ''}</td>
        <td style="text-align:left">${l.ref_text || ''}</td>
      </tr>`;
    }).join('');
    return `<div class="re-block" data-test="${block.test_code}">
      <h3 class="re-title">${block.definition.name_en || block.test_code}</h3>
      <table class="re-table">
        <thead><tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Reference</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function getDefaultCatalog() {
    return {
      definitions: DEFAULT_DEFINITIONS.slice(),
      parameters: JSON.parse(JSON.stringify(DEFAULT_PARAMETERS)),
      ranges: DEFAULT_RANGES.slice()
    };
  }

  const api = {
    FLAG,
    getDefaultCatalog,
    normalizeSex,
    parseAgeYears,
    selectReference,
    computeFlag,
    flagClass,
    applyCalculations,
    evaluateTest,
    evaluateOrder,
    buildLabComments,
    renderBlockTable,
    calcCBC,
    calcLipid
  };

  global.RTResultEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
