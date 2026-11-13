import { store } from './store.js';
import {
  BID_METHOD,
  AUCTION_STATE,
  dutchPriceAt,
  nextDutchTickAt,
} from '../src/domain/auction-engine.mjs';
import {
  ui,
  fmtWon,
  countdown,
  closeModal,
  emptyState,
  toast,
  errorBox,
} from './ui.js';
import {
  renderHeader,
  renderFooter,
  renderHome,
  renderAuction,
} from './views-home.js';
import {
  renderTeacher,
  renderNewListing,
  renderStudent,
  renderAdmin,
  renderOrder,
} from './views-dash.js';
import {
  openBidModal,
  openCardModal,
  openScheduleModal,
  openChildModal,
  openVideoModal,
  openBidSuccess,
  openReceipt,
  showProcessing,
  showBidError,
  openPaymentFailure,
  chargeCard,
  validateCardInput,
  formatCardNumber,
  formatExpiry,
} from './modals.js';

const app = document.getElementById('app');
const seenAwards = new Set();
let lastDutchSignature = '';
let searchTimer = null;
let listingDraft = null;

/* ------------------------------------------------------------------ */
/* Routing                                                             */
/* ------------------------------------------------------------------ */

function routeInfo() {
  const raw = window.location.hash || '#/';
  if (!raw.startsWith('#/')) {
    return { path: '/', anchor: raw.replace(/^#/, '') };
  }
  const path = raw.slice(1).split('?')[0] || '/';
  return { path, anchor: '' };
}

function decodeId(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function notFound() {
  return `<main class="page narrow">${emptyState({
    icon: '🧭',
    title: '페이지를 찾을 수 없어요',
    desc: '주소가 올바른지 확인하거나 경매 목록으로 돌아가 주세요.',
    action: '<a class="btn btn-primary" href="#/">경매 목록으로</a>',
  })}</main>`;
}

function viewFor(path) {
  if (path === '/' || path === '') {
    return { title: '옥션&액션 — 월간 1:1 과외 경매', html: renderHome() };
  }
  if (path.startsWith('/auction/')) {
    const id = decodeId(path.slice('/auction/'.length));
    const auction = store.getAuction(id);
    return {
      title: auction?.listing?.title
        ? `${auction.listing.title} · 옥션&액션`
        : '경매 상세 · 옥션&액션',
      html: renderAuction(id),
    };
  }
  if (path === '/teacher') {
    return { title: '선생님 스튜디오 · 옥션&액션', html: renderTeacher() };
  }
  if (path === '/teacher/new') {
    return { title: '새 수업 경매 등록 · 옥션&액션', html: renderNewListing() };
  }
  if (path === '/student') {
    return { title: '내 수업 · 옥션&액션', html: renderStudent() };
  }
  if (path === '/admin') {
    return { title: '운영 콘솔 · 옥션&액션', html: renderAdmin() };
  }
  if (path.startsWith('/order/')) {
    const id = decodeId(path.slice('/order/'.length));
    return { title: '주문 상세 · 옥션&액션', html: renderOrder(id) };
  }
  return { title: '페이지를 찾을 수 없어요 · 옥션&액션', html: notFound() };
}

function renderView({ scroll = false, focusSearch = false } = {}) {
  if (!app) return;
  captureListingDraft();
  const info = routeInfo();
  const view = viewFor(info.path);
  app.innerHTML = `${renderHeader()}${view.html}${renderFooter()}`;
  document.title = view.title;
  updateStickyOffset();
  if (info.path === '/teacher/new') restoreListingDraft();
  syncListingForm();
  updateCountdowns();
  if (focusSearch) {
    const input = app.querySelector('input[data-filter="q"]');
    if (input) {
      input.focus();
      const end = input.value.length;
      try {
        input.setSelectionRange(end, end);
      } catch {
        /* search inputs do not support selection in some browsers */
      }
    }
  }
  if (scroll) window.scrollTo(0, 0);
  if (info.anchor) {
    requestAnimationFrame(() => {
      document.getElementById(info.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

function render() {
  renderView();
}

function updateStickyOffset() {
  const header = document.querySelector('.site-header');
  const height = header ? Math.round(header.getBoundingClientRect().height) : 72;
  document.documentElement.style.setProperty('--sticky-top', `${height + 16}px`);
}

function onRouteChange() {
  closeModal();
  renderView({ scroll: true });
  lastDutchSignature = dutchSignature();
}

/* ------------------------------------------------------------------ */
/* Live clock                                                          */
/* ------------------------------------------------------------------ */

function updateCountdowns() {
  const nowMs = store.now.getTime();
  document.querySelectorAll('[data-countdown]').forEach((el) => {
    const target = new Date(el.dataset.target).getTime();
    if (Number.isNaN(target)) return;
    el.textContent = countdown(target - nowMs);
  });
  document.querySelectorAll('[data-dutch-next]').forEach((el) => {
    const auction = store.state.auctions.find((a) => a.id === el.dataset.auction);
    if (!auction || auction.method !== BID_METHOD.DUTCH) return;
    const next = nextDutchTickAt({
      startPrice: auction.startPrice,
      floorPrice: auction.floorPrice,
      decrementPerHour: auction.decrementPerHour,
      startsAt: auction.priceStartsAt || auction.startsAt,
      endsAt: auction.endsAt,
      now: store.now,
    });
    el.textContent = next ? countdown(new Date(next).getTime() - nowMs) : '최저가';
  });
}

function dutchSignature() {
  return store.state.auctions
    .filter((a) => a.method === BID_METHOD.DUTCH && a.state === AUCTION_STATE.LIVE)
    .map((a) => {
      const price = dutchPriceAt({
        startPrice: a.startPrice,
        floorPrice: a.floorPrice,
        decrementPerHour: a.decrementPerHour,
        startsAt: a.priceStartsAt || a.startsAt,
        now: store.now,
      });
      return `${a.id}:${price}`;
    })
    .join('|');
}

function seedSeenAwards() {
  seenAwards.clear();
  for (const auction of store.state.auctions) {
    if ([AUCTION_STATE.AWARDED, AUCTION_STATE.UNSOLD].includes(auction.state)) {
      seenAwards.add(auction.id);
    }
  }
}

function watchAwards() {
  const user = store.currentUser();
  const myStudentIds = store.studentProfiles().map((p) => p.id);
  for (const auction of store.state.auctions) {
    if (![AUCTION_STATE.AWARDED, AUCTION_STATE.UNSOLD].includes(auction.state)) continue;
    if (seenAwards.has(auction.id)) continue;
    seenAwards.add(auction.id);
    const listing = store.listingById(auction.listingId);
    if (auction.state === AUCTION_STATE.UNSOLD) {
      if (myStudentIds.length && store.state.bids.some((b) => b.auctionId === auction.id && myStudentIds.includes(b.studentProfileId))) {
        toast(`${listing?.title || '경매'}가 유찰되었습니다.`, 'info');
      }
      continue;
    }
    const order = store.state.orders.find((o) => o.auctionId === auction.id);
    const failedBid = store.state.bids.find(
      (b) =>
        b.auctionId === auction.id &&
        b.state === 'PAYMENT_FAILED' &&
        myStudentIds.includes(b.studentProfileId),
    );
    if (failedBid) {
      toast('카드 승인이 거절되어 낙찰이 취소되었습니다. 다른 카드로 다시 참여해 주세요.', 'error');
      continue;
    }
    if (!order) continue;
    if (order.guardianId === user.id) {
      toast(`낙찰되었습니다! ${listing?.title || '수업'} · ${fmtWon(order.amount)}`, 'success');
    } else if (order.teacherId === user.id) {
      toast(`수업이 낙찰되었습니다: ${listing?.title || '수업'} · ${fmtWon(order.amount)}`, 'success');
    }
  }
}

function tick() {
  const changed = store.syncAuctions();
  const rivalBid = store.autoRivalTick();
  watchAwards();
  if (changed || rivalBid) {
    render();
    lastDutchSignature = dutchSignature();
    return;
  }
  updateCountdowns();
  const signature = dutchSignature();
  if (signature !== lastDutchSignature) {
    lastDutchSignature = signature;
    render();
  }
}

/* ------------------------------------------------------------------ */
/* Listing form helpers                                                */
/* ------------------------------------------------------------------ */

function syncListingForm() {
  const form = document.querySelector('[data-form="create-listing"]');
  if (!form) return;
  const method = form.querySelector('input[name="method"]:checked')?.value || BID_METHOD.SEALED_MAX;
  form.querySelectorAll('[data-method-field]').forEach((field) => {
    field.hidden = field.dataset.methodField !== method;
  });
  const dutchPreview = form.querySelector('[data-dutch-preview]');
  if (dutchPreview) dutchPreview.hidden = method !== BID_METHOD.DUTCH;
  const videoToggle = form.querySelector('input[name="useVideo"]');
  const videoFields = form.querySelector('[data-video-fields]');
  if (videoFields) videoFields.hidden = !videoToggle?.checked;
  updateListingPreview(form);
}

function captureListingDraft() {
  if (routeInfo().path !== '/teacher/new') return;
  const form = document.querySelector('[data-form="create-listing"]');
  if (!form) return;
  const draft = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') {
      if (!Array.isArray(draft[el.name])) draft[el.name] = [];
      if (el.checked) draft[el.name].push(el.value);
    } else if (el.type === 'radio') {
      if (el.checked) draft[el.name] = el.value;
    } else {
      draft[el.name] = el.value;
    }
  }
  listingDraft = draft;
}

function restoreListingDraft() {
  const form = document.querySelector('[data-form="create-listing"]');
  if (!form || !listingDraft) return;
  for (const el of form.elements) {
    if (!el.name || !(el.name in listingDraft)) continue;
    const value = listingDraft[el.name];
    if (el.type === 'checkbox') {
      el.checked = Array.isArray(value) && value.includes(el.value);
    } else if (el.type === 'radio') {
      el.checked = value === el.value;
    } else {
      el.value = value;
    }
  }
}

function updateListingPreview(form) {
  const preview = form.querySelector('[data-monthly-preview]');
  if (!preview) return;
  const startPrice = Number(form.querySelector('input[name="startPrice"]')?.value) || 0;
  const method = form.querySelector('input[name="method"]:checked')?.value;
  const b = preview.querySelector('b');
  const small = preview.querySelector('small');
  if (b) b.textContent = fmtWon(startPrice * 4);
  if (small) {
    small.textContent =
      method === BID_METHOD.DUTCH
        ? `시작가 ${fmtWon(startPrice)} × 4회 · 현재가가 내려가면 결제액도 내려갑니다`
        : `시간당 ${fmtWon(startPrice)} × 4회`;
  }
}

/* ------------------------------------------------------------------ */
/* Bid flows                                                           */
/* ------------------------------------------------------------------ */

async function submitBid(form) {
  const auctionId = form.dataset.auction;
  const method = form.dataset.method;
  const auction = store.getAuction(auctionId);
  if (!auction) {
    showBidError('경매를 찾을 수 없습니다.', auctionId);
    return;
  }
  const fd = new FormData(form);
  if (!fd.get('guardianConsent')) {
    showBidError('보호자 동의에 체크해 주세요.', auctionId);
    return;
  }
  const paymentMethodId = String(fd.get('paymentMethodId') || '');
  if (!paymentMethodId) {
    showBidError('결제수단을 선택하거나 카드를 먼저 등록해 주세요.', auctionId);
    return;
  }
  const payload = {
    studentProfileId: String(fd.get('studentProfileId') || ''),
    amount: Number(fd.get('amount')),
    regionCode: String(fd.get('regionCode') || ''),
    contact: String(fd.get('contact') || ''),
    paymentMethodId,
    guardianConsent: true,
  };
  const submitBtn = form.querySelector('[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
  }

  try {
    if (method === BID_METHOD.SEALED_MAX) {
      const existing = Boolean(auction.myBid);
      store.placeSealedBid({ auctionId, ...payload });
      render();
      openBidSuccess({
        title: existing ? '최대가를 수정했습니다' : '비공개 입찰이 접수되었습니다',
        description: `${auction.listing?.title || '수업'} · 시간당 ${fmtWon(payload.amount)}. 월말에 최고가 낙찰과 자동 결제가 진행됩니다.`,
        amount: payload.amount * auction.sessions,
        extra: '<p class="tiny muted center">실제 결제가는 차순위 최고가 + 최소 입찰 단위이며, 내 최대가를 넘지 않습니다.</p>',
      });
      return;
    }

    const begun = store.beginInstantBid(auctionId, payload);
    render();
    showProcessing({
      amount: begun.monthlyAmount,
      label: method === BID_METHOD.DUTCH ? '현재가로 낙찰을 진행합니다' : '선착순 낙찰을 진행합니다',
    });
    const card = store.paymentMethods().find((c) => c.id === paymentMethodId) || {};
    const result = await chargeCard({ card, amount: begun.monthlyAmount });
    if (!result.ok) {
      store.failInstantAward(begun.bid.id, result.message);
      render();
      openPaymentFailure(result.message, auctionId);
      return;
    }
    const order = store.confirmInstantAward(begun.bid.id, {
      brand: result.brand,
      last4: result.last4,
      tid: result.tid,
      receiptNo: result.receiptNo,
    });
    render();
    openReceipt(order.id);
  } catch (error) {
    if (error?.code === 'PRICE_CHANGED') {
      showBidError('가격이 변경되었습니다. 최신 현재가로 다시 확인해 주세요.', auctionId);
      setTimeout(() => {
        closeModal();
        openBidModal(auctionId);
      }, 1100);
    } else {
      showBidError(error?.message || '입찰에 실패했습니다. 잠시 후 다시 시도해 주세요.', auctionId);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('is-loading');
      }
    }
  }
}

function submitCard(form) {
  const slot = form.querySelector('[data-card-error]');
  const fd = new FormData(form);
  const input = {
    number: String(fd.get('number') || ''),
    exp: String(fd.get('exp') || ''),
    cvc: String(fd.get('cvc') || ''),
    password: String(fd.get('password') || ''),
    ownerName: String(fd.get('ownerName') || ''),
  };
  const validation = validateCardInput(input);
  if (!validation.ok) {
    if (slot) slot.innerHTML = errorBox(Object.values(validation.errors).join(' '));
    return;
  }
  try {
    const pm = store.registerPaymentMethod(input);
    const returnToBid = form.dataset.returnBid;
    closeModal();
    render();
    toast(`카드가 등록되었습니다. ${pm.brand} •••• ${pm.last4}`, 'success');
    if (returnToBid) openBidModal(returnToBid);
  } catch (error) {
    if (slot) slot.innerHTML = errorBox(error?.message || '카드 등록에 실패했습니다.');
  }
}

function submitListing(form) {
  const slot = form.querySelector('[data-error-slot]');
  const fd = new FormData(form);
  const days = fd.getAll('days').map(Number);
  const availability = days.map((day) => ({
    day,
    start: String(fd.get('availStart') || '18:00'),
    end: String(fd.get('availEnd') || '21:00'),
  }));
  const useVideo = Boolean(fd.get('useVideo'));
  const input = {
    title: String(fd.get('title') || ''),
    subject: String(fd.get('subject') || '기타'),
    description: String(fd.get('description') || ''),
    emoji: String(fd.get('emoji') || '📚'),
    mode: String(fd.get('mode') || 'ONLINE'),
    regions: fd.getAll('regions').map(String),
    availability,
    method: String(fd.get('method') || BID_METHOD.SEALED_MAX),
    startPrice: Number(fd.get('startPrice')),
    floorPrice: Number(fd.get('floorPrice')),
    minIncrement: Number(fd.get('minIncrement') || 1_000),
    cycleOffset: Number(fd.get('cycleOffset') || 0),
    premiumVideo: useVideo
      ? {
          title: String(fd.get('videoTitle') || '수업 소개 영상'),
          duration: Number(fd.get('videoDuration') || 30),
          poster: '🎬',
        }
      : null,
  };
  try {
    const created = store.createListing(input);
    listingDraft = null;
    toast('경매가 등록되었습니다.', 'success');
    window.location.hash = `#/auction/${encodeURIComponent(created.id)}`;
  } catch (error) {
    if (slot) {
      slot.innerHTML = errorBox(error?.message || '경매 등록에 실패했습니다.');
      slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

function submitSchedule(form) {
  const slot = form.querySelector('[data-schedule-error]');
  const fd = new FormData(form);
  try {
    store.bookLesson(form.dataset.order, {
      date: String(fd.get('date') || ''),
      time: String(fd.get('time') || ''),
    });
    closeModal();
    render();
    toast('수업 일정이 확정되었습니다.', 'success');
  } catch (error) {
    if (slot) slot.innerHTML = errorBox(error?.message || '일정을 확정하지 못했습니다.');
  }
}

function submitChild(form) {
  const slot = form.querySelector('[data-child-error]');
  const fd = new FormData(form);
  try {
    const profile = store.addStudentProfile({
      name: String(fd.get('name') || ''),
      grade: String(fd.get('grade') || ''),
      region: String(fd.get('region') || ''),
    });
    closeModal();
    render();
    toast(`${profile.name} 프로필을 추가했습니다.`, 'success');
  } catch (error) {
    if (slot) slot.innerHTML = errorBox(error?.message || '프로필을 추가하지 못했습니다.');
  }
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

const CHANGE_ONLY_ACTIONS = new Set(['switch-user', 'toggle-rivals']);

function switchUser(id) {
  const user = store.userById(id);
  if (!user) return;
  closeModal();
  store.setCurrentUser(id);
  render();
  toast(`${user.name}${user.role === 'TEACHER' ? ' 선생님' : user.role === 'ADMIN' ? ' 운영자' : ' 학부모'} 계정으로 전환했습니다.`);
}

function handleAction(actionEl) {
  const action = actionEl.dataset.action;
  if (CHANGE_ONLY_ACTIONS.has(action)) return;
  const id = actionEl.dataset.id;
  switch (action) {
    case 'close-modal':
      closeModal();
      break;
    case 'toggle-demo':
      ui.demoOpen = !ui.demoOpen;
      render();
      break;
    case 'shift-time':
      store.shiftTime(Number(actionEl.dataset.ms) || 3_600_000);
      watchAwards();
      render();
      break;
    case 'time-to-end': {
      const cycle = store.cycleNow();
      const target = new Date(cycle.auctionEnd).getTime() - 10_000;
      store.setTimeOffset(target - Date.now());
      watchAwards();
      render();
      toast('월말 10초 전으로 이동했습니다. 곧 자동 낙찰이 시작됩니다.', 'info');
      break;
    }
    case 'reset-time':
      store.resetTime();
      render();
      toast('데모 시간을 실시간으로 되돌렸습니다.');
      break;
    case 'reset-demo':
      if (!window.confirm('모든 데모 데이터를 처음 상태로 되돌릴까요?')) return;
      store.resetDemo();
      seedSeenAwards();
      listingDraft = null;
      ui.filters = { subject: '전체', method: '전체', region: '전체', sort: 'ending', q: '' };
      render();
      toast('데모를 초기화했습니다.', 'success');
      break;
    case 'switch-user-id':
      if (id) switchUser(id);
      break;
    case 'open-bid':
      if (id) openBidModal(id);
      break;
    case 'open-card':
      openCardModal(actionEl.dataset.returnBid || '');
      break;
    case 'open-schedule':
      if (id) openScheduleModal(id);
      break;
    case 'open-receipt':
      if (id) openReceipt(id);
      break;
    case 'open-child':
      openChildModal();
      break;
    case 'play-video':
      openVideoModal(actionEl.dataset.title || '숏폼 수업 영상');
      break;
    case 'bump':
      try {
        store.bump(id);
        render();
        toast('끌올했습니다. 목록 상단에 노출됩니다.', 'success');
      } catch (error) {
        toast(error?.message || '끌올하지 못했습니다.', 'error');
      }
      break;
    case 'demo-close':
      store.setDemoClose(id, Number(actionEl.dataset.seconds) || 10);
      toast(`${Number(actionEl.dataset.seconds) || 10}초 뒤 경매가 마감됩니다.`, 'info');
      break;
    case 'force-close':
      if (!window.confirm('지금 이 경매를 마감할까요? 월말 자동 낙찰 로직이 즉시 실행됩니다.')) return;
      store.forceClose(id);
      watchAwards();
      render();
      toast('경매를 마감하고 낙찰 처리를 실행했습니다.', 'success');
      break;
    case 'add-rival': {
      const bid = store.addRivalBid(id);
      if (bid) {
        render();
        toast('가상 경쟁 입찰을 추가했습니다.');
      } else {
        toast('경쟁 입찰을 추가할 수 없는 상태입니다.', 'error');
      }
      break;
    }
    case 'toggle-premium':
      try {
        const user = store.togglePremium(id);
        render();
        toast(user.premium ? '프리미엄을 시작했습니다. (모의 결제)' : '프리미엄을 해지했습니다.', 'success');
      } catch (error) {
        toast(error?.message || '프리미엄을 변경하지 못했습니다.', 'error');
      }
      break;
    case 'complete-order':
      try {
        store.completeOrder(id);
        render();
        toast('수업을 완료 처리했습니다. 운영자 정산을 기다립니다.', 'success');
      } catch (error) {
        toast(error?.message || '수업을 완료 처리하지 못했습니다.', 'error');
      }
      break;
    case 'settle-order':
      try {
        store.settleOrder(id);
        render();
        toast('정산을 완료했습니다. 에스크로가 해제되었습니다.', 'success');
      } catch (error) {
        toast(error?.message || '정산하지 못했습니다.', 'error');
      }
      break;
    case 'refund-order':
      if (!window.confirm('이 주문을 환불 처리할까요? 모의 결제이므로 실제 환불은 발생하지 않습니다.')) return;
      try {
        store.refundOrder(id);
        render();
        toast('환불 처리했습니다.', 'success');
      } catch (error) {
        toast(error?.message || '환불하지 못했습니다.', 'error');
      }
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Event wiring                                                        */
/* ------------------------------------------------------------------ */

document.addEventListener('click', (event) => {
  const actionEl = event.target.closest('[data-action]');
  if (actionEl) {
    const action = actionEl.dataset.action;
    if (action === 'close-modal') {
      if (actionEl.classList.contains('modal-backdrop') && event.target !== actionEl) return;
      closeModal();
      return;
    }
    if (!CHANGE_ONLY_ACTIONS.has(action)) {
      event.preventDefault();
      handleAction(actionEl);
      return;
    }
  }

  const filterEl = event.target.closest('button[data-filter]');
  if (filterEl) {
    ui.filters[filterEl.dataset.filter] = filterEl.dataset.value;
    render();
  }
});

document.addEventListener('change', (event) => {
  const target = event.target;

  if (target.matches('select[data-action="switch-user"]')) {
    switchUser(target.value);
    return;
  }

  if (target.matches('input[data-action="toggle-rivals"]')) {
    store.setRivals(target.checked);
    toast(target.checked ? '가상 경쟁자 입찰을 켰습니다.' : '가상 경쟁자 입찰을 껐습니다.');
    return;
  }

  if (target.matches('select[data-filter]')) {
    ui.filters[target.dataset.filter] = target.value;
    render();
    return;
  }

  const listingForm = target.closest('[data-form="create-listing"]');
  if (listingForm) {
    if (target.name === 'method') {
      syncListingForm();
    } else if (target.name === 'startPrice' || target.name === 'floorPrice') {
      updateListingPreview(listingForm);
    } else if (target.name === 'useVideo') {
      syncListingForm();
    }
  }
});

document.addEventListener('input', (event) => {
  const target = event.target;

  if (target.matches('input[data-filter="q"]')) {
    ui.filters.q = target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderView({ focusSearch: true }), 220);
    return;
  }

  if (target.matches('[data-card-number]')) {
    target.value = formatCardNumber(target.value);
    return;
  }

  if (target.matches('[data-card-exp]')) {
    target.value = formatExpiry(target.value);
    return;
  }

  if (target.matches('[data-bid-amount]')) {
    const monthly = document.querySelector('[data-bid-monthly]');
    if (monthly) monthly.textContent = fmtWon((Number(target.value) || 0) * 4);
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.dataset.form) return;
  event.preventDefault();
  switch (form.dataset.form) {
    case 'bid':
      submitBid(form);
      break;
    case 'card':
      submitCard(form);
      break;
    case 'create-listing':
      submitListing(form);
      break;
    case 'schedule':
      submitSchedule(form);
      break;
    case 'child':
      submitChild(form);
      break;
    default:
      break;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.querySelector('.modal-backdrop')) {
    closeModal();
  }
});

window.addEventListener('hashchange', onRouteChange);
window.addEventListener('resize', updateStickyOffset);

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

store.bootstrap();
seedSeenAwards();
ui.refresh = render;
if (!window.location.hash) {
  window.history.replaceState(null, '', '#/');
}
renderView({ scroll: false });
lastDutchSignature = dutchSignature();
setInterval(tick, 1000);
