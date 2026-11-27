const CANONICAL_ROWS = [
  "Date",
  "Cash & ST Investments",
  "Current assets",
  "Receivables",
  "Inventory",
  "Intangibles",
  "Total assets (Without Intangibles)",
  "Total assets",
  "Current Liabilities",
  "Long-Term Debt",
  "Total liabilities",
  "Retained earnings",
  "Total equity",
  "Total debt",
  "Shares outstanding",
  "Issuance of stock",
  "Retirement of stock",
  "Total cash dividend paid",
  "Cash from operating activities",
  "Capital expenditures",
  "Revenue",
  "Gross Profit",
  "Operating Income",
  "Net income",
  "Insiders",
  "Long Term Investments",
  "LTM dividend",
  "Total Pref Equity",
  "Total Minority Interest"
];

function normalizeLabel(raw) {
  if (!raw) return "";
  const clean = raw.trim().toLowerCase();
  const map = {
    "date": "Date",
    "name": "Name",
    "company name": "Name",
    "currency": "Currency",
    "website": "Website",
    "sitio web": "Website",
    "description": "Description",
    "descripcion": "Description",
    "descripción": "Description",
    "cash & st investments": "Cash & ST Investments",
    "current assets": "Current assets",
    "receivables": "Receivables",
    "inventory": "Inventory",
    "intangibles": "Intangibles",
    "total assets (without intangibles)": "Total assets (Without Intangibles)",
    "total assets": "Total assets",
    "current liabilities": "Current Liabilities",
    "long-term debt": "Long-Term Debt",
    "total liabilities": "Total liabilities",
    "retained earnings": "Retained earnings",
    "total equity": "Total equity",
    "total debt": "Total debt",
    "shares outstanding": "Shares outstanding",
    "total shares outstanding": "Shares outstanding",
    "total common shares": "Shares outstanding",
    "issuance of stock": "Issuance of stock",
    "retirement of stock": "Retirement of stock",
    "total cash dividend paid": "Total cash dividend paid",
    "cash from operating activities": "Cash from operating activities",
    "capital expenditures": "Capital expenditures",
    "revenue": "Revenue",
    "gross profit": "Gross Profit",
    "operating income": "Operating Income",
    "net income": "Net income",
    "insiders": "Insiders",
    "long term investments": "Long Term Investments",
    "ltm dividend": "LTM dividend",
    "total pref equity": "Total Pref Equity",
    "total minority interest": "Total Minority Interest"
  };
  return map[clean] || raw.trim();
}

function parseCellValue(rowName, val) {
  if (val === null || val === undefined || val === "") return 0;
  if (rowName === "Date") return String(val).trim();
  if (typeof val === "number") return val;
  let str = String(val).trim().replace(/,/g, "");
  if (str.endsWith("%")) {
    return parseFloat(str.replace("%", "")) / 100;
  }
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function parseCompanyCSV(csvText) {
  const firstLine = csvText.split(/\r?\n/)[0] || "";
  let delimiter = ",";
  if (firstLine.includes("\t")) delimiter = "\t";
  else if (firstLine.split(";").length > firstLine.split(",").length) delimiter = ";";

  const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== "");
  const matrix = lines.map(line => {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  });

  if (matrix.length < 2) throw new Error("El archivo CSV no tiene suficientes filas.");

  const ticker = matrix[0][0].trim().toUpperCase();
  if (!ticker) throw new Error("La celda A1 debe contener el Ticker de la empresa.");

  const periods = matrix[0].slice(1).map(p => p.trim()).filter(p => p !== "");
  const rows = {};
  let name = null;
  let currency = null;
  let website = null;
  let description = null;

  const firstNonEmpty = (arr) => arr.map(v => String(v || "").trim()).find(v => v !== "") || null;

  for (let r = 1; r < matrix.length; r++) {
    const rawLabel = matrix[r][0];
    if (!rawLabel) continue;
    const label = normalizeLabel(rawLabel);

    if (label === "Name") {
      const found = firstNonEmpty(matrix[r].slice(1));
      if (found) name = found;
      continue;
    }
    if (label === "Currency") {
      const found = firstNonEmpty(matrix[r].slice(1));
      if (found) currency = found.toUpperCase();
      continue;
    }
    if (label === "Website") {
      const found = firstNonEmpty(matrix[r].slice(1));
      if (found) website = found;
      continue;
    }
    if (label === "Description") {
      const found = firstNonEmpty(matrix[r].slice(1));
      if (found) description = found;
      continue;
    }

    rows[label] = periods.map((_, idx) => parseCellValue(label, matrix[r][idx + 1]));
  }

  return { ticker, name, currency, website, description, periods, rows };
}

function sortPeriods(periodList) {
  return [...periodList].sort((a, b) => {
    const upA = a.toUpperCase();
    const upB = b.toUpperCase();
    if (upA === "LTM") return -1;
    if (upB === "LTM") return 1;
    const numA = parseInt(upA.replace(/[^0-9]/g, ""), 10);
    const numB = parseInt(upB.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
      return numB - numA;
    }
    return upB.localeCompare(upA);
  });
}

function mergeCompanyData(existingCompany, incoming) {
  const today = new Date().toISOString().slice(0, 10);
  const base = existingCompany ? JSON.parse(JSON.stringify(existingCompany)) : {
    ticker: incoming.ticker,
    name: incoming.name || incoming.ticker,
    currency: incoming.currency || "USD",
    unitMultiplier: 1000000,
    price: null,
    priceDate: null,
    website: incoming.website || "",
    description: incoming.description || "",
    lastUpdated: today,
    periods: [],
    rows: {}
  };

  if (incoming.name) base.name = incoming.name;
  if (incoming.currency) base.currency = incoming.currency.toUpperCase();
  if (incoming.website) base.website = incoming.website;
  if (incoming.description) base.description = incoming.description;

  const periodMap = {};
  base.periods.forEach((p, idx) => {
    periodMap[p] = {};
    Object.keys(base.rows).forEach(r => {
      periodMap[p][r] = base.rows[r][idx];
    });
  });

  incoming.periods.forEach((p, idx) => {
    if (!periodMap[p]) periodMap[p] = {};
    Object.keys(incoming.rows).forEach(r => {
      periodMap[p][r] = incoming.rows[r][idx];
    });
  });

  const sortedPeriods = sortPeriods(Object.keys(periodMap));
  const allRowNames = new Set([...CANONICAL_ROWS, ...Object.keys(base.rows), ...Object.keys(incoming.rows)]);
  const mergedRows = {};

  allRowNames.forEach(r => {
    if (base.rows[r] !== undefined || incoming.rows[r] !== undefined) {
      mergedRows[r] = sortedPeriods.map(p => {
        const val = periodMap[p][r];
        if (val !== undefined) return val;
        return r === "Date" ? "-" : 0;
      });
    }
  });

  base.periods = sortedPeriods;
  base.rows = mergedRows;
  base.lastUpdated = today;
  return base;
}

function getSharesValue(rows, colIdx = 0) {
  if (!rows) return 0;
  const candidateRow = rows["Shares outstanding"] || rows["Total shares outstanding"] || rows["Total common shares"];
  if (!candidateRow || colIdx >= candidateRow.length) return 0;
  const v = Number(candidateRow[colIdx]);
  return isNaN(v) ? 0 : v;
}

function calculateMetrics(company, sharePrice) {
  const r = company.rows || {};
  const periods = company.periods || [];
  if (periods.length === 0) return {};

  const getVal = (rowName, colIdx) => {
    if (!r[rowName] || colIdx >= r[rowName].length) return 0;
    const v = Number(r[rowName][colIdx]);
    return isNaN(v) ? 0 : v;
  };

  const cash = getVal("Cash & ST Investments", 0);
  const currAssets = getVal("Current assets", 0);
  const receivables = getVal("Receivables", 0);
  const inventory = getVal("Inventory", 0);
  const assetsNoInt = getVal("Total assets (Without Intangibles)", 0);
  const totLiab = getVal("Total liabilities", 0);
  const prefEq = getVal("Total Pref Equity", 0);
  const retainedEarnings = getVal("Retained earnings", 0);
  const minInt = Math.max(0, getVal("Total Minority Interest", 0));
  

  // Shares outstanding de la columna más reciente (col 0)
  const shares = getSharesValue(r, 0);
  const insiders = getVal("Insiders", 0);

  const tbv = assetsNoInt - totLiab - prefEq - minInt;
  const ncav = currAssets - totLiab - prefEq - minInt;
  const nnwc = (cash + 0.75 * receivables + 0.5 * inventory) - totLiab - prefEq - minInt;
  const netCash = cash - totLiab - prefEq - minInt;

  // Market Cap en millones (si shares viene en acciones exactas y mult = 1,000,000)
  const mult = company.unitMultiplier || 1000000;
  const marketCap = (sharePrice !== null && sharePrice !== undefined && !isNaN(sharePrice) && shares > 0)
    ? (Number(sharePrice) * shares) / mult
    : null;

  const safeDiv = (num, den) => (num !== null && den && den !== 0) ? (num / den) : null;

  const eTTM = getVal("Net income", 0);
  const cfo0 = getVal("Cash from operating activities", 0);
  const capex0 = getVal("Capital expenditures", 0);
  const fcfTTM = (cfo0 === 0 && capex0 === 0 && periods.length > 1)
    ? (getVal("Cash from operating activities", 1) + getVal("Capital expenditures", 1))
    : (cfo0 + capex0);

  const fyIndices = periods.map((p, i) => ({ p, i }))
    .filter(item => item.p.toUpperCase() !== "LTM")
    .map(item => item.i);

  const avgMetric = (nYears, fn) => {
    const slice = fyIndices.slice(0, nYears);
    if (slice.length === 0) return null;
    const sum = slice.reduce((acc, idx) => acc + fn(idx), 0);
    return sum / slice.length;
  };

  const e5 = avgMetric(5, i => getVal("Net income", i));
  const e6 = avgMetric(6, i => getVal("Net income", i));
  const e10 = avgMetric(10, i => getVal("Net income", i));

  const fcf5 = avgMetric(5, i => getVal("Cash from operating activities", i) + getVal("Capital expenditures", i));
  const fcf6 = avgMetric(6, i => getVal("Cash from operating activities", i) + getVal("Capital expenditures", i));
  const fcf10 = avgMetric(10, i => getVal("Cash from operating activities", i) + getVal("Capital expenditures", i));

  const computePiotroski = (idxCurr, idxPrev, idxPrev2) => {
    if (idxCurr === null || idxCurr === undefined || idxPrev === null || idxPrev === undefined) {
      return null;
    }
    const p2Idx = (idxPrev2 !== null && idxPrev2 !== undefined) ? idxPrev2 : idxPrev;

    const niC = getVal("Net income", idxCurr);
    const cfoC = getVal("Cash from operating activities", idxCurr);
    const assetsC = getVal("Total assets", idxCurr);
    const assetsP = getVal("Total assets", idxPrev);
    const assetsP2 = getVal("Total assets", p2Idx);

    const avgAssetsC = (assetsC + assetsP) / 2 || assetsC;
    const avgAssetsP = (assetsP + assetsP2) / 2 || assetsP;

    const roaC = avgAssetsC ? (getVal("Operating Income", idxCurr) * (1 - 0.625)) / avgAssetsC : 0;
    const roaP = avgAssetsP ? (getVal("Operating Income", idxPrev) * (1 - 0.625)) / avgAssetsP : 0;

    const ltdC = getVal("Long-Term Debt", idxCurr);
    const ltdP = getVal("Long-Term Debt", idxPrev);
    const ltdRatioC = assetsC ? ltdC / assetsC : 0;
    const ltdRatioP = assetsP ? ltdP / assetsP : 0;

    const crC = getVal("Current Liabilities", idxCurr) ? getVal("Current assets", idxCurr) / getVal("Current Liabilities", idxCurr) : 0;
    const crP = getVal("Current Liabilities", idxPrev) ? getVal("Current assets", idxPrev) / getVal("Current Liabilities", idxPrev) : 0;

    const sharesC = getSharesValue(r, idxCurr);
    const sharesP = getSharesValue(r, idxPrev);

    const gmC = getVal("Revenue", idxCurr) ? getVal("Gross Profit", idxCurr) / getVal("Revenue", idxCurr) : 0;
    const gmP = getVal("Revenue", idxPrev) ? getVal("Gross Profit", idxPrev) / getVal("Revenue", idxPrev) : 0;

    const atC = avgAssetsC ? getVal("Revenue", idxCurr) / avgAssetsC : 0;
    const atP = avgAssetsP ? getVal("Revenue", idxPrev) / avgAssetsP : 0;

    const points = [
      niC > 0,
      cfoC > 0,
      roaC > roaP,
      cfoC > niC,
      (ltdRatioC === 0 && ltdRatioP === 0) ? (assetsC > assetsP) : (ltdRatioC < ltdRatioP),
      crC > crP,
      sharesC <= sharesP,
      gmC > gmP,
      atC > atP
    ];
    return points.reduce((sum, ok) => sum + (ok ? 1 : 0), 0);
  };

  // F-Score anual (compara último FY vs FY anterior)
  const fScore = fyIndices.length >= 2
    ? computePiotroski(fyIndices[0], fyIndices[1], fyIndices[2])
    : null;

  // F-Score LTM (compara LTM vs último FY, si existe LTM y al menos 1 FY)
  const hasLtm = periods.length > 0 && periods[0].toUpperCase() === "LTM";
  const fScoreLtm = (hasLtm && fyIndices.length >= 1)
    ? computePiotroski(0, fyIndices[0], fyIndices[1])
    : null;

  return {
    sharePrice,
    shares,
    marketCap,
    insiders,
    fScore,
    fScoreLtm,
    tbv,
    ncav,
    nnwc,
    netCash,
    retainedEarnings,
    fcfTTM,
    p_tbv: safeDiv(marketCap, tbv),
    p_ncav: safeDiv(marketCap, ncav),
    p_nnwc: safeDiv(marketCap, nnwc),
    p_netcash: safeDiv(marketCap, netCash),
    p_ettm: safeDiv(marketCap, eTTM),
    p_fcfttm: safeDiv(marketCap, fcfTTM),
    p_e5: safeDiv(marketCap, e5),
    p_fcf5: safeDiv(marketCap, fcf5),
    p_e6: safeDiv(marketCap, e6),
    p_fcf6: safeDiv(marketCap, fcf6),
    p_e10: safeDiv(marketCap, e10),
    p_fcf10: safeDiv(marketCap, fcf10)
  };
}

async function saveFileToGitHub({ owner, repo, branch, token, path, contentText, message }) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json"
  };

  let sha = null;
  const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers });
  if (getRes.ok) {
    const existing = await getRes.json();
    sha = existing.sha;
  }

  const utf8Bytes = new TextEncoder().encode(contentText);
  let binary = "";
  utf8Bytes.forEach(b => { binary += String.fromCharCode(b); });
  const base64Content = btoa(binary);

  const body = {
    message: message || `Update ${path}`,
    content: base64Content,
    branch: branch || "main"
  };
  if (sha) body.sha = sha;

  const putRes = await fetch(apiUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify(body)
  });

  if (!putRes.ok) {
    const errData = await putRes.json().catch(() => ({}));
    throw new Error(errData.message || `Error ${putRes.status} al guardar en GitHub`);
  }
  return await putRes.json();
}
