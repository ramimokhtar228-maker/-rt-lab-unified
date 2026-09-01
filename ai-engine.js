/**
 * RT LAB V2 — M6 AI Center (Post-analytical only)
 * Rules:
 *  - Never modifies result values
 *  - Runs only on evaluated lines (after entry / verification)
 *  - Output is suggestion until human Approves
 *  - States: PENDING_REVIEW | APPROVED | REJECTED
 *
 * This build uses a deterministic clinical-lab language engine
 * (no external LLM required). Hook `callExternalLLM` later if needed.
 */
(function (global) {
  'use strict';

  const STORE_KEY = 'rt_v2_ai_center';

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || '{"items":[]}');
    } catch (e) {
      return { items: [] };
    }
  }

  function saveStore(s) {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  }

  function uid() {
    return 'AI-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  /** Extract findings from Result Engine blocks — read-only */
  function extractFindings(blocks) {
    const findings = [];
    (blocks || []).forEach(b => {
      (b.lines || []).forEach(l => {
        if (!l || l.value_text === '' || l.value_text == null) return;
        if (['L', 'H', 'LL', 'HH', 'POS'].includes(l.flag)) {
          findings.push({
            test: b.test_code,
            param: l.param_code,
            name: l.name_en || l.param_code,
            value: l.value_text,
            unit: l.unit || '',
            flag: l.flag,
            ref: l.ref_text || ''
          });
        }
      });
    });
    return findings;
  }

  function severity(findings) {
    if (findings.some(f => f.flag === 'LL' || f.flag === 'HH')) return 'CRITICAL';
    if (findings.some(f => f.flag === 'L' || f.flag === 'H' || f.flag === 'POS')) return 'ABNORMAL';
    return 'NORMAL';
  }

  /**
   * Build AI suggestion text — laboratory language, not diagnosis
   */
  function generateSuggestion(opts) {
    const {
      blocks = [],
      patient = {},
      orderId = ''
    } = opts;

    const findings = extractFindings(blocks);
    const sev = severity(findings);
    const sex = patient.sex || patient.gender || '';
    const age = patient.ageText || patient.age || '';

    let summary = '';
    let interpretation = '';
    let recommendations = '';

    if (sev === 'NORMAL') {
      summary = 'All reported parameters included in this analysis fall within the selected laboratory reference ranges.';
      interpretation = 'No laboratory flags were generated for the submitted results. This does not exclude clinical disease; results must be interpreted in the clinical context.';
      recommendations = 'No specific laboratory follow-up is suggested based on these values alone. Correlate with clinical findings as needed.';
    } else {
      const list = findings.map(f =>
        f.name + ' ' + f.value + (f.unit ? ' ' + f.unit : '') + ' [' + f.flag + ']' + (f.ref ? ' (ref: ' + f.ref + ')' : '')
      );
      summary = 'Selected laboratory findings: ' + list.join('; ') + '.';

      const parts = [];
      findings.forEach(f => {
        if (f.flag === 'LL') {
          parts.push(f.name + ' is critically low relative to the laboratory reference and critical limits used for this report.');
        } else if (f.flag === 'HH') {
          parts.push(f.name + ' is critically high relative to the laboratory reference and critical limits used for this report.');
        } else if (f.flag === 'L') {
          parts.push(f.name + ' is below the laboratory reference range.');
        } else if (f.flag === 'H') {
          parts.push(f.name + ' is above the laboratory reference range.');
        } else if (f.flag === 'POS') {
          parts.push(f.name + ' is reported as positive.');
        }
      });

      // Pattern hints (still not diagnoses)
      const byParam = Object.fromEntries(findings.map(f => [f.param, f]));
      if (byParam.Hb && (byParam.Hb.flag === 'L' || byParam.Hb.flag === 'LL')) {
        if (byParam.MCV && byParam.MCV.flag === 'L') {
          parts.push('A low hemoglobin with low MCV pattern may be seen in microcytic processes; clinical and iron studies correlation may be considered by the treating physician.');
        } else if (byParam.MCV && byParam.MCV.flag === 'H') {
          parts.push('A low hemoglobin with high MCV pattern may be seen in macrocytic processes; clinical correlation is advised.');
        } else {
          parts.push('Low hemoglobin is a laboratory finding that may be associated with anemia; clinical correlation is required.');
        }
      }
      if (byParam.LDL && byParam.LDL.flag === 'H') {
        parts.push('LDL cholesterol is above the optimal laboratory cut-off used in this report.');
      }
      if (byParam.CHOL && byParam.CHOL.flag === 'H') {
        parts.push('Total cholesterol is above the desirable laboratory cut-off used in this report.');
      }
      if (byParam.ALT && byParam.ALT.flag === 'H') {
        parts.push('ALT is above the laboratory reference; clinical correlation with liver evaluation may be appropriate.');
      }
      if (byParam.CREA && (byParam.CREA.flag === 'H' || byParam.CREA.flag === 'HH')) {
        parts.push('Creatinine is elevated relative to the sex-specific reference applied; renal assessment is a clinical decision.');
      }

      interpretation = parts.join(' ');
      if (sev === 'CRITICAL') {
        recommendations = 'CRITICAL laboratory value(s) detected. Prompt notification of the treating physician is advised according to laboratory policy. Clinical correlation is required. This message is not a diagnosis.';
      } else {
        recommendations = 'Clinical correlation is advised. Discuss findings with the treating physician as clinically indicated. Repeat or additional testing may be considered at clinical discretion. This interpretation is laboratory decision-support only and is not a medical diagnosis.';
      }
    }

    const disclaimer =
      'AI / rule-based laboratory decision support only. Does not replace pathologist or clinician judgment. Does not modify primary result values. Patient: '
      + (patient.name || '—') + (age ? ' · ' + age : '') + (sex ? ' · ' + sex : '')
      + (orderId ? ' · Order ' + orderId : '') + '.';

    return {
      severity: sev,
      findings,
      summary,
      interpretation,
      recommendations,
      disclaimer,
      generatedAt: new Date().toISOString(),
      engine: 'RT-AI-Rules-v1'
    };
  }

  /**
   * Create pending AI job — never auto-approved
   */
  function createJob(opts) {
    const suggestion = generateSuggestion(opts);
    const job = {
      id: uid(),
      orderId: opts.orderId || '',
      patientName: (opts.patient && (opts.patient.name || opts.patient.full_name)) || '',
      status: 'PENDING_REVIEW',
      suggestion,
      // immutable snapshot of values used (reference only)
      valueFingerprint: fingerprintBlocks(opts.blocks),
      createdAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      rejectReason: null
    };
    const store = loadStore();
    store.items.unshift(job);
    store.items = store.items.slice(0, 50);
    saveStore(store);
    return job;
  }

  function fingerprintBlocks(blocks) {
    const parts = [];
    (blocks || []).forEach(b => {
      (b.lines || []).forEach(l => {
        parts.push(b.test_code + '.' + l.param_code + '=' + (l.value_text || '') + '/' + (l.flag || ''));
      });
    });
    return parts.join('|').slice(0, 2000);
  }

  function listJobs(filterStatus) {
    const items = loadStore().items || [];
    if (!filterStatus || filterStatus === 'ALL') return items;
    return items.filter(j => j.status === filterStatus);
  }

  function getJob(id) {
    return (loadStore().items || []).find(j => j.id === id) || null;
  }

  function approveJob(id, reviewer) {
    const store = loadStore();
    const job = store.items.find(j => j.id === id);
    if (!job) throw new Error('Job not found');
    if (job.status !== 'PENDING_REVIEW') throw new Error('Only pending jobs can be approved');
    job.status = 'APPROVED';
    job.reviewedAt = new Date().toISOString();
    job.reviewedBy = reviewer || 'Reviewer';
    saveStore(store);
    return job;
  }

  function rejectJob(id, reviewer, reason) {
    const store = loadStore();
    const job = store.items.find(j => j.id === id);
    if (!job) throw new Error('Job not found');
    if (job.status !== 'PENDING_REVIEW') throw new Error('Only pending jobs can be rejected');
    job.status = 'REJECTED';
    job.reviewedAt = new Date().toISOString();
    job.reviewedBy = reviewer || 'Reviewer';
    job.rejectReason = reason || '';
    saveStore(store);
    return job;
  }

  /**
   * Approved text only may feed Report Premium fields
   */
  function getApprovedTextsForOrder(orderId) {
    const jobs = listJobs('APPROVED').filter(j => j.orderId === orderId);
    if (!jobs.length) return null;
    const job = jobs[0];
    return {
      summary: job.suggestion.summary,
      interpretation: job.suggestion.interpretation,
      recommendations: job.suggestion.recommendations,
      jobId: job.id,
      reviewedBy: job.reviewedBy
    };
  }

  global.RTAIEngine = {
    generateSuggestion,
    extractFindings,
    createJob,
    listJobs,
    getJob,
    approveJob,
    rejectJob,
    getApprovedTextsForOrder,
    loadStore,
    saveStore
  };
})(typeof window !== 'undefined' ? window : globalThis);
