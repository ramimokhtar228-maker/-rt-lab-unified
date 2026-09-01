/**
 * RT LAB V2 — Report Engine (M3)
 * Builds medical report HTML from Result Engine output (data → report).
 * Modes: standard | professional | premium
 */
(function (global) {
  'use strict';

  const MODES = {
    standard: {
      id: 'standard',
      label: 'STANDARD',
      title: 'Laboratory Results',
      includeLabComments: false,
      includeSummary: false,
      includeRecommendations: false
    },
    professional: {
      id: 'professional',
      label: 'PROFESSIONAL',
      title: 'Laboratory Report with Comments',
      includeLabComments: true,
      includeSummary: false,
      includeRecommendations: false
    },
    premium: {
      id: 'premium',
      label: 'PREMIUM',
      title: 'Laboratory Report — Summary & Recommendations',
      includeLabComments: true,
      includeSummary: true,
      includeRecommendations: true
    }
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function makeToken() {
    const a = new Uint8Array(24);
    if (global.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }

  function categoryOrder(cat) {
    const map = {
      Hematology: 10,
      Chemistry: 20,
      Urinalysis: 30,
      Hormones: 40,
      Immunology: 50,
      Microbiology: 60,
      General: 90
    };
    return map[cat] || 80;
  }

  /**
   * Build structured report model (source of truth before HTML)
   */
  function buildReportModel(opts) {
    const {
      patient = {},
      order = {},
      sample = {},
      blocks = [],
      mode = 'standard',
      labComment = '',
      doctorName = 'Rehab Ali',
      specialistName = 'Rami Mokhtar',
      branch = 'Main Branch — Shubra El-Kheima',
      reportId = null,
      secureToken = null,
      version = 1,
      status = 'FINAL'
    } = opts;

    const modeCfg = MODES[mode] || MODES.standard;
    const token = secureToken || makeToken();
    const id = reportId || ('R-' + (order.id || 'X') + '-v' + version);

    const hasCritical = blocks.some(b => b.has_critical);
    const hasAbnormal = blocks.some(b => b.has_abnormal);

    let summary = opts.summaryText || '';
    if (!summary && modeCfg.includeSummary) {
      const findings = [];
      blocks.forEach(b => {
        (b.lines || []).forEach(l => {
          if (['L', 'H', 'LL', 'HH', 'POS'].includes(l.flag) && l.value_text) {
            findings.push(l.param_code + ' ' + l.value_text + (l.unit ? ' ' + l.unit : '') + ' (' + l.flag + ')');
          }
        });
      });
      summary = findings.length
        ? 'Selected laboratory findings: ' + findings.join('; ') + '.'
        : 'No out-of-range parameters among the reported tests.';
    }

    let recommendations = opts.recommendations || '';
    if (!recommendations && modeCfg.includeRecommendations) {
      recommendations = hasCritical
        ? 'Urgent clinical correlation is advised. Critical values should be communicated to the treating physician promptly.'
        : hasAbnormal
          ? 'Clinical correlation is advised. Discuss findings with the treating physician as clinically indicated.'
          : 'No specific laboratory follow-up suggested based on the reported values alone.';
    }

    const autoLab = labComment || (global.RTResultEngine
      ? RTResultEngine.buildLabComments(blocks)
      : '');

    return {
      meta: {
        reportId: id,
        secureToken: token,
        mode: modeCfg.id,
        modeLabel: modeCfg.label,
        title: modeCfg.title,
        status,
        version,
        generatedAt: new Date().toISOString(),
        branch
      },
      patient: {
        name: patient.name || patient.full_name || '—',
        sex: patient.sex || patient.gender || '—',
        age: patient.ageText || patient.age_text || patient.age || '—',
        phone: patient.phone || ''
      },
      order: {
        id: order.id || order.orderNo || '—',
        doctor: order.doctor || '—',
        priority: order.priority || 'Routine'
      },
      sample: {
        collectedAt: sample.collectedAt || sample.collected_at || order.drawAt || order.drawDateTime || '—',
        receivedAt: sample.receivedAt || sample.received_at || '—',
        type: sample.type || sample.sample_type || '—'
      },
      blocks: blocks.slice(),
      labComment: modeCfg.includeLabComments ? autoLab : '',
      summary: modeCfg.includeSummary ? summary : '',
      recommendations: modeCfg.includeRecommendations ? recommendations : '',
      signatures: {
        specialist: specialistName,
        pathologist: doctorName
      },
      flags: { hasCritical, hasAbnormal }
    };
  }

  function blockTableHtml(block) {
    const rows = (block.lines || []).map(l => {
      const emphasize = l.flag && l.flag !== 'N' && l.flag !== 'NA';
      return `<tr>
        <td class="c-param">${esc(l.name_en || l.param_code)}</td>
        <td class="c-result${emphasize ? ' emph' : ''}">${esc(l.value_text || '—')}${l.flag && l.flag !== 'NA' ? ' <span class="flg flg-' + esc(l.flag) + '">' + esc(l.flag) + '</span>' : ''}</td>
        <td class="c-unit">${esc(l.unit || '')}</td>
        <td class="c-ref">${esc(l.ref_text || '')}</td>
      </tr>`;
    }).join('');
    const title = (block.definition && (block.definition.name_en || block.definition.code)) || block.test_code;
    return `<section class="rep-block">
      <div class="rep-profile">${esc(title)}</div>
      <table class="rep-table">
        <thead>
          <tr>
            <th class="c-param">Parameter</th>
            <th class="c-result">Result</th>
            <th class="c-unit">Unit</th>
            <th class="c-ref">Reference Range</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
  }

  function css() {
    return `
      :root { --maroon:#800000; --navy:#1a237e; }
      * { box-sizing:border-box; }
      body.rep-body { margin:0; font-family: Arial, 'Segoe UI', Tahoma, sans-serif; color:#000; background:#e8e8e8; }
      .rep-page {
        width: 210mm; min-height: 297mm; margin: 12px auto; background:#fff;
        padding: 16mm 14mm; box-shadow: 0 2px 12px rgba(0,0,0,.12);
        page-break-after: always;
      }
      .rep-page:last-child { page-break-after: auto; }
      .rep-header { text-align:center; border-bottom: 3px solid var(--maroon); padding-bottom: 8px; margin-bottom: 12px; }
      .rep-header h1 { margin:0; color:var(--maroon); font-size:20px; letter-spacing:.3px; }
      .rep-header .slogan { color:var(--navy); font-size:12px; font-weight:700; margin-top:2px; }
      .rep-header .meta-line { font-size:10px; color:#444; margin-top:4px; }
      .rep-badge {
        display:inline-block; margin-top:6px; padding:3px 10px; border-radius:3px;
        font-size:11px; font-weight:800; background:#fce7f3; color:var(--maroon);
      }
      .rep-patient {
        display:grid; grid-template-columns: 1.3fr 1fr 1fr; gap:6px 12px;
        border:1px solid var(--maroon); padding:10px 12px; margin-bottom:12px;
        font-size:12.5px; background:#fafafa; border-radius:4px;
      }
      .rep-patient .name { grid-column:1/-1; font-weight:900; font-size:15px; border-bottom:1px solid #ccc; padding-bottom:4px; }
      .rep-profile {
        background:var(--maroon); color:#fff; text-align:center; padding:7px;
        font-size:14px; font-weight:700; margin:14px 0 8px; border-radius:3px;
      }
      .rep-table { width:100%; border-collapse:collapse; font-size:12.5px; direction:ltr; }
      .rep-table th { background:var(--maroon); color:#fff; padding:6px 8px; border:1px solid var(--maroon); }
      .rep-table td { padding:5px 8px; border:1px solid #ddd; }
      .rep-table tr:nth-child(even) { background:#f9f9f9; }
      .c-param { text-align:left; width:38%; font-weight:600; }
      .c-result { text-align:center; width:22%; font-weight:800; }
      .c-result.emph { color:#000; }
      .c-unit { text-align:center; width:14%; }
      .c-ref { text-align:left; width:26%; font-size:11.5px; }
      .flg { font-size:10px; margin-left:4px; }
      .flg-L, .flg-H { color:#ef6c00; }
      .flg-LL, .flg-HH { color:#c62828; font-weight:900; }
      .flg-N { color:#2e7d32; }
      .rep-box { border:1px solid var(--maroon); margin-top:12px; }
      .rep-box-title { background:var(--maroon); color:#fff; padding:5px 10px; font-size:11px; font-weight:700; }
      .rep-box-body { padding:8px 10px; font-size:12.5px; line-height:1.55; white-space:pre-wrap; }
      .rep-box.navy .rep-box-title { background:var(--navy); }
      .rep-box.navy { border-color:var(--navy); }
      .rep-sigs {
        display:flex; justify-content:space-between; margin-top:28px; padding-top:12px;
        border-top:1px solid #ccc; font-size:12px; text-align:center;
      }
      .rep-sigs .nm { font-weight:900; margin-top:4px; }
      .rep-foot {
        margin-top:16px; text-align:center; font-size:9px; color:#666;
        border-top:1px dashed #ccc; padding-top:8px;
      }
      .rep-qr-row { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:14px; font-size:11px; }
      .rep-qr-row img { width:88px; height:88px; border:1px solid #ddd; }
      .crit-banner {
        background:#ffebee; color:#b71c1c; border:1px solid #ef9a9a;
        padding:6px 10px; font-size:12px; font-weight:700; margin-bottom:10px; border-radius:4px;
      }
      @media print {
        body.rep-body { background:#fff; }
        .rep-page { box-shadow:none; margin:0; width:auto; min-height:auto; padding:12mm; }
        .no-print { display:none !important; }
      }
    `;
  }

  /**
   * Full printable HTML document
   */
  function renderReportHtml(model, opts) {
    opts = opts || {};
    const verifyBase = opts.verifyBaseUrl || '';
    const verifyUrl = verifyBase
      ? (verifyBase.replace(/\/$/, '') + '?token=' + encodeURIComponent(model.meta.secureToken))
      : ('rtlab://verify/' + model.meta.secureToken);

    // QR via public chart API (no dependency); token embedded
    const qrSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + encodeURIComponent(verifyUrl);

    const blocksHtml = (model.blocks || []).map(blockTableHtml).join('');

    const labBox = model.labComment
      ? `<div class="rep-box"><div class="rep-box-title">Laboratory Comment</div><div class="rep-box-body">${esc(model.labComment)}</div></div>`
      : '';
    const sumBox = model.summary
      ? `<div class="rep-box navy"><div class="rep-box-title">Laboratory Summary</div><div class="rep-box-body">${esc(model.summary)}</div></div>`
      : '';
    const recBox = model.recommendations
      ? `<div class="rep-box navy"><div class="rep-box-title">Recommendations</div><div class="rep-box-body">${esc(model.recommendations)}</div></div>`
      : '';

    const crit = model.flags && model.flags.hasCritical
      ? `<div class="crit-banner">CRITICAL VALUE(S) REPORTED — Immediate clinical attention may be required.</div>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>RT LAB Report — ${esc(model.meta.reportId)}</title>
<style>${css()}</style>
</head>
<body class="rep-body">
  <article class="rep-page">
    <header class="rep-header">
      <h1>RT LAB Clinical Laboratories</h1>
      <div class="slogan">Laboratory Medical Report</div>
      <div class="meta-line">${esc(model.meta.branch)}</div>
      <div class="rep-badge">${esc(model.meta.modeLabel)} · ${esc(model.meta.status)} · v${esc(model.meta.version)}</div>
    </header>

    ${crit}

    <div class="rep-patient">
      <div class="name">${esc(model.patient.name)}</div>
      <div><b>Age / السن:</b> ${esc(model.patient.age)}</div>
      <div><b>Sex / الجنس:</b> ${esc(model.patient.sex)}</div>
      <div><b>Order:</b> ${esc(model.order.id)}</div>
      <div><b>Sample collection:</b> ${esc(model.sample.collectedAt)}</div>
      <div><b>Doctor:</b> ${esc(model.order.doctor)}</div>
      <div><b>Report ID:</b> ${esc(model.meta.reportId)}</div>
      <div><b>Generated:</b> ${esc(new Date(model.meta.generatedAt).toLocaleString())}</div>
      <div><b>Priority:</b> ${esc(model.order.priority)}</div>
    </div>

    ${blocksHtml}

    ${labBox}
    ${sumBox}
    ${recBox}

    <div class="rep-qr-row">
      <div>
        <div><b>Scan to verify report</b></div>
        <div>Token: ${esc(model.meta.secureToken.slice(0, 12))}…</div>
        <div style="color:#666;margin-top:4px;">This document is generated from laboratory data. Not a clinical diagnosis.</div>
      </div>
      <img src="${qrSrc}" alt="Verify QR" width="88" height="88"/>
    </div>

    <div class="rep-sigs">
      <div>
        <div>Medical Laboratory Specialist</div>
        <div class="nm">${esc(model.signatures.specialist)}</div>
      </div>
      <div>
        <div>Consultant Pathologist</div>
        <div class="nm">${esc(model.signatures.pathologist)}</div>
      </div>
    </div>

    <div class="rep-foot">
      RT LAB · Report ${esc(model.meta.reportId)} · Mode ${esc(model.meta.modeLabel)} ·
      Verify with secure token only · © RT LAB
    </div>
  </article>
</body>
</html>`;
  }

  function openPrint(model, opts) {
    const html = renderReportHtml(model, opts);
    const w = global.open('', '_blank');
    if (!w) return html;
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 400);
    return html;
  }

  global.RTReportEngine = {
    MODES,
    makeToken,
    buildReportModel,
    renderReportHtml,
    openPrint,
    css
  };
})(typeof window !== 'undefined' ? window : globalThis);
