/**
 * 옥션&액션 — 경매 도메인 엔진 (프레임워크/의존성 없음)
 *
 * 핵심 규칙
 *  - 경매 사이클: 매월 1일 00:00:00 ~ 말일 23:59:59.999 (KST)
 *  - 수업 사이클: 낙찰 다음 달, 주 1회 60분 × 4회
 *  - 입찰 단위: 시간당 수업료(원). 결제 총액 = 낙찰 시간당 가격 × 4회
 *  - 방식: 비공개 최대가(2가격), 선착순, 하락(1시간 틱)
 */

export const HOUR_MS = 3_600_000;
export const KST_OFFSET_MS = 9 * HOUR_MS;
export const SESSIONS_PER_CYCLE = 4;
export const COMMISSION_RATE = 0.1;
export const DEFAULT_INCREMENT = 1_000;

export const BID_METHOD = Object.freeze({
  SEALED_MAX: 'SEALED_MAX',
  FIRST_COME: 'FIRST_COME',
  DUTCH: 'DUTCH',
});

export const AUCTION_STATE = Object.freeze({
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  LIVE: 'LIVE',
  CLOSING: 'CLOSING',
  AWARD_PENDING: 'AWARD_PENDING',
  AWARDED: 'AWARDED',
  UNSOLD: 'UNSOLD',
  CANCELLED: 'CANCELLED',
  VOIDED: 'VOIDED',
});

export const BID_STATE = Object.freeze({
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  ACTIVE: 'ACTIVE',
  SUPERSEDED: 'SUPERSEDED',
  CANCELLED: 'CANCELLED',
  WON: 'WON',
  LOST: 'LOST',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  VOIDED: 'VOIDED',
});

export const ORDER_STATE = Object.freeze({
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAID: 'PAID',
  CONFIRMED: 'CONFIRMED',
  COMPLETED: 'COMPLETED',
  SETTLED: 'SETTLED',
  CANCELLED: 'CANCELLED',
  DISPUTED: 'DISPUTED',
  REFUNDED: 'REFUNDED',
});

export const TRANSITIONS = Object.freeze({
  auction: {
    DRAFT: ['SCHEDULED', 'LIVE', 'CANCELLED'],
    SCHEDULED: ['LIVE', 'CANCELLED'],
    LIVE: ['CLOSING', 'AWARD_PENDING', 'CANCELLED'],
    CLOSING: ['AWARD_PENDING', 'UNSOLD', 'LIVE'],
    AWARD_PENDING: ['AWARDED', 'UNSOLD', 'LIVE'],
    AWARDED: ['VOIDED'],
    UNSOLD: [],
    CANCELLED: [],
    VOIDED: [],
  },
  bid: {
    PENDING_PAYMENT: ['ACTIVE', 'WON', 'PAYMENT_FAILED'],
    ACTIVE: ['SUPERSEDED', 'CANCELLED', 'WON', 'LOST'],
    WON: ['VOIDED'],
    PAYMENT_FAILED: [],
    SUPERSEDED: [],
    CANCELLED: [],
    LOST: [],
    VOIDED: [],
  },
  order: {
    PENDING_PAYMENT: ['PAID', 'PAYMENT_FAILED', 'CANCELLED'],
    PAYMENT_FAILED: ['PENDING_PAYMENT', 'CANCELLED'],
    PAID: ['CONFIRMED', 'CANCELLED', 'DISPUTED', 'REFUNDED'],
    CONFIRMED: ['COMPLETED', 'CANCELLED', 'DISPUTED', 'REFUNDED'],
    COMPLETED: ['SETTLED', 'DISPUTED', 'REFUNDED'],
    SETTLED: ['DISPUTED'],
    DISPUTED: ['COMPLETED', 'CANCELLED', 'REFUNDED'],
    CANCELLED: ['REFUNDED'],
    REFUNDED: [],
  },
});

export class DomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

const pad2 = (n) => String(n).padStart(2, '0');
const toTime = (v) => (v instanceof Date ? v.getTime() : typeof v === 'number' ? v : new Date(v).getTime());

function assertDate(v, name) {
  const t = toTime(v);
  if (!Number.isFinite(t)) throw new DomainError('INVALID_DATE', `${name} 값이 올바른 날짜가 아닙니다.`);
  return t;
}

export function assertWon(amount, name = '금액') {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new DomainError('INVALID_AMOUNT', `${name}은 1원 이상의 정수여야 합니다.`, { amount });
  }
}

/** KST 기준 연/월/일/시/분/초/밀리초 */
export function kstParts(value = new Date()) {
  const d = new Date(toTime(value) + KST_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    ms: d.getUTCMilliseconds(),
    dayOfWeek: d.getUTCDay(),
  };
}

/** KST 벽시계 시각 → UTC Date */
export function kstDate(year, monthIndex, day, hour = 0, minute = 0, second = 0, ms = 0) {
  return new Date(Date.UTC(year, monthIndex, day, hour, minute, second, ms) - KST_OFFSET_MS);
}

export function monthKey(value = new Date()) {
  const p = kstParts(value);
  return `${p.year}-${pad2(p.month + 1)}`;
}

export function addMonths(key, delta) {
  const [y, m] = String(key).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

export function monthLabel(key) {
  const [y, m] = String(key).split('-').map(Number);
  return `${y}년 ${m}월`;
}

/**
 * 경매 사이클 계산. offset 0 = 이번 달 경매, 1 = 다음 달 경매.
 * 경매는 이번 달 1일~말일, 수업은 다음 달.
 */
export function cycleFor(now = new Date(), offset = 0) {
  const p = kstParts(now);
  const auctionStart = kstDate(p.year, p.month + offset, 1, 0, 0, 0, 0);
  const nextStart = kstDate(p.year, p.month + offset + 1, 1, 0, 0, 0, 0);
  const auctionEnd = new Date(nextStart.getTime() - 1);
  const auctionMonth = monthKey(auctionStart);
  const classMonth = addMonths(auctionMonth, 1);
  const totalHours = Math.max(1, Math.ceil((auctionEnd.getTime() - auctionStart.getTime()) / HOUR_MS));
  return {
    offset,
    auctionMonth,
    auctionLabel: `${monthLabel(auctionMonth)} 경매`,
    auctionStart,
    auctionEnd,
    classMonth,
    classLabel: `${monthLabel(classMonth)} 수업권`,
    totalHours,
    lastDay: kstParts(auctionEnd).day,
  };
}

export function cycleOptions(now = new Date(), from = -2, to = 2) {
  const out = [];
  for (let i = from; i <= to; i += 1) out.push(cycleFor(now, i));
  return out;
}

/** 하락 경매 현재 시간당 가격 */
export function dutchPriceAt({
  startPrice,
  floorPrice,
  decrementPerHour,
  startsAt,
  now = new Date(),
  tickMs = HOUR_MS,
}) {
  assertWon(startPrice, '시작가');
  assertWon(floorPrice, '최저가');
  if (floorPrice > startPrice) {
    throw new DomainError('INVALID_DUTCH_TERMS', '최저가는 시작가보다 클 수 없습니다.');
  }
  if (!Number.isSafeInteger(decrementPerHour) || decrementPerHour < 0) {
    throw new DomainError('INVALID_DUTCH_TERMS', '시간당 하락액은 0 이상의 정수여야 합니다.');
  }
  const start = assertDate(startsAt, '하락 시작 시각');
  const current = assertDate(now, '현재 시각');
  if (current <= start) return startPrice;
  const ticks = Math.floor((current - start) / tickMs);
  return Math.max(floorPrice, startPrice - ticks * decrementPerHour);
}

/** 다음 가격 하락 시각. 최저가 도달/경매 종료 시 null */
export function nextDutchTickAt({
  startPrice,
  floorPrice,
  decrementPerHour,
  startsAt,
  endsAt,
  now = new Date(),
  tickMs = HOUR_MS,
}) {
  const start = assertDate(startsAt, '하락 시작 시각');
  const end = assertDate(endsAt, '경매 종료 시각');
  const current = assertDate(now, '현재 시각');
  if (current >= end) return null;
  if (current < start) return new Date(start);
  const ticks = Math.floor((current - start) / tickMs);
  const next = start + (ticks + 1) * tickMs;
  if (next >= end) return null;
  if (startPrice - (ticks + 1) * decrementPerHour <= floorPrice) return null;
  return new Date(next);
}

/** 월말까지 최저가에 도달하도록 시간당 하락액 자동 계산 */
export function computeDutchDecrement({ startPrice, floorPrice, startsAt, endsAt }) {
  assertWon(startPrice, '시작가');
  assertWon(floorPrice, '최저가');
  const hours = Math.max(1, Math.ceil((assertDate(endsAt, '종료') - assertDate(startsAt, '시작')) / HOUR_MS));
  if (floorPrice >= startPrice) return 0;
  return Math.max(1, Math.ceil((startPrice - floorPrice) / hours));
}

export function validateAuctionTerms({
  method,
  startPrice,
  floorPrice = null,
  decrementPerHour = 0,
  minIncrement = DEFAULT_INCREMENT,
  startsAt,
  endsAt,
}) {
  if (!Object.values(BID_METHOD).includes(method)) {
    throw new DomainError('INVALID_METHOD', '지원하지 않는 입찰 방식입니다.');
  }
  assertWon(startPrice, '시작가');
  const start = assertDate(startsAt, '경매 시작');
  const end = assertDate(endsAt, '경매 종료');
  if (end <= start) throw new DomainError('INVALID_SCHEDULE', '경매 종료는 시작보다 뒤여야 합니다.');
  if (method === BID_METHOD.DUTCH) {
    if (!Number.isSafeInteger(floorPrice) || floorPrice <= 0) {
      throw new DomainError('INVALID_DUTCH_TERMS', '하락 경매는 최저가가 필요합니다.');
    }
    if (floorPrice > startPrice) {
      throw new DomainError('INVALID_DUTCH_TERMS', '최저가는 시작가보다 클 수 없습니다.');
    }
    if (floorPrice < startPrice && (!Number.isSafeInteger(decrementPerHour) || decrementPerHour <= 0)) {
      throw new DomainError('INVALID_DUTCH_TERMS', '시간당 하락액은 1원 이상이어야 합니다.');
    }
  }
  if (method === BID_METHOD.SEALED_MAX) {
    if (!Number.isSafeInteger(minIncrement) || minIncrement <= 0) {
      throw new DomainError('INVALID_INCREMENT', '최소 입찰 단위는 1원 이상이어야 합니다.');
    }
  }
  return true;
}

/** 2가격 규칙: rank 후보가 낙찰됐을 때 지불할 시간당 가격 */
export function sealedPriceForRank(sortedBids, rankIndex, reservePrice, minIncrement) {
  const candidate = sortedBids[rankIndex];
  if (!candidate) return null;
  const next = sortedBids[rankIndex + 1];
  if (!next) return reservePrice;
  return Math.min(candidate.amount, Math.max(reservePrice, next.amount + minIncrement));
}

/**
 * 비공개 최대가 경매 종료 평가.
 * 최고가 낙찰, 지불가 = max(시작가, 차순위 최고가 + 단위)를 최고가로 cap.
 */
export function evaluateSealedAuction({ reservePrice, minIncrement = DEFAULT_INCREMENT, bids = [] }) {
  assertWon(reservePrice, '시작가');
  const valid = bids
    .filter((b) => (b.state ? b.state === BID_STATE.ACTIVE : true))
    .filter((b) => Number.isSafeInteger(b.amount) && b.amount >= reservePrice)
    .slice()
    .sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      const t = toTime(a.placedAt) - toTime(b.placedAt);
      if (t !== 0) return t;
      return String(a.id).localeCompare(String(b.id));
    });

  if (valid.length === 0) return { outcome: 'UNSOLD', ranking: [], finalPrice: null, winner: null };
  const ranking = valid.map((bid, index) => ({
    ...bid,
    rank: index + 1,
    priceIfWinner: sealedPriceForRank(valid, index, reservePrice, minIncrement),
  }));
  return {
    outcome: 'AWARDED',
    winner: ranking[0],
    winnerBidId: ranking[0].id,
    finalPrice: ranking[0].priceIfWinner,
    runnerUp: ranking[1] || null,
    ranking,
  };
}

/**
 * 입찰 유효성 검증. 성공 시 { ok, expectedPrice } 반환, 실패 시 DomainError.
 * auction: { state, method, startsAt, endsAt, startPrice, floorPrice,
 *            decrementPerHour, dutchStartsAt, minIncrement, teacherId, mode, regionCodes }
 * bidder: { userId, isMinor, guardianConsent, paymentMethodVerified }
 * bid: { amount, regionCode }
 */
export function validateBid({ auction, bid, bidder, now = new Date() }) {
  const current = assertDate(now, '현재 시각');
  const start = assertDate(auction.startsAt, '경매 시작');
  const end = assertDate(auction.endsAt, '경매 종료');

  if (auction.state !== AUCTION_STATE.LIVE) {
    throw new DomainError('AUCTION_NOT_LIVE', '현재 입찰할 수 없는 경매입니다.', { state: auction.state });
  }
  if (current < start) throw new DomainError('AUCTION_NOT_STARTED', '아직 경매가 시작되지 않았습니다.');
  if (current >= end) throw new DomainError('AUCTION_ENDED', '경매가 종료되었습니다.');
  if (bidder.userId && bidder.userId === auction.teacherId) {
    throw new DomainError('SELF_BID_FORBIDDEN', '본인의 경매에는 입찰할 수 없습니다.');
  }
  if (!bidder.paymentMethodVerified) {
    throw new DomainError('PAYMENT_METHOD_REQUIRED', '결제수단 확인이 필요합니다.');
  }
  if (bidder.isMinor && !bidder.guardianConsent) {
    throw new DomainError('GUARDIAN_CONSENT_REQUIRED', '미성년자는 보호자 동의가 필요합니다.');
  }
  if (
    auction.mode === 'VISIT' &&
    Array.isArray(auction.regionCodes) &&
    auction.regionCodes.length > 0 &&
    !auction.regionCodes.includes(bid.regionCode)
  ) {
    throw new DomainError('REGION_NOT_SERVED', '선생님의 방문 가능 지역이 아닙니다.', {
      regionCode: bid.regionCode,
      allowed: auction.regionCodes,
    });
  }
  assertWon(bid.amount, '입찰가');

  if (auction.method === BID_METHOD.SEALED_MAX) {
    if (bid.amount < auction.startPrice) {
      throw new DomainError('BID_TOO_LOW', '시작가 이상으로 입찰해야 합니다.', { min: auction.startPrice });
    }
    return { ok: true, expectedPrice: null };
  }

  if (auction.method === BID_METHOD.FIRST_COME) {
    if (bid.amount !== auction.startPrice) {
      throw new DomainError('PRICE_MISMATCH', '선착순 경매는 즉시 낙찰가와 같은 금액이어야 합니다.', {
        expectedPrice: auction.startPrice,
      });
    }
    return { ok: true, expectedPrice: auction.startPrice };
  }

  if (auction.method === BID_METHOD.DUTCH) {
    const expected = dutchPriceAt({
      startPrice: auction.startPrice,
      floorPrice: auction.floorPrice,
      decrementPerHour: auction.decrementPerHour,
      startsAt: auction.dutchStartsAt || auction.startsAt,
      now: current,
    });
    if (bid.amount !== expected) {
      throw new DomainError('PRICE_CHANGED', '가격이 변경되었습니다. 현재 가격을 확인해 주세요.', {
        expectedPrice: expected,
      });
    }
    return { ok: true, expectedPrice: expected };
  }

  throw new DomainError('INVALID_METHOD', '지원하지 않는 입찰 방식입니다.');
}

export function canTransition(kind, from, to) {
  return Boolean(TRANSITIONS[kind]?.[from]?.includes(to));
}

export function assertTransition(kind, from, to) {
  if (!canTransition(kind, from, to)) {
    throw new DomainError('INVALID_TRANSITION', `${kind} 상태를 ${from} → ${to}로 변경할 수 없습니다.`, {
      kind,
      from,
      to,
    });
  }
  return true;
}

export function monthlyTotal(hourlyPrice, sessions = SESSIONS_PER_CYCLE) {
  assertWon(hourlyPrice, '시간당 가격');
  if (!Number.isSafeInteger(sessions) || sessions <= 0) {
    throw new DomainError('INVALID_SESSIONS', '수업 횟수는 1 이상의 정수여야 합니다.');
  }
  return hourlyPrice * sessions;
}

export function commissionFor(amount, rate = COMMISSION_RATE) {
  assertWon(amount, '결제 금액');
  if (!(rate >= 0 && rate < 1)) throw new DomainError('INVALID_RATE', '수수료율이 올바르지 않습니다.');
  return Math.round(amount * rate);
}

export function won(n) {
  return `${Math.round(Number(n) || 0).toLocaleString('ko-KR')}원`;
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}일 ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}
