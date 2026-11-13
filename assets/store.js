import {
  BID_METHOD,
  AUCTION_STATE,
  BID_STATE,
  ORDER_STATE,
  DomainError,
  cycleFor,
  dutchPriceAt,
  nextDutchTickAt,
  computeDutchDecrement,
  evaluateSealedAuction,
  validateBid,
  validateAuctionTerms,
  monthlyTotal,
  commissionFor,
  kstDate,
  SESSIONS_PER_CYCLE,
  HOUR_MS,
} from '../src/domain/auction-engine.mjs';
import { buildSeed, SEED_VERSION } from './seed.js';

const STORAGE_KEY = 'auction-action-demo-v1';
const memory = new Map();

const storage = {
  get(key) {
    try {
      if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
    } catch {
      /* ignore */
    }
    return memory.get(key) ?? null;
  },
  set(key, value) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
        return;
      }
    } catch {
      /* ignore */
    }
    memory.set(key, value);
  },
  remove(key) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    memory.delete(key);
  },
};

let state = loadState();

function loadState() {
  const raw = storage.get(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.meta?.seedVersion === SEED_VERSION) return parsed;
    } catch {
      /* ignore */
    }
  }
  const seeded = buildSeed(new Date());
  storage.set(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

function save() {
  storage.set(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix) {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${id}`;
}

function iso(value) {
  return new Date(value).toISOString();
}

function now() {
  return new Date(Date.now() + (state.demo?.offsetMs || 0));
}

function addEvent(auctionId, type, text) {
  state.events.unshift({
    id: uid('e'),
    auctionId,
    type,
    text,
    createdAt: iso(now()),
  });
  state.events = state.events.slice(0, 400);
}

function maskName(name) {
  if (!name) return '익명';
  return `${String(name).slice(0, 1)}○○`;
}

function currentUser() {
  return state.users.find((u) => u.id === state.currentUserId) || state.users[0];
}

function teacherProfile(userId) {
  return state.users.find((u) => u.id === userId)?.teacherProfile || null;
}

function listingOf(auction) {
  return state.listings.find((l) => l.id === auction.listingId) || null;
}

function guardianOf(studentProfileId) {
  const profile = state.studentProfiles.find((p) => p.id === studentProfileId);
  return profile ? state.users.find((u) => u.id === profile.guardianId) : null;
}

function paymentMethodOf(id) {
  return state.paymentMethods.find((p) => p.id === id) || null;
}

function myStudentIds(user = currentUser()) {
  return state.studentProfiles.filter((p) => p.guardianId === user.id).map((p) => p.id);
}

function publicBidCount(auction) {
  return state.bids.filter(
    (b) =>
      b.auctionId === auction.id &&
      b.state !== BID_STATE.CANCELLED &&
      b.state !== BID_STATE.SUPERSEDED,
  ).length;
}

function activeBids(auctionId) {
  return state.bids.filter((b) => b.auctionId === auctionId && b.state === BID_STATE.ACTIVE);
}

function myBidFor(auction, user = currentUser()) {
  const ids = myStudentIds(user);
  if (ids.length === 0) return null;
  return (
    state.bids
      .filter(
        (b) =>
          b.auctionId === auction.id &&
          ids.includes(b.studentProfileId) &&
          ![BID_STATE.CANCELLED, BID_STATE.SUPERSEDED, BID_STATE.LOST].includes(b.state),
      )
      .sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt))[0] || null
  );
}

function orderForAuction(auctionId) {
  return state.orders.find((o) => o.auctionId === auctionId) || null;
}

function hydrate(auction, user = currentUser()) {
  const listing = listingOf(auction);
  const teacher = teacherProfile(auction.teacherId);
  const myBid = myBidFor(auction, user);
  const winnerBid = state.bids.find((b) => b.id === auction.awardedBidId) || null;
  const currentPrice =
    auction.method === BID_METHOD.DUTCH
      ? dutchPriceAt({
          startPrice: auction.startPrice,
          floorPrice: auction.floorPrice,
          decrementPerHour: auction.decrementPerHour,
          startsAt: auction.priceStartsAt || auction.startsAt,
          now: now(),
        })
      : auction.method === BID_METHOD.FIRST_COME
        ? auction.startPrice
        : null;
  const nextTick =
    auction.method === BID_METHOD.DUTCH
      ? nextDutchTickAt({
          startPrice: auction.startPrice,
          floorPrice: auction.floorPrice,
          decrementPerHour: auction.decrementPerHour,
          startsAt: auction.priceStartsAt || auction.startsAt,
          endsAt: auction.endsAt,
          now: now(),
        })
      : null;
  const order = orderForAuction(auction.id);
  const isOwner = user.id === auction.teacherId;
  const isAdmin = user.role === 'ADMIN';
  const teacherUser = state.users.find((u) => u.id === auction.teacherId);
  const canSeeSealed =
    isAdmin ||
    auction.state === AUCTION_STATE.AWARDED ||
    auction.state === AUCTION_STATE.UNSOLD ||
    Boolean(myBid);
  return {
    ...auction,
    listing,
    teacher,
    teacherPremium: Boolean(teacherUser?.premium),
    teacherUser,
    bidCount: publicBidCount(auction),
    myBid,
    winner: winnerBid
      ? {
          ...winnerBid,
          bidderName: maskName(winnerBid.bidderName),
          guardianName: maskName(winnerBid.guardianName),
        }
      : null,
    currentPrice,
    monthlyAtCurrent: currentPrice ? monthlyTotal(currentPrice, auction.sessions) : null,
    nextTickAt: nextTick ? iso(nextTick) : null,
    order,
    isOwner,
    isAdmin,
    canSeeSealed,
    canBump:
      isOwner &&
      Boolean(teacher?.displayName) &&
      Boolean(state.users.find((u) => u.id === auction.teacherId)?.premium) &&
      [AUCTION_STATE.LIVE, AUCTION_STATE.SCHEDULED].includes(auction.state) &&
      !state.bumpHistory.some(
        (h) => h.teacherId === auction.teacherId && h.period === auction.cycleMonth,
      ),
    hasBumpedThisPeriod: state.bumpHistory.some(
      (h) => h.teacherId === auction.teacherId && h.period === auction.cycleMonth,
    ),
  };
}

function recordFailedPayment(auction, bid, amount, reason) {
  const pm = paymentMethodOf(bid.paymentMethodId);
  state.payments.unshift({
    id: uid('p'),
    orderId: null,
    auctionId: auction.id,
    bidId: bid.id,
    amount,
    status: 'FAILED',
    escrow: null,
    brand: pm?.brand || '-',
    last4: pm?.last4 || '----',
    tid: null,
    receiptNo: null,
    failureReason: reason,
    approvedAt: null,
    createdAt: iso(now()),
  });
}

function finalizeAward(auction, bid, price, pm) {
  const amount = monthlyTotal(price, auction.sessions);
  const commission = commissionFor(amount);
  const order = {
    id: uid('o'),
    auctionId: auction.id,
    bidId: bid.id,
    teacherId: auction.teacherId,
    guardianId: bid.guardianId,
    studentProfileId: bid.studentProfileId,
    hourlyPrice: price,
    sessions: auction.sessions,
    amount,
    commissionRate: 0.1,
    commissionAmount: commission,
    status: ORDER_STATE.PAID,
    createdAt: iso(now()),
    paidAt: iso(now()),
    lessonAt: null,
    confirmedAt: null,
    completedAt: null,
    settledAt: null,
  };
  const payment = {
    id: uid('p'),
    orderId: order.id,
    auctionId: auction.id,
    bidId: bid.id,
    amount,
    status: 'PAID',
    escrow: 'HELD',
    brand: pm.brand,
    last4: pm.last4,
    tid: `TID${Date.now()}`,
    receiptNo: `R-${iso(now()).slice(0, 10).replaceAll('-', '')}-${String(state.payments.length + 1).padStart(4, '0')}`,
    approvedAt: iso(now()),
    createdAt: iso(now()),
  };
  state.orders.unshift(order);
  state.payments.unshift(payment);
  bid.state = BID_STATE.WON;
  auction.state = AUCTION_STATE.AWARDED;
  auction.awardedBidId = bid.id;
  auction.finalPrice = price;
  auction.endedAt = auction.endedAt || iso(now());
  auction.pendingBidId = null;
  auction.pendingPrice = null;
  auction.pendingSince = null;
  for (const other of state.bids) {
    if (other.auctionId === auction.id && other.id !== bid.id && other.state === BID_STATE.ACTIVE) {
      other.state = BID_STATE.LOST;
    }
  }
  addEvent(
    auction.id,
    'AWARD',
    `낙찰: ${maskName(bid.bidderName)} · 시간당 ${price.toLocaleString('ko-KR')}원 · 월 ${amount.toLocaleString('ko-KR')}원`,
  );
  return order;
}

function closeSealed(auction) {
  const result = evaluateSealedAuction({
    reservePrice: auction.startPrice,
    minIncrement: auction.minIncrement || 1_000,
    bids: activeBids(auction.id),
  });
  if (result.outcome === 'UNSOLD') {
    auction.state = AUCTION_STATE.UNSOLD;
    auction.endedAt = iso(now());
    for (const bid of activeBids(auction.id)) bid.state = BID_STATE.LOST;
    addEvent(auction.id, 'UNSOLD', '입찰자가 없어 유찰되었습니다.');
    return { outcome: 'UNSOLD' };
  }

  auction.state = AUCTION_STATE.AWARD_PENDING;
  auction.pendingSince = iso(now());
  addEvent(auction.id, 'CLOSING', '경매가 마감되어 낙찰 처리를 시작합니다.');

  for (const ranked of result.ranking) {
    const bid = state.bids.find((b) => b.id === ranked.id);
    if (!bid || bid.state !== BID_STATE.ACTIVE) continue;
    const pm = paymentMethodOf(bid.paymentMethodId);
    const amount = monthlyTotal(ranked.priceIfWinner, auction.sessions);
    if (!pm || pm.willFail) {
      bid.state = BID_STATE.PAYMENT_FAILED;
      recordFailedPayment(auction, bid, amount, '카드 승인 거절 (모의 PG)');
      addEvent(
        auction.id,
        'PAYMENT_FAILED',
        `${maskName(bid.bidderName)}님의 결제가 실패하여 차순위 후보를 확인합니다.`,
      );
      continue;
    }
    const order = finalizeAward(auction, bid, ranked.priceIfWinner, pm);
    return { outcome: 'AWARDED', order, bid };
  }

  auction.state = AUCTION_STATE.UNSOLD;
  auction.endedAt = iso(now());
  auction.pendingSince = null;
  for (const bid of activeBids(auction.id)) bid.state = BID_STATE.LOST;
  addEvent(auction.id, 'UNSOLD', '모든 결제 시도가 실패하여 유찰되었습니다.');
  return { outcome: 'UNSOLD' };
}

function closeAuctionInternal(auction) {
  if (![AUCTION_STATE.LIVE, AUCTION_STATE.CLOSING, AUCTION_STATE.SCHEDULED].includes(auction.state)) {
    return false;
  }
  auction.state = AUCTION_STATE.CLOSING;
  auction.endedAt = iso(now());
  if (auction.method === BID_METHOD.SEALED_MAX) {
    closeSealed(auction);
    return true;
  }
  const pending = state.bids.find(
    (b) => b.auctionId === auction.id && b.state === BID_STATE.PENDING_PAYMENT,
  );
  if (pending) {
    pending.state = BID_STATE.PAYMENT_FAILED;
    recordFailedPayment(
      auction,
      pending,
      monthlyTotal(auction.pendingPrice || auction.startPrice, auction.sessions),
      '결제 확인 시간 초과',
    );
  }
  auction.state = AUCTION_STATE.UNSOLD;
  auction.endedAt = iso(now());
  auction.pendingBidId = null;
  auction.pendingPrice = null;
  auction.pendingSince = null;
  addEvent(auction.id, 'UNSOLD', '입찰자가 없어 유찰되었습니다.');
  return true;
}

function syncAuctions() {
  const t = now();
  let changed = false;
  for (const auction of [...state.auctions]) {
    if (
      auction.state === AUCTION_STATE.SCHEDULED &&
      t >= new Date(auction.startsAt) &&
      t < new Date(auction.endsAt)
    ) {
      auction.state = AUCTION_STATE.LIVE;
      addEvent(auction.id, 'START', '경매가 시작되었습니다.');
      changed = true;
    }
    if (
      auction.state === AUCTION_STATE.AWARD_PENDING &&
      auction.pendingSince &&
      t.getTime() - new Date(auction.pendingSince).getTime() > 120_000
    ) {
      const pending = state.bids.find((b) => b.id === auction.pendingBidId);
      if (pending) pending.state = BID_STATE.PAYMENT_FAILED;
      if (t < new Date(auction.endsAt)) {
        auction.state = AUCTION_STATE.LIVE;
        addEvent(auction.id, 'RECOVER', '결제 확인이 지연되어 경매를 다시 엽니다.');
      } else {
        auction.state = AUCTION_STATE.UNSOLD;
        addEvent(auction.id, 'UNSOLD', '결제 확인이 완료되지 않아 유찰되었습니다.');
      }
      auction.pendingBidId = null;
      auction.pendingPrice = null;
      auction.pendingSince = null;
      changed = true;
    }
    const demoEnded = auction.demoCloseAt && t >= new Date(auction.demoCloseAt);
    if (
      [AUCTION_STATE.LIVE, AUCTION_STATE.SCHEDULED].includes(auction.state) &&
      (t >= new Date(auction.endsAt) || demoEnded)
    ) {
      closeAuctionInternal(auction);
      changed = true;
    }
  }
  if (changed) save();
  return changed;
}

function makeBidder(user, studentProfileId, guardianConsent) {
  const profile = state.studentProfiles.find((p) => p.id === studentProfileId);
  if (!profile) throw new DomainError('PROFILE_NOT_FOUND', '학생 프로필을 찾을 수 없습니다.');
  if (profile.guardianId !== user.id) {
    throw new DomainError('FORBIDDEN', '본인 보호자 계정의 학생만 입찰할 수 있습니다.');
  }
  return {
    userId: user.id,
    isMinor: profile.isMinor,
    guardianConsent,
    paymentMethodVerified: true,
  };
}

function validateForAuction(auction, { studentProfileId, amount, regionCode, guardianConsent }, user) {
  const bidder = makeBidder(user, studentProfileId, guardianConsent);
  const listing = listingOf(auction);
  const bid = { amount, regionCode };
  const result = validateBid({
    auction: {
      ...auction,
      mode: listing?.mode || 'ONLINE',
      regionCodes: listing?.regions || [],
      dutchStartsAt: auction.priceStartsAt || auction.startsAt,
    },
    bid,
    bidder,
    now: now(),
  });
  return { bidder, result };
}

function ensurePaymentMethod(userId, paymentMethodId) {
  const pm = paymentMethodOf(paymentMethodId);
  if (!pm || pm.ownerId !== userId || !pm.verified) {
    throw new DomainError('PAYMENT_METHOD_REQUIRED', '결제수단 확인이 필요합니다.');
  }
  return pm;
}

function instantBid(auctionId, payload) {
  syncAuctions();
  const user = currentUser();
  if (user.role !== 'GUARDIAN') throw new DomainError('FORBIDDEN', '보호자 계정으로만 입찰할 수 있습니다.');
  const auction = state.auctions.find((a) => a.id === auctionId);
  if (!auction) throw new DomainError('AUCTION_NOT_FOUND', '경매를 찾을 수 없습니다.');
  if (auction.state !== AUCTION_STATE.LIVE) {
    throw new DomainError('AUCTION_NOT_LIVE', '현재 입찰할 수 없는 경매입니다.');
  }
  if (auction.pendingBidId) {
    throw new DomainError('AWARD_IN_PROGRESS', '다른 사용자의 결제를 확인 중입니다. 잠시 후 다시 시도해 주세요.');
  }
  ensurePaymentMethod(user.id, payload.paymentMethodId);
  const { result } = validateForAuction(
    auction,
    {
      studentProfileId: payload.studentProfileId,
      amount: payload.amount,
      regionCode: payload.regionCode,
      guardianConsent: payload.guardianConsent,
    },
    user,
  );
  const profile = state.studentProfiles.find((p) => p.id === payload.studentProfileId);
  const bid = {
    id: uid('b'),
    auctionId,
    studentProfileId: profile.id,
    guardianId: user.id,
    bidderName: profile.name,
    guardianName: user.name,
    region: payload.regionCode,
    amount: payload.amount,
    contact: payload.contact || user.phone,
    paymentMethodId: payload.paymentMethodId,
    state: BID_STATE.PENDING_PAYMENT,
    placedAt: iso(now()),
    isRival: false,
    guardianConsent: true,
  };
  state.bids.push(bid);
  auction.state = AUCTION_STATE.AWARD_PENDING;
  auction.pendingBidId = bid.id;
  auction.pendingPrice = result.expectedPrice ?? payload.amount;
  auction.pendingSince = iso(now());
  addEvent(auctionId, 'PAYMENT', '결제 확인 중입니다. 승인되면 즉시 낙찰됩니다.');
  save();
  return { bid, auction, price: auction.pendingPrice, monthlyAmount: monthlyTotal(auction.pendingPrice, auction.sessions) };
}

export const store = {
  get state() {
    return state;
  },
  get now() {
    return now();
  },
  bootstrap() {
    syncAuctions();
    save();
  },
  resetDemo() {
    state = buildSeed(new Date());
    save();
    return state;
  },
  save,
  currentUser,
  setCurrentUser(id) {
    if (state.users.some((u) => u.id === id)) {
      state.currentUserId = id;
      save();
    }
    return currentUser();
  },
  userById(id) {
    return state.users.find((u) => u.id === id) || null;
  },
  studentProfiles(user = currentUser()) {
    return state.studentProfiles.filter((p) => p.guardianId === user.id);
  },
  paymentMethods(user = currentUser()) {
    return state.paymentMethods.filter((p) => p.ownerId === user.id);
  },
  registerPaymentMethod({ number, exp, cvc, password, ownerName }) {
    const user = currentUser();
    if (user.role !== 'GUARDIAN') throw new DomainError('FORBIDDEN', '보호자 계정만 카드를 등록할 수 있습니다.');
    const digits = String(number || '').replace(/\D/g, '');
    if (digits.length !== 16) throw new DomainError('INVALID_CARD', '카드 번호 16자리를 입력해 주세요.');
    if (!/^\d{2}\/\d{2}$/.test(String(exp || ''))) throw new DomainError('INVALID_CARD', '유효기간을 MM/YY 형식으로 입력해 주세요.');
    if (!/^\d{3,4}$/.test(String(cvc || ''))) throw new DomainError('INVALID_CARD', 'CVC 3~4자리를 입력해 주세요.');
    if (!/^\d{2}$/.test(String(password || ''))) throw new DomainError('INVALID_CARD', '카드 비밀번호 앞 2자리를 입력해 주세요.');
    if (!String(ownerName || '').trim()) throw new DomainError('INVALID_CARD', '카드 소유자 이름을 입력해 주세요.');
    const [mm, yy] = String(exp).split('/').map(Number);
    const expiry = new Date(2000 + yy, mm, 1);
    if (mm < 1 || mm > 12 || expiry <= new Date()) {
      throw new DomainError('INVALID_CARD', '카드 유효기간이 만료되었습니다.');
    }
    const last4 = digits.slice(-4);
    const first = digits[0];
    const brand = first === '4' ? 'VISA' : first === '5' ? 'Mastercard' : first === '3' ? 'AMEX' : '국내카드';
    const pm = {
      id: uid('pm'),
      ownerId: user.id,
      brand,
      last4,
      exp,
      verified: true,
      willFail: last4 === '0002' || digits === '4000000000000002',
      createdAt: iso(now()),
    };
    state.paymentMethods.push(pm);
    save();
    return pm;
  },
  addStudentProfile({ name, grade, region }) {
    const user = currentUser();
    if (user.role !== 'GUARDIAN') throw new DomainError('FORBIDDEN', '보호자 계정만 학생을 등록할 수 있습니다.');
    const limit = user.premium ? 5 : 1;
    const count = state.studentProfiles.filter((p) => p.guardianId === user.id).length;
    if (count >= limit) {
      throw new DomainError(
        'PROFILE_LIMIT',
        user.premium
          ? '프리미엄 학생은 최대 5명까지 등록할 수 있습니다.'
          : '일반 학생은 1명만 등록할 수 있습니다. 프리미엄으로 업그레이드해 주세요.',
      );
    }
    if (!String(name || '').trim()) throw new DomainError('INVALID_PROFILE', '학생 이름을 입력해 주세요.');
    const profile = {
      id: uid('sp'),
      guardianId: user.id,
      name: String(name).trim(),
      grade: String(grade || '').trim() || '학년 미입력',
      region: String(region || '').trim() || '지역 미입력',
      phone: user.phone,
      isMinor: true,
      createdAt: iso(now()),
    };
    state.studentProfiles.push(profile);
    save();
    return profile;
  },
  togglePremium(userId = currentUser().id) {
    const user = state.users.find((u) => u.id === userId);
    if (!user || !['TEACHER', 'GUARDIAN'].includes(user.role)) {
      throw new DomainError('FORBIDDEN', '프리미엄을 변경할 수 없는 계정입니다.');
    }
    user.premium = !user.premium;
    user.premiumUntil = user.premium
      ? iso(new Date(now().getTime() + 30 * 86_400_000))
      : null;
    save();
    return user;
  },
  syncAuctions,
  listAuctions() {
    syncAuctions();
    return state.auctions.map((a) => hydrate(a));
  },
  getAuction(id) {
    syncAuctions();
    const auction = state.auctions.find((a) => a.id === id);
    return auction ? hydrate(auction) : null;
  },
  bidFeed(auctionId, limit = 8) {
    return state.events
      .filter((e) => e.auctionId === auctionId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  },
  placeSealedBid({ auctionId, studentProfileId, amount, regionCode, contact, paymentMethodId, guardianConsent }) {
    syncAuctions();
    const user = currentUser();
    if (user.role !== 'GUARDIAN') throw new DomainError('FORBIDDEN', '보호자 계정으로만 입찰할 수 있습니다.');
    const auction = state.auctions.find((a) => a.id === auctionId);
    if (!auction) throw new DomainError('AUCTION_NOT_FOUND', '경매를 찾을 수 없습니다.');
    if (auction.method !== BID_METHOD.SEALED_MAX) {
      throw new DomainError('INVALID_METHOD', '비공개 최대가 경매가 아닙니다.');
    }
    ensurePaymentMethod(user.id, paymentMethodId);
    validateForAuction(
      auction,
      { studentProfileId, amount, regionCode, guardianConsent },
      user,
    );
    const profile = state.studentProfiles.find((p) => p.id === studentProfileId);
    const existing = state.bids.find(
      (b) =>
        b.auctionId === auctionId &&
        b.studentProfileId === studentProfileId &&
        b.state === BID_STATE.ACTIVE,
    );
    if (existing) {
      existing.amount = amount;
      existing.region = regionCode;
      existing.contact = contact || user.phone;
      existing.paymentMethodId = paymentMethodId;
      existing.placedAt = iso(now());
      addEvent(auctionId, 'BID', `${maskName(profile.name)}님이 최대가를 수정했습니다. (비공개)`);
      save();
      return existing;
    }
    const bid = {
      id: uid('b'),
      auctionId,
      studentProfileId,
      guardianId: user.id,
      bidderName: profile.name,
      guardianName: user.name,
      region: regionCode,
      amount,
      contact: contact || user.phone,
      paymentMethodId,
      state: BID_STATE.ACTIVE,
      placedAt: iso(now()),
      isRival: false,
      guardianConsent: true,
    };
    state.bids.push(bid);
    addEvent(auctionId, 'BID', `${maskName(profile.name)}님이 비공개 입찰했습니다. (총 ${publicBidCount(auction)}건)`);
    save();
    return bid;
  },
  cancelBid(bidId) {
    const bid = state.bids.find((b) => b.id === bidId);
    if (!bid) throw new DomainError('BID_NOT_FOUND', '입찰을 찾을 수 없습니다.');
    const auction = state.auctions.find((a) => a.id === bid.auctionId);
    if (!auction || auction.state !== AUCTION_STATE.LIVE) {
      throw new DomainError('AUCTION_NOT_LIVE', '진행 중인 경매에서만 취소할 수 있습니다.');
    }
    if (bid.state !== BID_STATE.ACTIVE) throw new DomainError('INVALID_BID_STATE', '취소할 수 없는 입찰입니다.');
    bid.state = BID_STATE.CANCELLED;
    addEvent(auction.id, 'BID_CANCEL', `${maskName(bid.bidderName)}님이 입찰을 취소했습니다.`);
    save();
    return true;
  },
  beginInstantBid(auctionId, payload) {
    return instantBid(auctionId, payload);
  },
  confirmInstantAward(bidId, { brand, last4, tid, receiptNo } = {}) {
    const bid = state.bids.find((b) => b.id === bidId);
    if (!bid) throw new DomainError('BID_NOT_FOUND', '입찰을 찾을 수 없습니다.');
    const auction = state.auctions.find((a) => a.id === bid.auctionId);
    if (!auction || auction.state !== AUCTION_STATE.AWARD_PENDING || auction.pendingBidId !== bidId) {
      throw new DomainError('AWARD_NOT_PENDING', '낙찰 처리 중인 입찰이 아닙니다.');
    }
    const pm = paymentMethodOf(bid.paymentMethodId);
    const order = finalizeAward(auction, bid, auction.pendingPrice, {
      brand: brand || pm?.brand || '카드',
      last4: last4 || pm?.last4 || '----',
    });
    const payment = state.payments.find((p) => p.orderId === order.id);
    if (payment && tid) payment.tid = tid;
    if (payment && receiptNo) payment.receiptNo = receiptNo;
    save();
    return order;
  },
  failInstantAward(bidId, reason = '카드 승인 거절') {
    const bid = state.bids.find((b) => b.id === bidId);
    if (!bid) return false;
    const auction = state.auctions.find((a) => a.id === bid.auctionId);
    if (!auction || auction.pendingBidId !== bidId) return false;
    bid.state = BID_STATE.PAYMENT_FAILED;
    recordFailedPayment(
      auction,
      bid,
      monthlyTotal(auction.pendingPrice || auction.startPrice, auction.sessions),
      reason,
    );
    if (now() < new Date(auction.endsAt)) {
      auction.state = AUCTION_STATE.LIVE;
    } else {
      auction.state = AUCTION_STATE.UNSOLD;
    }
    auction.pendingBidId = null;
    auction.pendingPrice = null;
    auction.pendingSince = null;
    addEvent(auction.id, 'PAYMENT_FAILED', `결제가 실패했습니다: ${reason}`);
    save();
    return true;
  },
  addRivalBid(auctionId) {
    syncAuctions();
    const auction = state.auctions.find((a) => a.id === auctionId);
    if (!auction || auction.state !== AUCTION_STATE.LIVE || auction.method !== BID_METHOD.SEALED_MAX) {
      return null;
    }
    const active = activeBids(auctionId);
    const used = new Set(active.map((b) => b.studentProfileId));
    const candidates = state.studentProfiles.filter(
      (p) => p.guardianId !== currentUser().id && !used.has(p.id),
    );
    if (candidates.length === 0) return null;
    const profile = candidates[Math.floor(Math.random() * candidates.length)];
    const guardian = state.users.find((u) => u.id === profile.guardianId);
    const pm = state.paymentMethods.find((p) => p.ownerId === guardian.id && !p.willFail);
    if (!pm) return null;
    const highest = active.reduce((max, b) => Math.max(max, b.amount), auction.startPrice);
    const amount = Math.ceil((highest + 1_000 + Math.floor(Math.random() * 4) * 1_000) / 1_000) * 1_000;
    const bid = {
      id: uid('b'),
      auctionId,
      studentProfileId: profile.id,
      guardianId: guardian.id,
      bidderName: profile.name,
      guardianName: guardian.name,
      region: profile.region,
      amount,
      contact: guardian.phone,
      paymentMethodId: pm.id,
      state: BID_STATE.ACTIVE,
      placedAt: iso(now()),
      isRival: true,
      guardianConsent: true,
    };
    state.bids.push(bid);
    addEvent(auctionId, 'BID', `${maskName(profile.name)}님이 비공개 입찰했습니다. (총 ${publicBidCount(auction)}건)`);
    save();
    return bid;
  },
  autoRivalTick() {
    if (!state.demo?.rivals) return null;
    if (now().getTime() - (state.demo.lastRivalAt || 0) < 8_000) return null;
    const candidates = state.auctions.filter(
      (a) => a.state === AUCTION_STATE.LIVE && a.method === BID_METHOD.SEALED_MAX,
    );
    if (candidates.length === 0) return null;
    const auction = candidates[Math.floor(Math.random() * candidates.length)];
    const bid = this.addRivalBid(auction.id);
    state.demo.lastRivalAt = now().getTime();
    save();
    return bid;
  },
  createListing(input) {
    const user = currentUser();
    if (user.role !== 'TEACHER') throw new DomainError('FORBIDDEN', '선생님 계정만 경매를 등록할 수 있습니다.');
    const cycle = cycleFor(now(), Number(input.cycleOffset || 0));
    if (now() >= cycle.auctionEnd) {
      throw new DomainError('CYCLE_ENDED', '선택한 경매 사이클이 이미 종료되었습니다.');
    }
    const startPrice = Number(input.startPrice);
    const method = input.method;
    const floorPrice = method === BID_METHOD.DUTCH ? Number(input.floorPrice) : null;
    const minIncrement = method === BID_METHOD.SEALED_MAX ? Number(input.minIncrement || 1_000) : 0;
    const priceStartsAt =
      method === BID_METHOD.DUTCH
        ? new Date(Math.max(cycle.auctionStart.getTime(), now().getTime()))
        : cycle.auctionStart;
    let decrementPerHour = 0;
    if (method === BID_METHOD.DUTCH) {
      decrementPerHour =
        Number(input.decrementPerHour) ||
        computeDutchDecrement({
          startPrice,
          floorPrice,
          startsAt: priceStartsAt,
          endsAt: cycle.auctionEnd,
        });
    }
    validateAuctionTerms({
      method,
      startPrice,
      floorPrice,
      decrementPerHour,
      minIncrement,
      startsAt: cycle.auctionStart,
      endsAt: cycle.auctionEnd,
    });
    if (!String(input.title || '').trim()) throw new DomainError('INVALID_LISTING', '경매 제목을 입력해 주세요.');
    if (!String(input.description || '').trim()) throw new DomainError('INVALID_LISTING', '수업 소개를 입력해 주세요.');
    if (input.mode === 'VISIT' && (!input.regions || input.regions.length === 0)) {
      throw new DomainError('INVALID_LISTING', '방문 수업은 가능 지역을 1개 이상 선택해 주세요.');
    }
    if (input.premiumVideo && !user.premium) {
      throw new DomainError('PREMIUM_REQUIRED', '숏폼 영상은 프리미엄 선생님만 등록할 수 있습니다.');
    }
    const listingId = uid('ls');
    const auctionId = uid('a');
    const listing = {
      id: listingId,
      teacherId: user.id,
      title: String(input.title).trim(),
      subject: String(input.subject || '기타'),
      description: String(input.description).trim(),
      emoji: String(input.emoji || '📚'),
      mode: input.mode || 'ONLINE',
      regions: Array.isArray(input.regions) ? input.regions : [],
      availability: Array.isArray(input.availability) ? input.availability : [],
      premiumVideo: input.premiumVideo || null,
      createdAt: iso(now()),
      bumpedAt: null,
      status: 'ACTIVE',
    };
    const auction = {
      id: auctionId,
      listingId,
      teacherId: user.id,
      cycleMonth: cycle.auctionMonth,
      classMonth: cycle.classMonth,
      method,
      state: now() >= cycle.auctionStart ? AUCTION_STATE.LIVE : AUCTION_STATE.SCHEDULED,
      startsAt: iso(cycle.auctionStart),
      endsAt: iso(cycle.auctionEnd),
      priceStartsAt: iso(priceStartsAt),
      startPrice,
      floorPrice,
      decrementPerHour,
      minIncrement,
      sessions: SESSIONS_PER_CYCLE,
      createdAt: iso(now()),
      bumpedAt: null,
      awardedBidId: null,
      finalPrice: null,
      endedAt: null,
    };
    state.listings.push(listing);
    state.auctions.push(auction);
    addEvent(
      auctionId,
      auction.state === AUCTION_STATE.LIVE ? 'START' : 'SCHEDULE',
      auction.state === AUCTION_STATE.LIVE
        ? '경매가 시작되었습니다.'
        : `${cycle.auctionLabel} 시작일에 자동으로 열립니다.`,
    );
    save();
    return hydrate(auction);
  },
  bump(auctionId) {
    const user = currentUser();
    const auction = state.auctions.find((a) => a.id === auctionId);
    if (!auction) throw new DomainError('AUCTION_NOT_FOUND', '경매를 찾을 수 없습니다.');
    if (auction.teacherId !== user.id) throw new DomainError('FORBIDDEN', '본인 경매만 끌올할 수 있습니다.');
    if (!user.premium) throw new DomainError('PREMIUM_REQUIRED', '끌올은 프리미엄 선생님 전용입니다.');
    if (![AUCTION_STATE.LIVE, AUCTION_STATE.SCHEDULED].includes(auction.state)) {
      throw new DomainError('INVALID_AUCTION_STATE', '진행 중이거나 예정된 경매만 끌올할 수 있습니다.');
    }
    if (state.bumpHistory.some((h) => h.teacherId === user.id && h.period === auction.cycleMonth)) {
      throw new DomainError('BUMP_LIMIT', '이번 달 끌올을 이미 사용했습니다.');
    }
    auction.bumpedAt = iso(now());
    const listing = listingOf(auction);
    if (listing) listing.bumpedAt = auction.bumpedAt;
    state.bumpHistory.push({
      id: uid('bh'),
      teacherId: user.id,
      auctionId,
      period: auction.cycleMonth,
      createdAt: iso(now()),
    });
    addEvent(auctionId, 'BUMP', '프리미엄 끌올로 목록 상단에 노출됩니다.');
    save();
    return true;
  },
  bookLesson(orderId, { date, time }) {
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) throw new DomainError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.');
    if (order.status !== ORDER_STATE.PAID) {
      throw new DomainError('INVALID_ORDER_STATE', '결제 완료 상태에서만 일정을 확정할 수 있습니다.');
    }
    if (!date || !time) throw new DomainError('INVALID_SCHEDULE', '수업 날짜와 시간을 선택해 주세요.');
    const [y, m, d] = String(date).split('-').map(Number);
    const [hh, mm] = String(time).split(':').map(Number);
    const lessonAt = kstDate(y, m - 1, d, hh, mm, 0, 0);
    if (lessonAt <= now()) throw new DomainError('INVALID_SCHEDULE', '미래 시간을 선택해 주세요.');
    order.lessonAt = iso(lessonAt);
    order.status = ORDER_STATE.CONFIRMED;
    order.confirmedAt = iso(now());
    addEvent(order.auctionId, 'BOOKING', `수업 일정이 확정되었습니다: ${date} ${time}`);
    save();
    return order;
  },
  completeOrder(orderId) {
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) throw new DomainError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.');
    if (order.status !== ORDER_STATE.CONFIRMED) {
      throw new DomainError('INVALID_ORDER_STATE', '확정된 수업만 완료 처리할 수 있습니다.');
    }
    order.status = ORDER_STATE.COMPLETED;
    order.completedAt = iso(now());
    addEvent(order.auctionId, 'COMPLETE', '수업이 완료되었습니다. 정산 대기 상태로 전환됩니다.');
    save();
    return order;
  },
  settleOrder(orderId) {
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) throw new DomainError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.');
    if (order.status !== ORDER_STATE.COMPLETED) {
      throw new DomainError('INVALID_ORDER_STATE', '수업 완료 후에만 정산할 수 있습니다.');
    }
    const payment = state.payments.find((p) => p.orderId === order.id && p.status === 'PAID');
    if (payment) payment.escrow = 'RELEASED';
    order.status = ORDER_STATE.SETTLED;
    order.settledAt = iso(now());
    state.settlements.unshift({
      id: uid('st'),
      orderId: order.id,
      teacherId: order.teacherId,
      gross: order.amount,
      commission: order.commissionAmount,
      net: order.amount - order.commissionAmount,
      status: 'PAID',
      paidAt: iso(now()),
    });
    addEvent(order.auctionId, 'SETTLE', `정산 완료: 실수령 ${(order.amount - order.commissionAmount).toLocaleString('ko-KR')}원`);
    save();
    return order;
  },
  refundOrder(orderId, reason = '운영자 환불') {
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) throw new DomainError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.');
    if (![ORDER_STATE.PAID, ORDER_STATE.CONFIRMED, ORDER_STATE.COMPLETED, ORDER_STATE.DISPUTED].includes(order.status)) {
      throw new DomainError('INVALID_ORDER_STATE', '환불할 수 없는 주문 상태입니다.');
    }
    const payment = state.payments.find((p) => p.orderId === order.id && p.status === 'PAID');
    if (payment) payment.escrow = 'REFUNDED';
    order.status = ORDER_STATE.REFUNDED;
    order.refundReason = reason;
    order.refundedAt = iso(now());
    addEvent(order.auctionId, 'REFUND', `환불 처리: ${reason}`);
    save();
    return order;
  },
  myOrders() {
    const user = currentUser();
    if (user.role === 'ADMIN') return state.orders;
    if (user.role === 'TEACHER') return state.orders.filter((o) => o.teacherId === user.id);
    return state.orders.filter((o) => o.guardianId === user.id);
  },
  myBids() {
    const user = currentUser();
    const ids = myStudentIds(user);
    return state.bids.filter((b) => ids.includes(b.studentProfileId));
  },
  teacherAuctions() {
    const user = currentUser();
    if (user.role !== 'TEACHER') return [];
    return state.auctions
      .filter((a) => a.teacherId === user.id)
      .map((a) => hydrate(a));
  },
  stats() {
    syncAuctions();
    const live = state.auctions.filter((a) => a.state === AUCTION_STATE.LIVE).length;
    const awarded = state.auctions.filter((a) => a.state === AUCTION_STATE.AWARDED).length;
    const unsold = state.auctions.filter((a) => a.state === AUCTION_STATE.UNSOLD).length;
    const escrow = state.payments
      .filter((p) => p.status === 'PAID' && p.escrow === 'HELD')
      .reduce((sum, p) => sum + p.amount, 0);
    const gmv = state.payments
      .filter((p) => p.status === 'PAID')
      .reduce((sum, p) => sum + p.amount, 0);
    return { live, awarded, unsold, escrow, gmv };
  },
  setTimeOffset(offsetMs) {
    state.demo.offsetMs = Number(offsetMs) || 0;
    save();
    syncAuctions();
  },
  shiftTime(ms) {
    state.demo.offsetMs = (state.demo.offsetMs || 0) + Number(ms);
    save();
    syncAuctions();
  },
  resetTime() {
    state.demo.offsetMs = 0;
    save();
    syncAuctions();
  },
  setRivals(value) {
    state.demo.rivals = Boolean(value);
    state.demo.lastRivalAt = 0;
    save();
  },
  setDemoClose(auctionId, seconds = 10) {
    const auction = state.auctions.find((a) => a.id === auctionId);
    if (!auction) return false;
    auction.demoCloseAt = iso(new Date(now().getTime() + seconds * 1000));
    save();
    return true;
  },
  clearDemoClose(auctionId) {
    const auction = state.auctions.find((a) => a.id === auctionId);
    if (!auction) return false;
    delete auction.demoCloseAt;
    save();
    return true;
  },
  forceClose(auctionId) {
    syncAuctions();
    const auction = state.auctions.find((a) => a.id === auctionId);
    if (!auction) return false;
    const changed = closeAuctionInternal(auction);
    if (changed) save();
    return changed;
  },
  orderById(id) {
    return state.orders.find((o) => o.id === id) || null;
  },
  paymentForOrder(orderId) {
    return state.payments.find((p) => p.orderId === orderId) || null;
  },
  settlementForOrder(orderId) {
    return state.settlements.find((s) => s.orderId === orderId) || null;
  },
  teacherById(id) {
    return state.users.find((u) => u.id === id) || null;
  },
  listingById(id) {
    return state.listings.find((l) => l.id === id) || null;
  },
  studentById(id) {
    return state.studentProfiles.find((p) => p.id === id) || null;
  },
  guardianById(id) {
    return state.users.find((u) => u.id === id) || null;
  },
  maskName,
  cycleNow() {
    return cycleFor(now(), 0);
  },
  cycleNext() {
    return cycleFor(now(), 1);
  },
  cyclePrev() {
    return cycleFor(now(), -1);
  },
};

export { STORAGE_KEY, SEED_VERSION, HOUR_MS, BID_METHOD, AUCTION_STATE, BID_STATE, ORDER_STATE };
