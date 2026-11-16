import {
  won,
  BID_METHOD,
  AUCTION_STATE,
  ORDER_STATE,
  kstParts,
} from '../src/domain/auction-engine.mjs';

export const ui = {
  filters: { subject: '전체', mode: '전체', method: '전체', region: '전체', sort: 'ending', q: '' },
  demoOpen: false,
  refresh: () => {},
  navigate: (path) => {
    window.location.hash = path;
  },
  modal: null,
};

const wonFormatter = new Intl.NumberFormat('ko-KR');

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

export function fmtWon(n) {
  return `${wonFormatter.format(Math.round(Number(n) || 0))}원`;
}

export function fmtDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value));
}

export function fmtDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function fmtShortDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function fmtTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function countdown(ms) {
  if (ms <= 0) return '마감';
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const p = (n) => String(n).padStart(2, '0');
  if (days > 0) return `${days}일 ${p(hours)}:${p(minutes)}:${p(seconds)}`;
  return `${p(hours)}:${p(minutes)}:${p(seconds)}`;
}

export function dday(ms) {
  if (ms <= 0) return 'D-DAY';
  const days = Math.ceil(ms / 86_400_000);
  return days <= 1 ? 'D-DAY' : `D-${days}`;
}

export function timeAgo(value) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60_000));
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function maskName(name) {
  if (!name) return '익명';
  return `${String(name).slice(0, 1)}○○`;
}

export const METHOD = {
  SEALED_MAX: {
    label: '비공개 최대가',
    short: '비공개',
    tone: 'sealed',
    icon: '🔒',
    desc: '최대가를 비공개로 제출하고, 월말에 가장 높은 분이 낙찰됩니다.',
    hint: '최고가가 공개되지 않아 눈치 보지 않고 입찰할 수 있어요.',
  },
  FIRST_COME: {
    label: '선착순',
    short: '선착순',
    tone: 'first',
    icon: '⚡',
    desc: '결제를 완료한 첫 번째 분이 즉시 낙찰됩니다.',
    hint: '경매가 바로 종료되므로 결제 전에 조건을 꼭 확인하세요.',
  },
  DUTCH: {
    label: '하락 경매',
    short: '하락',
    tone: 'dutch',
    icon: '📉',
    desc: '1시간마다 가격이 내려가고, 현재가에 입찰하면 즉시 낙찰됩니다.',
    hint: '가격이 내려갈수록 다른 학부모님이 먼저 가져갈 수 있어요.',
  },
};

export const AUCTION_STATE_INFO = {
  DRAFT: { label: '작성 중', tone: 'muted' },
  SCHEDULED: { label: '오픈 예정', tone: 'scheduled' },
  LIVE: { label: '진행 중', tone: 'live' },
  CLOSING: { label: '마감 처리 중', tone: 'pending' },
  AWARD_PENDING: { label: '낙찰 처리 중', tone: 'pending' },
  AWARDED: { label: '낙찰 완료', tone: 'awarded' },
  UNSOLD: { label: '유찰', tone: 'unsold' },
  CANCELLED: { label: '취소', tone: 'muted' },
  VOIDED: { label: '무효', tone: 'muted' },
};

export const ORDER_STATE_INFO = {
  PENDING_PAYMENT: { label: '결제 대기', tone: 'pending' },
  PAYMENT_FAILED: { label: '결제 실패', tone: 'unsold' },
  PAID: { label: '결제 완료 · 에스크로', tone: 'paid' },
  CONFIRMED: { label: '수업 확정', tone: 'confirmed' },
  COMPLETED: { label: '수업 완료', tone: 'completed' },
  SETTLED: { label: '정산 완료', tone: 'settled' },
  CANCELLED: { label: '취소', tone: 'muted' },
  DISPUTED: { label: '분쟁 중', tone: 'unsold' },
  REFUNDED: { label: '환불 완료', tone: 'muted' },
};

export const LESSON_MODE_INFO = {
  VISIT: { label: '1:1 방문교육', short: '방문', icon: '🏠' },
  ONLINE: { label: '1:1 화상교육', short: '화상', icon: '💻' },
  BOTH: { label: '1:1 방문·화상', short: '방문·화상', icon: '🏠💻' },
  GROUP: { label: '1:n 그룹 교육', short: '그룹', icon: '👥' },
};

export function modeLabel(mode, groupSize) {
  if (mode === 'GROUP') {
    return groupSize ? `1:n 그룹 교육 (정원 ${groupSize}명)` : '1:n 그룹 교육';
  }
  return LESSON_MODE_INFO[mode]?.label || mode;
}

export function lessonRegionText(listing = {}) {
  const regions = listing.regions || [];
  if (regions.length) return regions.join(', ');
  if (listing.mode === 'ONLINE') return '화상 · 지역 무관';
  if (listing.mode === 'GROUP') return '그룹 · 지역 협의';
  return '지역 협의';
}

export function dayLabel(day) {
  return ['일', '월', '화', '수', '목', '금', '토'][Number(day)] || '';
}

export function availabilityText(availability = []) {
  if (!availability.length) return '일정 협의';
  return availability
    .map((a) => `${dayLabel(a.day)} ${a.start}~${a.end}`)
    .join(' · ');
}

export function classScheduleText() {
  return '주 1회 60분 · 총 4회';
}

export function calendarStrip(cycle) {
  const nowParts = kstParts(new Date());
  const start = kstParts(cycle.auctionStart);
  const [classYear, classMonth] = cycle.classMonth.split('-').map(Number);
  const cells = [];
  for (let day = 1; day <= cycle.lastDay; day += 1) {
    const isToday = nowParts.year === start.year && nowParts.month === start.month && nowParts.day === day;
    const isEnd = day === cycle.lastDay;
    const isPast = nowParts.year === start.year && nowParts.month === start.month && day < nowParts.day;
    cells.push(
      `<span class="cal-day ${isToday ? 'is-today' : ''} ${isEnd ? 'is-end' : ''} ${isPast ? 'is-past' : ''}" title="${day}일">
        ${day}${isEnd ? '<i class="cal-flag"></i>' : ''}
      </span>`,
    );
  }
  return `<div class="calendar-strip" aria-label="${esc(cycle.auctionLabel)} 달력">
    <div class="cal-head"><span>${esc(cycle.auctionLabel)}</span><span class="cal-end">${classYear}년 ${classMonth}월 수업 시작</span></div>
    <div class="cal-days">${cells.join('')}</div>
  </div>`;
}

export function avatar(teacher, extraClass = '', premium = false) {
  return `<span class="avatar ${extraClass}">
    <span class="avatar-emoji">${esc(teacher?.emoji || teacher?.teacherProfile?.emoji || '📚')}</span>
    ${premium ? '<span class="avatar-crown" title="프리미엄 선생님">★</span>' : ''}
  </span>`;
}

export function methodBadge(method) {
  const m = METHOD[method] || METHOD.SEALED_MAX;
  return `<span class="badge badge-${m.tone}"><span aria-hidden="true">${m.icon}</span>${esc(m.label)}</span>`;
}

export function stateBadge(state) {
  const s = AUCTION_STATE_INFO[state] || AUCTION_STATE_INFO.LIVE;
  return `<span class="status status-${s.tone}"><i class="dot"></i>${esc(s.label)}</span>`;
}

export function orderBadge(state) {
  const s = ORDER_STATE_INFO[state] || { label: state, tone: 'muted' };
  return `<span class="status status-${s.tone}">${esc(s.label)}</span>`;
}

export function stepper(order) {
  const steps = ['결제 완료', '수업 확정', '수업 완료', '정산 완료'];
  const index = {
    [ORDER_STATE.PAID]: 1,
    [ORDER_STATE.CONFIRMED]: 2,
    [ORDER_STATE.COMPLETED]: 3,
    [ORDER_STATE.SETTLED]: 4,
  }[order?.status] || 0;
  const isRefunded = order?.status === ORDER_STATE.REFUNDED;
  return `<div class="stepper ${isRefunded ? 'is-refunded' : ''}">
    ${steps.map((label, i) => {
      const state = isRefunded ? (i === 0 ? 'done' : 'off') : i < index ? 'done' : i === index ? 'active' : 'off';
      return `<div class="step ${state}"><span class="step-dot">${state === 'done' ? '✓' : i + 1}</span><span class="step-label">${label}</span>${i < steps.length - 1 ? '<i class="step-line"></i>' : ''}</div>`;
    }).join('')}
  </div>`;
}

export function openModal(html, { className = '' } = {}) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = `<div class="modal-backdrop" data-action="close-modal">
    <section class="modal ${className}" role="dialog" aria-modal="true">
      ${html}
    </section>
  </div>`;
  document.body.classList.add('modal-open');
  const focusable = root.querySelector('input, select, textarea, button');
  if (focusable) setTimeout(() => focusable.focus(), 30);
}

export function setModal(html, { className = '' } = {}) {
  openModal(html, { className });
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
  document.body.classList.remove('modal-open');
}

export function modalHeader(title, subtitle = '') {
  return `<header class="modal-head">
    <div><p class="eyebrow">${esc(subtitle)}</p><h2>${esc(title)}</h2></div>
    <button class="icon-btn" type="button" data-action="close-modal" aria-label="닫기">✕</button>
  </header>`;
}

export function toast(message, tone = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  el.innerHTML = `<span class="toast-icon">${tone === 'error' ? '!' : tone === 'success' ? '✓' : 'i'}</span><span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => el.classList.add('is-out'), 3200);
  setTimeout(() => el.remove(), 3600);
}

export function emptyState({ icon = '🗂️', title, desc, action = '' }) {
  return `<div class="empty-state">
    <span class="empty-icon" aria-hidden="true">${icon}</span>
    <h3>${esc(title)}</h3>
    <p>${esc(desc)}</p>
    ${action}
  </div>`;
}

export function errorBox(message) {
  return `<div class="form-error" role="alert">${esc(message)}</div>`;
}

export function wonIcon() {
  return '<span class="won-mark">₩</span>';
}
