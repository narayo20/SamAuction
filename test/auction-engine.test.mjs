import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BID_METHOD,
  AUCTION_STATE,
  BID_STATE,
  DomainError,
  cycleFor,
  dutchPriceAt,
  nextDutchTickAt,
  computeDutchDecrement,
  evaluateSealedAuction,
  validateBid,
  monthlyTotal,
  commissionFor,
  canTransition,
  HOUR_MS,
} from '../src/domain/auction-engine.mjs';

const NOW = new Date('2026-11-13T12:00:00+09:00');

test('월간 사이클: 11월 경매는 11/1~11/30, 수업은 12월', () => {
  const c = cycleFor(NOW, 0);
  assert.equal(c.auctionMonth, '2026-11');
  assert.equal(c.classMonth, '2026-12');
  assert.equal(c.auctionStart.toISOString(), '2026-10-31T15:00:00.000Z');
  assert.equal(c.auctionEnd.toISOString(), '2026-11-30T14:59:59.999Z');
  assert.equal(c.lastDay, 30);
});

test('하락 가격: 시작 시각 전에는 시작가, 1시간마다 하락, 최저가 클램프', () => {
  const base = {
    startPrice: 30_000,
    floorPrice: 20_000,
    decrementPerHour: 1_000,
    startsAt: NOW,
  };
  assert.equal(dutchPriceAt({ ...base, now: new Date(NOW.getTime() - 1) }), 30_000);
  assert.equal(dutchPriceAt({ ...base, now: NOW }), 30_000);
  assert.equal(dutchPriceAt({ ...base, now: new Date(NOW.getTime() + HOUR_MS - 1) }), 30_000);
  assert.equal(dutchPriceAt({ ...base, now: new Date(NOW.getTime() + HOUR_MS) }), 29_000);
  assert.equal(dutchPriceAt({ ...base, now: new Date(NOW.getTime() + 10 * HOUR_MS) }), 20_000);
});

test('하락 가격: 다음 틱과 월말 도달 하락액 계산', () => {
  const startsAt = NOW;
  const endsAt = new Date(NOW.getTime() + 10 * HOUR_MS);
  const tick = nextDutchTickAt({
    startPrice: 30_000,
    floorPrice: 20_000,
    decrementPerHour: 500,
    startsAt,
    endsAt,
    now: startsAt,
  });
  assert.equal(tick.getTime(), startsAt.getTime() + HOUR_MS);
  const dec = computeDutchDecrement({ startPrice: 30_000, floorPrice: 20_000, startsAt, endsAt });
  assert.equal(dec, 1_000);
  assert.equal(dutchPriceAt({ startPrice: 30_000, floorPrice: 20_000, decrementPerHour: dec, startsAt, now: endsAt }), 20_000);
});

test('비공개 최대가: 입찰 없음 → 유찰', () => {
  const result = evaluateSealedAuction({ reservePrice: 30_000, bids: [] });
  assert.equal(result.outcome, 'UNSOLD');
});

test('비공개 최대가: 단독 입찰은 시작가로 낙찰', () => {
  const result = evaluateSealedAuction({
    reservePrice: 30_000,
    minIncrement: 1_000,
    bids: [{ id: 'b1', amount: 42_000, placedAt: NOW, state: BID_STATE.ACTIVE }],
  });
  assert.equal(result.outcome, 'AWARDED');
  assert.equal(result.winnerBidId, 'b1');
  assert.equal(result.finalPrice, 30_000);
});

test('비공개 최대가: 2가격 규칙과 최고가 cap', () => {
  const bids = [
    { id: 'b1', amount: 55_000, placedAt: NOW, state: BID_STATE.ACTIVE },
    { id: 'b2', amount: 52_000, placedAt: NOW, state: BID_STATE.ACTIVE },
    { id: 'b3', amount: 50_000, placedAt: NOW, state: BID_STATE.ACTIVE },
  ];
  const result = evaluateSealedAuction({ reservePrice: 40_000, minIncrement: 1_000, bids });
  assert.equal(result.winnerBidId, 'b1');
  assert.equal(result.finalPrice, 53_000);
  assert.equal(result.runnerUp.id, 'b2');
  assert.equal(result.runnerUp.priceIfWinner, 51_000);

  const capped = evaluateSealedAuction({
    reservePrice: 40_000,
    minIncrement: 1_000,
    bids: [
      { id: 'x', amount: 52_500, placedAt: NOW, state: BID_STATE.ACTIVE },
      { id: 'y', amount: 52_000, placedAt: NOW, state: BID_STATE.ACTIVE },
    ],
  });
  assert.equal(capped.finalPrice, 52_500);
});

test('비공개 최대가: 동점은 먼저 입찰한 사람이 낙찰', () => {
  const result = evaluateSealedAuction({
    reservePrice: 30_000,
    minIncrement: 1_000,
    bids: [
      { id: 'late', amount: 40_000, placedAt: new Date(NOW.getTime() + 1000), state: BID_STATE.ACTIVE },
      { id: 'early', amount: 40_000, placedAt: NOW, state: BID_STATE.ACTIVE },
    ],
  });
  assert.equal(result.winnerBidId, 'early');
  assert.equal(result.finalPrice, 40_000);
});

test('입찰 검증: 선착순/하락 가격 불일치와 자격 조건', () => {
  const auction = {
    state: AUCTION_STATE.LIVE,
    method: BID_METHOD.FIRST_COME,
    startsAt: new Date(NOW.getTime() - HOUR_MS),
    endsAt: new Date(NOW.getTime() + HOUR_MS),
    startPrice: 25_000,
    teacherId: 'teacher',
    mode: 'VISIT',
    regionCodes: ['서울 마포구'],
  };
  const bidder = { userId: 'guardian', isMinor: true, guardianConsent: true, paymentMethodVerified: true };
  assert.deepEqual(validateBid({ auction, bid: { amount: 25_000, regionCode: '서울 마포구' }, bidder, now: NOW }), {
    ok: true,
    expectedPrice: 25_000,
  });
  assert.throws(
    () => validateBid({ auction, bid: { amount: 24_000, regionCode: '서울 마포구' }, bidder, now: NOW }),
    (e) => e instanceof DomainError && e.code === 'PRICE_MISMATCH',
  );
  assert.throws(
    () => validateBid({ auction, bid: { amount: 25_000, regionCode: '서울 강남구' }, bidder, now: NOW }),
    (e) => e.code === 'REGION_NOT_SERVED',
  );
  assert.throws(
    () => validateBid({ auction, bid: { amount: 25_000, regionCode: '서울 마포구' }, bidder: { ...bidder, guardianConsent: false }, now: NOW }),
    (e) => e.code === 'GUARDIAN_CONSENT_REQUIRED',
  );
});

test('입찰 검증: 하락 가격은 서버 현재가와 일치해야 함', () => {
  const auction = {
    state: AUCTION_STATE.LIVE,
    method: BID_METHOD.DUTCH,
    startsAt: new Date(NOW.getTime() - 2 * HOUR_MS),
    dutchStartsAt: new Date(NOW.getTime() - 2 * HOUR_MS),
    endsAt: new Date(NOW.getTime() + HOUR_MS),
    startPrice: 30_000,
    floorPrice: 20_000,
    decrementPerHour: 1_000,
    teacherId: 'teacher',
    mode: 'ONLINE',
    regionCodes: [],
  };
  const bidder = { userId: 'guardian', isMinor: false, guardianConsent: true, paymentMethodVerified: true };
  assert.equal(validateBid({ auction, bid: { amount: 28_000, regionCode: '서울' }, bidder, now: NOW }).expectedPrice, 28_000);
  assert.throws(
    () => validateBid({ auction, bid: { amount: 29_000, regionCode: '서울' }, bidder, now: NOW }),
    (e) => e.code === 'PRICE_CHANGED' && e.details.expectedPrice === 28_000,
  );
});

test('수업료/수수료/상태 전이', () => {
  assert.equal(monthlyTotal(30_000), 120_000);
  assert.equal(commissionFor(120_000), 12_000);
  assert.equal(canTransition('auction', 'LIVE', 'CLOSING'), true);
  assert.equal(canTransition('auction', 'AWARDED', 'LIVE'), false);
  assert.equal(canTransition('order', 'PAID', 'CONFIRMED'), true);
  assert.equal(canTransition('order', 'REFUNDED', 'PAID'), false);
});
