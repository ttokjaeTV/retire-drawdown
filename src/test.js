const E = require('./engine.js');
let fail = 0;
function eq(name, got, exp, tol = 1) { const ok = Math.abs(got - exp) <= tol; if (!ok) fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + ` got=${Math.round(got)} exp=${Math.round(exp)}`); }
const base = (o = {}) => Object.assign({ year0: 2026, inf: 0, endAge: 90, rPre: 0, rPost: 0, crash: false, nhOn: false, house: 0, multi: false, dep: false,
  spend: 1e6, spendAge: 0, spend2: null,
  persons: [Object.assign({ age: 60, retireAge: 60, income: true, sev: 0, sevYears: 1, sevMode: 'lump', tc: 0, ntc: 0, isa: 0, cash: 0, cTc: 0, cIsa: 0, nps: 0, npsAge: 65 }, o.me || {})] }, o);

// 1) 예금 1억, 월 100만, 수익·물가 0 → 1,200만씩 8년(60~67세), 68세에 400만만 남아 바닥
let r = E.simulateOnce(base({ me: { cash: 1e8 } }), E.ORDERS[0], 15e6);
eq('예금만: 68세 바닥', r.deplAge, 68, 0);
eq('예금만: 68세 부족액 800만', r.rows[8].short, 8e6);
// 2) 세액공제분 3억(③), 60세, 월 100만 → 1,200만 순수령. 종합과세(약 26만)가 5.5%(약 70만)보다 싸서 종합과세 선택
r = E.simulateOnce(base({ me: { tc: 3e8 } }), E.ORDERS[0], 15e6);
const y0 = r.rows[0];
// 손계산: 인출 g, 세금 compTax(0,g) = g − 1,200만. g≈1,226.3만
const g = y0.w[0].P3; const tx = E.compTax(0, g, 0);
eq('③만: 세후 − 돌려받은 차액(일반계좌로) = 1,200만', g - tx - y0.surplus, 12e6, 2);
eq('③만: 돌려받은 차액 = 5.5% 가정 − 실제 종합과세', y0.surplus, g * 0.055 - tx, 2);
eq('③만: 종합과세 세액 = 손계산', tx, (() => { const inc = g - E.pensionDeduction(g) - 1.5e6; return Math.max(0, inc * 0.06 - 7e4) * 1.1; })(), 1);
eq('③만: 종합과세 선택', y0.tax[0].how === 'comp' ? 1 : 0, 1, 0);
// 3) 퇴직금 일시금: 2억·25년 → 퇴직소득세 5,075,000(국세)×1.1 = 5,582,500 뗀 돈이 예금으로
r = E.simulateOnce(base({ me: { sev: 2e8, sevYears: 25, sevMode: 'lump' } }), E.ORDERS[0], 15e6);
eq('퇴직소득세 2억·25년 국세', E.retirementTax(2e8, 25), 5075000);
eq('일시금 → 예금 1억 9,441만 7,500', r.retireAssets, 2e8 - 5582500);
// 4) 퇴직금 IRP 연금: 1년차 70% 납부 → 세율 2.5375%×0.7×1.1
r = E.simulateOnce(base({ me: { sev: 2e8, sevYears: 25, sevMode: 'irp' } }), E.ORDERS[0], 15e6);
const rr = 5075000 / 2e8 * 0.7 * 1.1;
eq('IRP 1년차 세후 1,200만', r.rows[0].w[0].P2 * (1 - rr), 12e6, 2);
eq('IRP 1년차 퇴직소득세', r.rows[0].tax[0].tRet, r.rows[0].w[0].P2 * rr, 1);
// 5) 국민연금: 1971년생(55세) 법정 65세, 월 100만, 2년 연기 → +14.4%
const pp = base({ me: { age: 55, retireAge: 55, cash: 5e8, nps: 1e6, npsAge: 67 } });
r = E.simulateOnce(pp, E.ORDERS[0], 15e6);
eq('법정 나이 65', r.npsLegal[0], 65, 0);
eq('연기 2년 월 114.4만', r.npsMon[0], 1.144e6);
eq('67세부터 연 1,372.8만', r.rows[12].pub, 1.144e6 * 12);
eq('66세 공적연금 0', r.rows[11].pub, 0);
// 6) 공적연금 소득세: 연 1,372.8만 → 공제 4,90+(1372.8−700)×0.2=624.56 → 소득 748.24 − 150 = 598.24 × 6% − 7 → ×1.1
eq('공적연금 소득세', r.rows[12].pubTax, ((13728000 - (4.9e6 + (13728000 - 7e6) * 0.2) - 1.5e6) * 0.06 - 7e4) * 1.1, 1);
// 7) 모으는 시기: 52세, 60세 은퇴, 연 900만 공제 + 300만 초과 납입, 수익 0 → 8년 뒤 ③ 7,200만 ① 2,400만
r = E.simulateOnce(base({ me: { age: 52, cTc: 1.2e7 } }), E.ORDERS[0], 15e6);
eq('적립 ③ 7,200만', r.rows[7].bal[0].b3, 7.2e7);
eq('적립 ① 2,400만', r.rows[7].bal[0].b1, 2.4e7);
// 8) 건보료: 연 공적연금 1,372.8만(50%) + 집 공시가 5억(과표 2.2억 → 490점), 물가 0
r = E.simulateOnce(Object.assign(pp, { nhOn: true, house: 5e8 }), E.ORDERS[0], 15e6);
const nhm = E.nhRegional({ pub: [13728000], fin: [0], taxBase: 2.2e8 });
eq('건보료 67세 연액', r.rows[12].nh, nhm.total * 12, 1);
eq('건보료 소득분 (686.4만÷12×7.19%)', nhm.incPrem, 13728000 * 0.5 / 12 * 0.0719, 1);
// 9) 은퇴 직후 폭락: 1년차·2년차 −20%
r = E.simulateOnce(base({ crash: true, rPost: 0.05, me: { isa: 1e8 } }), E.ORDERS[0], 15e6);
eq('폭락 1년차 수익률', r.rows[0].r * 100, -20, 0);
eq('폭락 3년차 수익률', r.rows[2].r * 100, 5, 0);
eq('폭락 1년차 말 ISA (1억−1,200만)×0.8', r.rows[0].bal[0].F, 8.8e7 * 0.8);
// 10) 물가: 2.5%면 3년 뒤 생활비 1,200만×1.025^3
r = E.simulateOnce(base({ inf: 0.025, me: { cash: 5e8 } }), E.ORDERS[0], 15e6);
eq('물가 반영 생활비', r.rows[3].spend, 12e6 * Math.pow(1.025, 3));
// 11) 최대 생활비: 예금 3억, 60→89세(30년), 수익 0 → 월 83.33만
const ms = E.maxSpend(base({ endAge: 89, me: { cash: 3e8 } }));
eq('최대 월 생활비 3억/30년/12', ms, 3e8 / 30 / 12, 50);
// 12) 수령한도: 56세 ③ 1억 (n=2) → 한도 1억/9×1.2 = 1,333만 → 그 이상은 P3x(16.5%)
r = E.simulateOnce(base({ spend: 2e6, me: { age: 56, retireAge: 56, tc: 1e8 } }), E.ORDERS[0], 15e6);
eq('수령한도 안 ③ = 1,333.3만', r.rows[0].w[0].P3in, 1e8 / 9 * 1.2, 1);
eq('한도 넘긴 ③에 16.5%', r.rows[0].tax[0].tOth, r.rows[0].w[0].P3x * 0.165, 1);
// 13) 부부: 각자 1,500만원 기준
const cp = base({ spend: 2.5e6, persons: [
  { age: 60, retireAge: 60, income: true, sev: 0, sevYears: 1, sevMode: 'lump', tc: 3e8, ntc: 0, isa: 0, cash: 0, cTc: 0, cIsa: 0, nps: 0, npsAge: 65 },
  { age: 60, retireAge: 60, income: true, sev: 0, sevYears: 1, sevMode: 'lump', tc: 3e8, ntc: 0, isa: 0, cash: 0, cTc: 0, cIsa: 0, nps: 0, npsAge: 65 }] });
r = E.simulate(cp);
eq('부부 1년차 각자 1,500만원 이하', Math.max(r.rows[0].w[0].P3in, r.rows[0].w[1].P3in) <= 25e6 + 1 ? 1 : 0, 1, 0);
// 14) 전체 최적화는 버티는 나이가 순서 하나로 계산한 것보다 짧지 않다
const big = base({ inf: 0.025, rPost: 0.04, nhOn: true, house: 5e8, spend: 3.5e6, me: { age: 52, retireAge: 60, sev: 2e8, sevYears: 25, sevMode: 'irp', tc: 5e7, ntc: 2e7, isa: 5e7, cash: 3e7, cTc: 9e6, nps: 1.5e6, npsAge: 65 } });
const best = E.simulate(big); const one = E.simulateOnce(big, E.ORDERS[5], 15e6);
eq('최적 순서 ≥ 임의 순서', (best.depleteT ?? 999) >= (one.depleteT ?? 999) ? 1 : 0, 1, 0);
console.log('예시 결과: 고갈', best.deplAge, '순서', best.order.join('>'), 'cap', best.capNoPub / 1e4, '최대 월', Math.round(E.maxSpend(big) / 1e4));
console.log(fail ? `\n${fail} FAIL` : '\nALL PASS');
