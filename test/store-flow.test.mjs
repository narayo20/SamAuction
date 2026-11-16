import test from 'node:test';
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};

const { store, AUCTION_STATE, ORDER_STATE } = await import('../assets/store.js');

function closeToEnd(auctionId) {
  const auction = store.state.auctions.find((a) => a.id === auctionId);
  const target = new Date(auction.endsAt).getTime() + 1_000;
  store.setTimeOffset(target - Date.now());
  store.syncAuctions();
  return store.getAuction(auctionId);
}

test('월간 경매: 비공개 최대가 입찰 → 월말 자동 낙찰 → 에스크로 결제', () => {
  store.resetDemo();
  store.setTimeOffset(0);
  store.setCurrentUser('u_g_kim');
  const before = store.getAuction('a_1001');
  assert.equal(before.state, AUCTION_STATE.LIVE);
  assert.equal(before.bidCount, 4);

  const bid = store.placeSealedBid({
    auctionId: 'a_1001',
    studentProfileId: 'sp_hajun',
    amount: 36_000,
    regionCode: '서울 강남구',
    contact: '010-2456-7890',
    paymentMethodId: 'pm_kim1',
    guardianConsent: true,
  });
  assert.equal(bid.state, 'ACTIVE');

  const closed = closeToEnd('a_1001');
  assert.equal(closed.state, AUCTION_STATE.AWARDED);
  assert.equal(closed.finalPrice, 36_000);
  const order = closed.order;
  assert.ok(order);
  assert.equal(order.status, ORDER_STATE.PAID);
  assert.equal(order.amount, 144_000);
  assert.equal(order.commissionAmount, 14_400);
  const payment = store.paymentForOrder(order.id);
  assert.equal(payment.status, 'PAID');
  assert.equal(payment.escrow, 'HELD');
});

test('선착순: 결제 성공 즉시 낙찰, 수업 완료 후 정산', () => {
  store.resetDemo();
  store.setCurrentUser('u_g_kim');
  const before = store.getAuction('a_1002');
  assert.equal(before.state, AUCTION_STATE.LIVE);

  const begun = store.beginInstantBid('a_1002', {
    studentProfileId: 'sp_hajun',
    amount: 25_000,
    regionCode: '서울 마포구',
    contact: '010-2456-7890',
    paymentMethodId: 'pm_kim1',
    guardianConsent: true,
  });
  assert.equal(begun.price, 25_000);
  assert.equal(store.getAuction('a_1002').state, AUCTION_STATE.AWARD_PENDING);

  const order = store.confirmInstantAward(begun.bid.id, {
    brand: '국민카드',
    last4: '4242',
    tid: 'TID-TEST-1',
    receiptNo: 'R-TEST-1',
  });
  assert.equal(order.status, ORDER_STATE.PAID);
  assert.equal(order.amount, 100_000);
  const awarded = store.getAuction('a_1002');
  assert.equal(awarded.state, AUCTION_STATE.AWARDED);

  const future = new Date(Date.now() + 3 * 86_400_000);
  const date = future.toISOString().slice(0, 10);
  store.bookLesson(order.id, { date, time: '19:00' });
  assert.equal(store.orderById(order.id).status, ORDER_STATE.CONFIRMED);

  store.completeOrder(order.id);
  assert.equal(store.orderById(order.id).status, ORDER_STATE.COMPLETED);

  store.settleOrder(order.id);
  const settled = store.orderById(order.id);
  assert.equal(settled.status, ORDER_STATE.SETTLED);
  assert.equal(store.paymentForOrder(order.id).escrow, 'RELEASED');
  assert.equal(store.settlementForOrder(order.id).net, 90_000);
});

test('하락 경매: 현재가로 즉시 낙찰', () => {
  store.resetDemo();
  store.setCurrentUser('u_g_kim');
  const before = store.getAuction('a_1003');
  assert.equal(before.state, AUCTION_STATE.LIVE);
  assert.ok(before.currentPrice <= 28_000 && before.currentPrice >= 18_000);

  const begun = store.beginInstantBid('a_1003', {
    studentProfileId: 'sp_harin',
    amount: before.currentPrice,
    regionCode: '서울 서초구',
    contact: '010-2456-7890',
    paymentMethodId: 'pm_kim1',
    guardianConsent: true,
  });
  const order = store.confirmInstantAward(begun.bid.id);
  assert.equal(order.status, ORDER_STATE.PAID);
  assert.equal(order.amount, before.currentPrice * 4);
  assert.equal(store.getAuction('a_1003').state, AUCTION_STATE.AWARDED);
});

test('낙찰자 결제 실패 시 차순위 자동 낙찰', () => {
  store.resetDemo();
  store.setCurrentUser('u_g_kim');
  store.placeSealedBid({
    auctionId: 'a_1001',
    studentProfileId: 'sp_hajun',
    amount: 40_000,
    regionCode: '서울 강남구',
    contact: '010-2456-7890',
    paymentMethodId: 'pm_kim2',
    guardianConsent: true,
  });
  const closed = closeToEnd('a_1001');
  assert.equal(closed.state, AUCTION_STATE.AWARDED);
  assert.equal(closed.finalPrice, 34_000);
  assert.equal(closed.winner.bidderName, '서○○');
  assert.equal(closed.order.amount, 136_000);
  const failed = store.state.bids.find((b) => b.id === closed.myBid?.id || b.bidderName === '김하준' && b.auctionId === 'a_1001');
  assert.ok(failed);
  assert.ok(store.state.payments.some((p) => p.status === 'FAILED'));
});

test('프리미엄 끌올은 월 1회', () => {
  store.resetDemo();
  store.setCurrentUser('u_t_kim');
  assert.equal(store.bump('a_1001'), true);
  assert.throws(() => store.bump('a_1001'), (e) => e.code === 'BUMP_LIMIT');
  assert.equal(store.getAuction('a_1001').canBump, false);
});

test('선생님 경매 등록: 월간 사이클과 마지막 날 종료', () => {
  store.resetDemo();
  store.setCurrentUser('u_t_kim');
  const cycle = store.cycleNow();
  const created = store.createListing({
    title: '테스트 수학 경매',
    subject: '수학',
    description: '테스트 설명',
    emoji: '📐',
    mode: 'VISIT',
    regions: ['서울 강남구'],
    availability: [{ day: 1, start: '18:00', end: '21:00' }],
    method: 'SEALED_MAX',
    startPrice: 40_000,
    minIncrement: 1_000,
    cycleOffset: 0,
  });
  assert.equal(created.cycleMonth, cycle.auctionMonth);
  assert.equal(created.classMonth, cycle.classMonth);
  assert.equal(created.endsAt, cycle.auctionEnd.toISOString());
  assert.equal(created.state, AUCTION_STATE.LIVE);
});

test('수업 방식: 그룹 등록은 정원을 저장하고 잘못된 정원·방문 지역은 거부한다', () => {
  store.resetDemo();
  store.setCurrentUser('u_t_kim');
  const base = {
    title: '테스트 수업 방식',
    subject: '수학',
    description: '테스트 설명',
    emoji: '📐',
    availability: [{ day: 1, start: '18:00', end: '21:00' }],
    method: 'SEALED_MAX',
    startPrice: 40_000,
    minIncrement: 1_000,
    cycleOffset: 0,
  };

  const group = store.createListing({ ...base, mode: 'GROUP', groupSize: 3, regions: [] });
  const groupListing = store.listingById(group.listingId);
  assert.equal(groupListing.mode, 'GROUP');
  assert.equal(groupListing.groupSize, 3);

  const online = store.createListing({ ...base, mode: 'ONLINE', regions: [] });
  const onlineListing = store.listingById(online.listingId);
  assert.equal(onlineListing.mode, 'ONLINE');
  assert.equal(onlineListing.groupSize, null);

  assert.throws(
    () => store.createListing({ ...base, mode: 'GROUP', groupSize: 9, regions: [] }),
    (e) => e.code === 'INVALID_GROUP_SIZE',
  );
  assert.throws(
    () => store.createListing({ ...base, mode: 'VISIT', regions: [] }),
    (e) => e.code === 'INVALID_LESSON_MODE',
  );
});
