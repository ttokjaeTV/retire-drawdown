/* ===== 노후 자금 고갈 시뮬레이터 엔진 (2026년 세법·건보료 기준) =====
   세금 규칙은 연금 인출 세금 시뮬레이터(ttokjaeTV/pension-tax-sim/src/engine.js)와 같은 값,
   건보료는 같은 파일의 NH·nhRegional·nhDependent와 같은 값입니다. 한쪽을 바꾸면 다른 쪽도 같이 바꾸세요.
   금액 단위: 원 · 나이: 만 나이 · 1년 단위 계산(인출은 매년 초, 수익은 남은 돈에 연말 반영) */

const TAX = { LOCAL: 1.1, SEP_LIMIT: 15e6, SEP_RATE: 0.15, OTHER_RATE: 0.15, BASIC: 1.5e6, ELDER: 1e6, STD_CREDIT: 7e4, DIV: 0.154 };
function pensionRate(age) { return age >= 80 ? 0.03 : age >= 70 ? 0.04 : 0.05; }
function retireFactor(n) { return n <= 10 ? 0.7 : n <= 20 ? 0.6 : 0.5; }
function progressiveTax(base) {
  if (base <= 0) return 0;
  const B = [[14e6, 0.06, 0], [50e6, 0.15, 1.26e6], [88e6, 0.24, 5.76e6], [150e6, 0.35, 15.44e6],
    [300e6, 0.38, 19.94e6], [500e6, 0.40, 25.94e6], [1e9, 0.42, 35.94e6], [Infinity, 0.45, 65.94e6]];
  for (const [lim, r, d] of B) if (base <= lim) return base * r - d;
  return 0;
}
function pensionDeduction(total) {
  let d;
  if (total <= 3.5e6) d = total;
  else if (total <= 7e6) d = 3.5e6 + (total - 3.5e6) * 0.4;
  else if (total <= 14e6) d = 4.9e6 + (total - 7e6) * 0.2;
  else d = 6.3e6 + (total - 14e6) * 0.1;
  return Math.min(d, 9e6);
}
// 연금소득 종합과세 (지방세 포함). extraDed: 경로우대·배우자공제 등 추가 인적공제
function compTax(pub, priv, extraDed) {
  const total = pub + priv;
  const income = total - pensionDeduction(total);
  const base = Math.max(0, income - TAX.BASIC - (extraDed || 0));
  return Math.max(0, progressiveTax(base) - TAX.STD_CREDIT) * TAX.LOCAL;
}
function retirementTax(sev, years) {
  years = Math.max(1, Math.ceil(years));
  let sd;
  if (years <= 5) sd = 1e6 * years;
  else if (years <= 10) sd = 5e6 + 2e6 * (years - 5);
  else if (years <= 20) sd = 15e6 + 2.5e6 * (years - 10);
  else sd = 40e6 + 3e6 * (years - 20);
  const conv = Math.max(0, sev - sd) * 12 / years;
  let cd;
  if (conv <= 8e6) cd = conv;
  else if (conv <= 70e6) cd = 8e6 + (conv - 8e6) * 0.6;
  else if (conv <= 100e6) cd = 45.2e6 + (conv - 70e6) * 0.55;
  else if (conv <= 300e6) cd = 61.7e6 + (conv - 100e6) * 0.45;
  else cd = 151.7e6 + (conv - 300e6) * 0.35;
  return Math.max(0, progressiveTax(Math.max(0, conv - cd)) * years / 12);
}

/* ---- 건보료 (pension-tax-sim/src/engine.js NH와 같은 값) ---- */
const NH = { hi: 0.0719, ltc: 0.009448, floorIncomeM: 280000, floorPrem: 20160, capPremM: 4591740,
  perPoint: 211.5, propDed: 1e8, finMin: 10e6, pubRate: 0.5, depIncome: 20e6, depProp1: 5.4e8, depProp2: 9e8, depPropIncome: 10e6 };
const NH_PROP = [[450,22],[900,44],[1350,66],[1800,97],[2250,122],[2700,146],[3150,171],[3600,195],[4050,219],[4500,244],
  [5020,268],[5590,294],[6220,320],[6930,344],[7710,365],[8590,386],[9570,412],[10700,439],[11900,465],[13300,490],
  [14800,516],[16400,535],[18300,559],[20400,586],[22700,611],[25300,637],[28100,659],[31300,681],[34900,706],[38800,731],
  [43200,757],[48100,785],[53600,812],[59700,841],[66500,881],[74000,921],[82400,961],[91800,1001],[103000,1041],[114000,1091],
  [127000,1141],[142000,1191],[158000,1241],[176000,1291],[196000,1341],[218000,1391],[242000,1451],[270000,1511],[300000,1571],[330000,1641],
  [363000,1711],[399300,1781],[439230,1851],[483153,1921],[531468,1991],[584615,2061],[643077,2131],[707385,2201],[778124,2271],[Infinity,2341]];
function houseTaxBase(g, multi) { if (!(g > 0)) return 0; if (multi) return g * 0.6; return g * (g <= 3e8 ? 0.43 : g <= 6e8 ? 0.44 : 0.45); }
function propPoints(tb) { const man = (tb - NH.propDed) / 1e4; if (man <= 0) return 0; for (const [l, p] of NH_PROP) if (man <= l) return p; return 2341; }
// 판정 기준 금액(이자·배당 1,000만원, 피부양자 2,000만원·5.4억·9억·1,000만원)은 법에 정한 명목 금액이라 물가에 연동하지 않는다
// (국민건강보험법 시행규칙 제44조①, 별표 1의2). 오늘 돈 가치로 계산할 때는 k(= 물가 배수)로 기준을 나눠 비교 = 명목 금액을 고정 기준과 비교
const nhFin = (f, k) => (f > NH.finMin / (k || 1) ? f : 0);
function nhRegional(o) {
  const k = o.ix || 1;
  const income = (o.pub || []).reduce((a, v) => a + Math.max(0, v) * NH.pubRate, 0) + (o.fin || []).reduce((a, v) => a + nhFin(Math.max(0, v), k), 0) + Math.max(0, o.other || 0);
  const m = income / 12;
  const incPrem = m <= NH.floorIncomeM ? NH.floorPrem : Math.min(NH.capPremM, Math.max(NH.floorPrem, m * NH.hi));   // 하한 바로 위 소득도 하한보다 적게 내지 않게
  const propPrem = propPoints(o.taxBase || 0) * NH.perPoint;
  const health = incPrem + propPrem;
  return { income, incPrem, propPrem, health, total: health * (1 + NH.ltc / NH.hi) };
}
function nhDependentOk(people, k) {   // 소득 요건은 부부 함께, 재산 요건은 각자. k: 물가 배수(오늘 돈 가치로 넣었을 때 기준을 나눔)
  k = k || 1;
  const r = people.map(p => { const inc = Math.max(0, p.pub || 0) + nhFin(Math.max(0, p.fin || 0), k); const tb = p.taxBase || 0;
    return { incOk: inc <= NH.depIncome / k, propOk: tb <= NH.depProp1 / k || (tb <= NH.depProp2 / k && inc <= NH.depPropIncome / k) }; });
  return r.every(x => x.incOk) && r.every(x => x.propOk);
}

/* ---- 연금계좌 운용손익 ----
   수익은 모두 ③. 손실은 원금을 인출 순서의 반대(③ → ② → ①)로 차감 (소득세법 시행령 제40조의3 제5항) — 바구니가 음수가 되지 않게.
   pension-tax-sim/src/engine.js와 같은 규칙 */
function growPension(x, r) {
  const g = (x.b1 + x.b2 + x.b3) * r;
  if (g >= 0) { x.b3 += g; return; }
  let loss = -g;
  const l3 = Math.min(x.b3, loss); x.b3 -= l3; loss -= l3;
  const l2 = Math.min(x.b2, loss); x.b2 -= l2; loss -= l2;
  x.b1 -= Math.min(x.b1, loss);
}

/* ---- 국민연금 ---- */
function npsLegalAge(by) { if (by <= 1952) return 60; if (by <= 1956) return 61; if (by <= 1960) return 62; if (by <= 1964) return 63; if (by <= 1968) return 64; return 65; }
function npsFactor(shift) { return shift < 0 ? 1 + 0.06 * shift : 1 + 0.072 * shift; }   // 1년 앞당길 때 −6%, 미룰 때 +7.2% (최대 5년)

/* ---- 인출 순서 후보 ----
   T 예금·일반계좌 · F ISA·국내주식(비과세) · P1 세액공제 받지 않은 원금 · P2 퇴직금(IRP, 한도 안)
   P3a 세액공제 받은 원금·운용수익(1인 연 상한까지) · P3b 그 위(한도 안) · P2x·P3x 연금수령한도 넘겨서 */
const ORDERS = [
  ['T', 'P3a', 'P1', 'F', 'P2', 'P3b', 'P2x', 'P3x'],
  ['T', 'P3a', 'P2', 'P1', 'F', 'P3b', 'P2x', 'P3x'],
  ['T', 'P2', 'P3a', 'P1', 'F', 'P3b', 'P2x', 'P3x'],
  ['T', 'P1', 'F', 'P3a', 'P2', 'P3b', 'P2x', 'P3x'],
  ['P3a', 'T', 'P2', 'P1', 'F', 'P3b', 'P2x', 'P3x'],
  ['T', 'F', 'P1', 'P2', 'P3a', 'P3b', 'P2x', 'P3x'],
];
const CAPS_NOPUB = [15e6, 20e6, 25e6];   // 공적연금 받기 전 해의 P3a 상한 후보 (종합과세가 더 싼 구간을 쓸지)
const TIER_NAME = { T: '예금·일반계좌', F: 'ISA·국내주식', P1: '세액공제 받지 않은 원금', P2: '퇴직금 IRP', P3a: '세액공제 받은 원금·수익', P3b: '세액공제 받은 원금·수익(1,500만원 넘겨서)', P2x: '퇴직금(수령한도 넘겨서)', P3x: '세액공제 받은 원금·수익(수령한도 넘겨서)' };

/*
 p = {
   year0, inf, endAge, rPre, rPost, crash, nhOn, house, multi, dep,
   taxIndex (true면 세법 기준금액 — 연금소득공제·과표구간·인적공제·1,500만원·2,000만원 — 도 물가만큼 오른다고 봄, 기본 false = 현행법 고정),
   divPre, divPost (일반계좌 수익 중 배당률, 소수. null이면 수익 전체를 이자·배당으로 봄 — 직접 입력 수익률일 때),
   spend (월, 오늘 돈 가치), spendAge, spend2 (중간 변경: 본인 spendAge부터 월 spend2, 없으면 null),
   persons: [{ age, retireAge(본인만, 배우자는 같은 해 은퇴), income(true/false),
     sev(은퇴 때 퇴직금 세전), sevYears, sevMode 'lump'|'irp',
     tc(세액공제 받은 원금 잔액), ntc(세액공제 받지 않은 원금), isa, cash, cTc(연 연금 납입), cIsa(연 ISA 납입),
     nps(월, 오늘 돈 가치, 법정 나이 기준), npsAge(받기 시작 나이) }]
 }
*/
function simulateOnce(p, order, capNoPub) {
  const P = p.persons.map(x => ({ ...x }));
  const me = P[0];
  const R = Math.max(0, me.retireAge - me.age);           // 은퇴까지 남은 해
  const endT = Math.max(R, p.endAge - me.age);             // 본인 계획 나이까지
  const couple = P.length > 1;
  P.forEach(x => {
    x.b1 = x.ntc; x.b2 = 0; x.b3 = x.tc; x.F = x.isa; x.T = x.cash; x.Tb = x.cash; x.retRate = 0; x.n2 = 0; x.n2Start = null;
    x.by = p.year0 - x.age; x.npsLegal = npsLegalAge(x.by);
    x.npsStart = Math.min(x.npsLegal + 5, Math.max(x.npsLegal - 5, Math.round(x.npsAge || x.npsLegal)));
    x.npsMon = (x.nps || 0) * npsFactor(x.npsStart - x.npsLegal);
  });
  const rows = [];
  // taxDivPre: 은퇴 전 적립 기간에 일반계좌에서 뗀 세금 — '은퇴 후 세금 합계'에는 넣지 않고 따로 둔다
  const sum = { tax: 0, taxRetire: 0, taxPension: 0, taxOther: 0, taxPub: 0, taxDiv: 0, taxDivPre: 0, nh: 0, withdrawn: 0, pub: 0, spend: 0, short: 0,
    compYears: 0, sepYears: 0, overYears: 0, finWarnYears: 0 };
  let depleteT = null, retireAssets = 0, retireAssetsBy = null;

  /* 일반계좌 한 해 수익 반영.
     세금: 수익 전체에 해마다 15.4% (국내상장 해외 ETF라면 팔 때 낼 세금을 미리 떼는 보수적 단순화).
     건보료·금융소득종합과세 판정용 이자·배당(lastFin): 배당 + 그해 팔아서 생긴 차익만.
     배당률을 모르면(직접 입력 수익률) 수익 전체를 이자·배당으로 본다(예금처럼).
     배당은 주가와 따로 나온다: 총수익률이 배당률보다 낮거나 마이너스인 해(폭락)에도 배당은 그대로 받고 그만큼 세금·건보료 판정에 잡힌다.
     (총수익률 = 배당 + 주가 변동이므로, 배당을 받는 해에는 주가 몫이 그만큼 더 떨어진 것으로 본다 — 총자산 변화는 같다) */
  function growT(x, r, div, sold) {
    const tg = x.T * r;
    const d = div == null ? 0 : Math.max(0, x.T * Math.max(0, div));
    const dt = Math.max(0, tg, d) * TAX.DIV;            // 배당이 총수익보다 크면 최소한 배당에는 세금이 붙는다
    let fin;
    if (div == null) { fin = Math.max(0, tg); x.Tb = x.T + tg - dt; }
    else {
      x.Tb += d * (1 - TAX.DIV);                      // 받은 배당(세후)은 다시 산 원금
      fin = d + (sold || 0);
    }
    x.T += tg - dt;
    x.Tb = Math.min(x.Tb, x.T);
    x.lastFin = fin;
    return dt;
  }

  for (let t = 0; t <= endT; t++) {
    const yr = p.year0 + t, ix = Math.pow(1 + p.inf, t);
    const kx = p.taxIndex ? ix : 1;                     // 세법 기준금액 물가연동이면 오늘 돈 가치로 세금 계산
    const ct = (pub, priv, ded) => compTax(pub / kx, priv / kx, ded) * kx;
    const SEP = TAX.SEP_LIMIT * kx;
    const ages = P.map(x => x.age + t);
    const row = { t, yr, ages, phase: t < R ? 'save' : 'draw' };

    if (t < R) {   // ---------- 모으는 시기 ----------
      const r = p.rPre;
      P.forEach(x => {
        growPension(x, r);                              // 연금계좌 운용수익은 모두 ③, 손실은 ③ → ② → ①
        x.F *= 1 + r;
        sum.taxDivPre += growT(x, r, p.divPre, 0);
        const c = Math.min(Math.max(0, x.cTc || 0), 18e6);
        const ded = x.income === false ? 0 : Math.min(c, 9e6);
        x.b3 += ded; x.b1 += c - ded;
        x.F += Math.min(Math.max(0, x.cIsa || 0), 20e6);
      });
      row.bal = P.map(x => ({ T: x.T, F: x.F, b1: x.b1, b2: x.b2, b3: x.b3 }));
      row.total = P.reduce((a, x) => a + x.T + x.F + x.b1 + x.b2 + x.b3, 0);
      rows.push(row);
      continue;
    }

    // ---------- 은퇴하는 해: 퇴직금 ----------
    if (t === R) {
      P.forEach(x => {
        if (x.income === false || !(x.sev > 0)) return;
        const rt = retirementTax(x.sev, x.sevYears || 1);
        if (x.sevMode === 'irp') { x.b2 += x.sev; x.retRate = rt / x.sev; x.n2Start = x.age + t; }
        else { x.T += x.sev - rt * TAX.LOCAL; x.Tb += x.sev - rt * TAX.LOCAL; sum.taxRetire += rt * TAX.LOCAL; sum.tax += rt * TAX.LOCAL; row.sevTax = (row.sevTax || 0) + rt * TAX.LOCAL; }
      });
      retireAssets = P.reduce((a, x) => a + x.T + x.F + x.b1 + x.b2 + x.b3, 0);
      retireAssetsBy = P.map(x => ({ T: x.T, F: x.F, b1: x.b1, b2: x.b2, b3: x.b3 }));
    }

    // ---------- 꺼내 쓰는 시기 ----------
    const tr = t - R;
    const r = p.crash && tr < 2 ? -0.2 : p.rPost;
    const mon = (p.spend2 != null && ages[0] >= p.spendAge) ? p.spend2 : p.spend;
    const spendY = mon * 12 * ix;
    const pub = P.map((x, i) => (ages[i] >= x.npsStart ? x.npsMon * 12 * ix : 0));
    // 공적연금 소득세 (공적연금만 있을 때) — 2002년 이후 납입분만 과세지만 전액 과세로 단순화
    // 공제액(extra)은 오늘 돈 가치. 세법 기준금액 물가연동이 꺼져 있으면 kx = 1이라 그대로 명목 고정
    const extra = P.map((x, i) => { const sp = pub[1 - i] / kx; return (ages[i] >= 70 ? TAX.ELDER : 0) + (couple && (sp - pensionDeduction(sp)) <= 1e6 ? TAX.BASIC : 0); });
    const pubTax = P.map((x, i) => ct(pub[i], 0, extra[i]));
    // 건보료: 오늘 돈 가치로 계산한 뒤 물가만큼 키움. 이자·배당은 지난해 일반계좌 수익
    // 판정 기준 금액(1,000만·2,000만·5.4억·9억)은 명목 고정이라 ix를 넘겨 기준을 오늘 돈 가치로 낮춰 비교
    let nh = 0;
    if (p.nhOn) {
      const finR = P.map(x => (x.lastFin || 0) / ix);
      const pubR = pub.map(v => v / ix);
      const tb = houseTaxBase(p.house || 0, p.multi);
      const depOk = p.dep && nhDependentOk(P.map((x, i) => ({ pub: pubR[i], fin: finR[i], taxBase: i === 0 ? tb : 0 })), ix);
      nh = depOk ? 0 : nhRegional({ pub: pubR, fin: finR, taxBase: tb, ix }).total * 12 * ix;
      row.nhDep = depOk;
    }
    let need = spendY + nh + pubTax.reduce((a, v) => a + v, 0) - pub.reduce((a, v) => a + v, 0);
    let surplus = 0;
    if (need < 0) { surplus = -need; need = 0; }

    // 연금수령한도 (계좌를 나눠 둔 것으로 보고 ②·③ 각각)
    const lim = P.map((x, i) => {
      const a = ages[i];
      const n3 = 1 + Math.max(0, a - 55);
      const n2 = x.n2Start == null ? 1 : 1 + Math.max(0, a - Math.max(55, x.n2Start));
      return { l2: n2 >= 11 ? Infinity : x.b2 / (11 - n2) * 1.2, l3: n3 >= 11 ? Infinity : x.b3 / (11 - n3) * 1.2 };
    });
    const W = P.map(() => ({ T: 0, F: 0, P1: 0, P2: 0, P3: 0, P2x: 0, P3x: 0, P3in: 0 }));
    const assumed = P.map(() => 0);   // 인출하면서 미리 떼어 둔 세금
    const capOf = i => (pub[i] > 0 ? SEP : capNoPub * kx);
    const sold = P.map(() => 0);      // 일반계좌에서 팔아 실현한 차익 (건보료·종합과세 판정용)

    function draw(netNeed) {
      let N = netNeed;
      for (const tier of order) {
        if (N <= 0.5) break;
        for (let i = 0; i < P.length && N > 0.5; i++) {
          const x = P[i], a = ages[i], w = W[i];
          let avail = 0, tau = 0;
          if (tier === 'T') avail = x.T;
          else if (tier === 'F') avail = x.F;
          else if (tier === 'P1') avail = x.b1;              // 세액공제 받지 않은 원금은 언제든 세금 없이
          else if (a < 55) continue;
          else if (tier === 'P2') { avail = Math.max(0, Math.min(x.b2, lim[i].l2 - w.P2)); tau = x.retRate * retireFactor(x.n2 + 1) * TAX.LOCAL; }
          else if (tier === 'P2x') { avail = x.b2; tau = x.retRate * TAX.LOCAL; }
          else if (tier === 'P3a') { avail = Math.max(0, Math.min(x.b3, lim[i].l3 - w.P3in, capOf(i) - w.P3in)); tau = pub[i] > 0 || capOf(i) <= SEP ? pensionRate(a) * TAX.LOCAL : 0.03; }
          else if (tier === 'P3b') { avail = Math.max(0, Math.min(x.b3, lim[i].l3 - w.P3in)); tau = TAX.SEP_RATE * TAX.LOCAL; }
          else if (tier === 'P3x') { avail = x.b3; tau = TAX.OTHER_RATE * TAX.LOCAL; }
          if (avail <= 0.5) continue;
          const g = Math.min(avail, N / (1 - tau));
          N -= g * (1 - tau); assumed[i] += g * tau;
          if (tier === 'T') { const gs = x.T > 0 ? Math.max(0, 1 - x.Tb / x.T) : 0; sold[i] += g * gs; x.Tb -= g * (1 - gs); x.T -= g; w.T += g; }
          else if (tier === 'F') { x.F -= g; w.F += g; }
          else if (tier === 'P1') { x.b1 -= g; w.P1 += g; }
          else if (tier === 'P2') { x.b2 -= g; w.P2 += g; }
          else if (tier === 'P2x') { x.b2 -= g; w.P2x += g; }
          else if (tier === 'P3x') { x.b3 -= g; w.P3x += g; }
          else { x.b3 -= g; w.P3 += g; w.P3in += g; }
        }
      }
      return Math.max(0, N);
    }
    function actualTax() {
      return P.map((x, i) => {
        const w = W[i], a = ages[i];
        const tRet = w.P2 * x.retRate * retireFactor(x.n2 + 1) * TAX.LOCAL + w.P2x * x.retRate * TAX.LOCAL;
        const p3 = w.P3in; let tPen = 0, how = '';
        if (p3 > 0.5) {
          const comp = ct(pub[i], p3, extra[i]) - pubTax[i];
          const alt = p3 <= SEP ? p3 * pensionRate(a) * TAX.LOCAL : p3 * TAX.SEP_RATE * TAX.LOCAL;
          if (comp < alt) { tPen = comp; how = 'comp'; } else { tPen = alt; how = p3 <= SEP ? 'low' : 'sep'; }
        }
        const tOth = w.P3x * TAX.OTHER_RATE * TAX.LOCAL;
        return { tRet, tPen, tOth, how, all: tRet + tPen + tOth };
      });
    }
    let short = draw(need), tx = actualTax();
    for (let k = 0; k < 6; k++) {       // 실제 세금이 미리 떼어 둔 것보다 많으면 그만큼 더 꺼낸다
      const diff = tx.reduce((a, v) => a + v.all, 0) - assumed.reduce((a, v) => a + v, 0);
      if (diff > 1) { assumed[0] += diff; short += draw(diff); tx = actualTax(); }
      else { if (diff < -1) surplus += -diff; break; }
    }
    const taxAll = tx.reduce((a, v) => a + v.all, 0);
    P.forEach((x, i) => { if (W[i].P2 + W[i].P2x > 0.5) x.n2++; });

    // 남는 돈(공적연금이 생활비보다 많거나 세금을 덜 낸 해)은 일반계좌로
    if (surplus > 0) { P[0].T += surplus; P[0].Tb += surplus; }
    if (short > 1e4 && depleteT == null) depleteT = t;

    // 수익 반영
    P.forEach(x => {
      growPension(x, r);
      x.F *= 1 + r;
    });
    P.forEach((x, i) => {
      const dt = growT(x, r, p.divPost, sold[i]); sum.taxDiv += dt; row.taxDiv = (row.taxDiv || 0) + dt;
      if (x.lastFin > 20e6 * kx) sum.finWarnYears++;
    });

    const wsum = W.reduce((a, w) => a + w.T + w.F + w.P1 + w.P2 + w.P3 + w.P2x + w.P3x, 0);
    Object.assign(row, {
      spend: spendY, nh, pub: pub.reduce((a, v) => a + v, 0), pubTax: pubTax.reduce((a, v) => a + v, 0), need,
      w: W, wsum, tax: tx, taxW: taxAll, short, surplus, r,
      fin: P.map(x => x.lastFin),   // 그해 건보료·종합과세 판정용 이자·배당 (다음 해 건보료에 반영)
      bal: P.map(x => ({ T: x.T, F: x.F, b1: x.b1, b2: x.b2, b3: x.b3 })),
      total: P.reduce((a, x) => a + x.T + x.F + x.b1 + x.b2 + x.b3, 0),
    });
    rows.push(row);
    sum.withdrawn += wsum; sum.nh += nh; sum.pub += row.pub; sum.spend += spendY; sum.short += short;
    sum.taxPub += row.pubTax;
    tx.forEach(v => { sum.taxRetire += v.tRet; sum.taxPension += v.tPen; sum.taxOther += v.tOth;
      if (v.how === 'comp') sum.compYears++; if (v.how === 'sep') sum.sepYears++; });
    sum.tax += taxAll + row.pubTax + (row.taxDiv || 0);
    if (W.some(w => w.P2x + w.P3x > 0.5)) sum.overYears++;
  }
  const last = P;
  // 끝까지 남은 돈을 다 찾았을 때 손에 쥐는 돈 (퇴직금은 퇴직소득세, 세액공제분·수익은 16.5%)
  const liquid = last.reduce((a, x) => a + x.T + x.F + x.b1 + x.b2 * (1 - x.retRate * TAX.LOCAL) + x.b3 * (1 - TAX.OTHER_RATE * TAX.LOCAL), 0);
  const deplAge = depleteT == null ? null : me.age + depleteT;
  return { rows, sum, depleteT, deplAge, liquid, retireAssets, retireAssetsBy, R, order, capNoPub,
    npsStart: P.map(x => x.npsStart), npsLegal: P.map(x => x.npsLegal), npsMon: P.map(x => x.npsMon) };
}

// 여러 인출 순서를 모두 계산해 가장 오래 버티는(끝까지 버티면 다 찾았을 때 손에 쥐는 돈이 가장 많은) 순서를 고른다
function simulate(p) {
  let best = null;
  for (const o of ORDERS) for (const c of CAPS_NOPUB) {
    const r = simulateOnce(p, o, c);
    const score = (r.depleteT == null ? 1e6 : r.depleteT) * 1e13 + r.liquid - (r.depleteT == null ? 0 : r.sum.short);
    if (!best || score > best.score) best = Object.assign(r, { score });
  }
  return best;
}

// 계획 나이까지 버틸 수 있는 최대 월 생활비 (오늘 돈 가치, 만원 단위로 반올림 전 원 단위)
function maxSpend(p) {
  const ok = s => simulate({ ...p, spend: s, spend2: p.spend2 != null ? p.spend2 * s / Math.max(1, p.spend) : null }).depleteT == null;
  let lo = 0, hi = Math.max(1e6, p.spend * 4);
  if (!ok(lo)) return 0;
  while (ok(hi) && hi < 1e9) hi *= 2;
  for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  return lo;
}

if (typeof module !== 'undefined') module.exports = {
  TAX, NH, pensionRate, retireFactor, progressiveTax, pensionDeduction, compTax, retirementTax,
  houseTaxBase, propPoints, nhRegional, nhDependentOk, npsLegalAge, npsFactor, ORDERS, CAPS_NOPUB, TIER_NAME,
  simulateOnce, simulate, maxSpend,
};
