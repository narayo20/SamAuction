import { store } from './store.js';
import {
  BID_METHOD,
  AUCTION_STATE,
  ORDER_STATE,
  cycleFor,
} from '../src/domain/auction-engine.mjs';
import {
  esc,
  fmtWon,
  fmtDate,
  fmtDateTime,
  fmtShortDateTime,
  countdown,
  METHOD,
  modeLabel,
  dayLabel,
  availabilityText,
  calendarStrip,
  avatar,
  methodBadge,
  stateBadge,
  orderBadge,
  stepper,
  emptyState,
  maskName,
} from './ui.js';

const REGIONS = [
  '서울 강남구', '서울 서초구', '서울 마포구', '서울 서대문구', '서울 송파구',
  '서울 강동구', '서울 용산구', '서울 노원구', '서울 관악구', '서울 성동구',
  '경기 성남시', '경기 용인시', '경기 고양시', '경기 수원시', '인천 연수구',
];

const EMOJIS = ['👩‍🏫', '🧑‍🏫', '👨‍🔬', '👩‍🎨', '🎹', '🧑‍💻', '📐', '📚', '🌍', '🎨'];

function accessPrompt(roleLabel, targetId, desc) {
  return `<main class="page narrow"><div class="panel access-panel">
    <span class="access-icon">🔐</span>
    <h1>${esc(roleLabel)} 계정으로 체험해 보세요</h1>
    <p>${esc(desc)}</p>
    <button class="btn btn-primary" type="button" data-action="switch-user-id" data-id="${esc(targetId)}">체험 계정으로 전환</button>
  </div></main>`;
}

function teacherStats(auctions, orders) {
  const live = auctions.filter((a) => a.state === AUCTION_STATE.LIVE).length;
  const bids = store.state.bids.filter((b) => auctions.some((a) => a.id === b.auctionId)).length;
  const pending = orders
    .filter((o) => [ORDER_STATE.PAID, ORDER_STATE.CONFIRMED, ORDER_STATE.COMPLETED].includes(o.status))
    .reduce((sum, o) => sum + (o.amount - o.commissionAmount), 0);
  const settled = orders
    .filter((o) => o.status === ORDER_STATE.SETTLED)
    .reduce((sum, o) => sum + (o.amount - o.commissionAmount), 0);
  return { live, bids, pending, settled };
}

export function renderTeacher() {
  const user = store.currentUser();
  if (user.role !== 'TEACHER') {
    return accessPrompt('선생님', 'u_t_kim', '수업 등록, 입찰 현황, 정산 내역은 선생님 계정에서 확인할 수 있습니다.');
  }
  const auctions = store.teacherAuctions();
  const orders = store.myOrders();
  const stats = teacherStats(auctions, orders);
  const cycle = store.cycleNow();
  const bumpUsed = store.state.bumpHistory.some((h) => h.teacherId === user.id && h.period === cycle.auctionMonth);
  return `<main class="page dashboard">
    <header class="dash-head">
      <div>
        <p class="eyebrow">TEACHER STUDIO</p>
        <h1>${esc(user.name)} 선생님${user.premium ? ' <span class="premium-star">★</span>' : ''}</h1>
        <p class="dash-sub">${esc(cycle.auctionLabel)} · ${esc(cycle.classLabel)} · ${user.premium ? '프리미엄 구독 중' : '일반 회원'}</p>
      </div>
      <div class="dash-head-actions"><a class="btn btn-primary" href="#/teacher/new">+ 새 경매 등록</a><a class="btn btn-ghost" href="#/student">학생 화면 보기</a></div>
    </header>
    <section class="stat-grid">
      <div class="stat-card"><span>진행 중 경매</span><b>${stats.live}</b><small>이번 달</small></div>
      <div class="stat-card"><span>받은 입찰</span><b>${stats.bids}</b><small>전체 기간</small></div>
      <div class="stat-card accent"><span>정산 예정</span><b>${fmtWon(stats.pending)}</b><small>수업 완료 후</small></div>
      <div class="stat-card"><span>누적 정산</span><b>${fmtWon(stats.settled)}</b><small>에스크로 해제</small></div>
    </section>
    <section class="dash-grid">
      <div class="dash-main">
        <div class="panel">
          <div class="panel-head"><div><p class="eyebrow">MY AUCTIONS</p><h2>내 수업 경매</h2></div><span class="count-pill">${auctions.length}개</span></div>
          ${auctions.length ? `<div class="teacher-auction-list">${auctions.map(teacherAuctionRow).join('')}</div>` : emptyState({ icon: '📝', title: '아직 등록한 경매가 없어요', desc: '이번 달 수업을 열고 학부모님의 입찰을 받아 보세요.', action: '<a class="btn btn-primary" href="#/teacher/new">첫 경매 등록</a>' })}
        </div>
        <div class="panel">
          <div class="panel-head"><div><p class="eyebrow">ORDERS & SETTLEMENTS</p><h2>낙찰·정산 내역</h2></div></div>
          ${orders.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>수업</th><th>학생</th><th>결제금</th><th>수수료</th><th>실수령</th><th>상태</th><th></th></tr></thead><tbody>${orders.map(teacherOrderRow).join('')}</tbody></table></div>` : emptyState({ icon: '💳', title: '아직 낙찰된 수업이 없어요', desc: '월말 자동 낙찰 후 결제·정산 내역이 여기에 표시됩니다.' })}
        </div>
      </div>
      <aside class="dash-side">
        <div class="panel premium-panel ${user.premium ? 'is-premium' : ''}">
          <div class="premium-head"><span class="premium-crown">★</span><div><p class="eyebrow">PREMIUM TEACHER</p><h2>${user.premium ? '프리미엄 구독 중' : '프리미엄으로 더 눈에 띄게'}</h2></div></div>
          <ul class="benefit-list"><li>숏폼 수업 영상 등록</li><li>월 1회 끌올 (목록 상단 노출)</li><li>프리미엄 배지와 수업 소개 강화</li></ul>
          <div class="premium-price">${user.premium ? '월 19,900원 · 다음 결제일까지 이용' : '월 19,900원 (모의 구독)'}</div>
          <button class="btn ${user.premium ? 'btn-outline' : 'btn-primary'} btn-block" type="button" data-action="toggle-premium" data-id="${esc(user.id)}">${user.premium ? '구독 해지 (데모)' : '프리미엄 시작하기'}</button>
          <p class="tiny muted">${user.premium ? `이번 달 끌올 ${bumpUsed ? '사용 완료' : '1회 사용 가능'}` : '결제는 모의로 처리됩니다.'}</p>
        </div>
        <div class="panel cycle-mini">
          <p class="eyebrow">THIS CYCLE</p><h2>${esc(cycle.auctionLabel)}</h2>
          <div class="mini-countdown" data-countdown data-target="${esc(cycle.auctionEnd.toISOString())}">${countdown(new Date(cycle.auctionEnd).getTime() - store.now.getTime())}</div>
          <p class="small muted">${esc(cycle.classLabel)} 수업권 · 말일 자동 낙찰</p>
          ${calendarStrip(cycle)}
        </div>
        <div class="panel tip-panel"><span aria-hidden="true">💡</span><div><b>선생님 팁</b><p>비공개 최대가 경매는 시작가를 낮게 설정할수록 더 많은 입찰을 유도할 수 있어요. 실제 결제가는 차순위 + 1,000원으로 결정됩니다.</p></div></div>
      </aside>
    </section>
  </main>`;
}

function teacherAuctionRow(a) {
  const price = a.state === AUCTION_STATE.AWARDED ? a.finalPrice : a.method === BID_METHOD.DUTCH ? a.currentPrice : a.startPrice;
  return `<article class="teacher-auction-row">
    <div class="tar-main">
      <div class="tar-badges">${methodBadge(a.method)}${stateBadge(a.state)}</div>
      <a href="#/auction/${encodeURIComponent(a.id)}" class="tar-title">${esc(a.listing?.title || '')}</a>
      <p class="small muted">${esc(a.cycleMonth)} 경매 · ${esc(a.classMonth)} 수업 · 입찰 ${a.bidCount}건</p>
    </div>
    <div class="tar-price"><span>${a.state === AUCTION_STATE.AWARDED ? '낙찰가' : '현재/시작가'}</span><b>${price ? fmtWon(price) : '-'}</b><small>/시간</small></div>
    <div class="tar-actions">
      <a class="btn btn-sm btn-ghost" href="#/auction/${encodeURIComponent(a.id)}">보기</a>
      ${[AUCTION_STATE.LIVE, AUCTION_STATE.SCHEDULED].includes(a.state) ? `<button class="btn btn-sm btn-outline" type="button" data-action="bump" data-id="${esc(a.id)}" ${a.canBump ? '' : 'disabled'}>${a.hasBumpedThisPeriod ? '끌올 완료' : '끌올'}</button>` : ''}
    </div>
  </article>`;
}

function teacherOrderRow(o) {
  const student = store.studentById(o.studentProfileId);
  return `<tr>
    <td><a href="#/order/${encodeURIComponent(o.id)}" class="table-link">${esc(o.lessonAt ? fmtShortDateTime(o.lessonAt) : '일정 미정')}</a><small>${esc(o.id)}</small></td>
    <td>${esc(student?.name || '학생')}</td>
    <td>${fmtWon(o.amount)}</td>
    <td class="muted">-${fmtWon(o.commissionAmount)}</td>
    <td><b>${fmtWon(o.amount - o.commissionAmount)}</b></td>
    <td>${orderBadge(o.status)}</td>
    <td><a class="text-link" href="#/order/${encodeURIComponent(o.id)}">상세</a></td>
  </tr>`;
}

export function renderNewListing() {
  const user = store.currentUser();
  if (user.role !== 'TEACHER') {
    return accessPrompt('선생님', 'u_t_kim', '수업을 등록하려면 선생님 체험 계정으로 전환해 주세요.');
  }
  const c0 = store.cycleNow();
  const c1 = store.cycleNext();
  const defaultCycle = new Date(c0.auctionEnd) > store.now ? 0 : 1;
  const cycleCard = (c, offset) => `<label class="cycle-option"><input type="radio" name="cycleOffset" value="${offset}" ${offset === defaultCycle ? 'checked' : ''}><span><b>${esc(c.auctionLabel)}</b><small>${esc(c.classLabel)} · ${fmtDate(c.auctionStart)} ~ ${fmtDate(c.auctionEnd)}</small></span></label>`;
  return `<main class="page narrow listing-page">
    <header class="dash-head"><div><p class="eyebrow">CREATE AUCTION</p><h1>새 수업 경매 등록</h1><p class="dash-sub">매월 1일부터 말일까지 경매가 열리고, 낙찰 수업은 다음 달에 시작됩니다.</p></div><a class="btn btn-ghost" href="#/teacher">← 대시보드</a></header>
    <form class="panel listing-form" data-form="create-listing" novalidate>
      <div class="form-error-slot" data-error-slot></div>
      <section class="form-section">
        <div class="form-section-head"><span class="form-num">01</span><div><h2>수업 기본 정보</h2><p>학부모님이 목록에서 가장 먼저 보는 정보입니다.</p></div></div>
        <div class="form-grid two">
          <label class="field"><span>과목</span><select name="subject" required><option>수학</option><option>영어</option><option>국어</option><option>과학</option><option>코딩</option><option>피아노</option><option>기타</option></select></label>
          <label class="field"><span>수업 방식</span><select name="mode"><option value="VISIT">방문</option><option value="ONLINE">온라인</option><option value="BOTH">온라인·방문</option></select></label>
        </div>
        <label class="field"><span>경매 제목</span><input name="title" maxlength="60" placeholder="예: 중2 수학, 한 달 동안 확실하게 잡기" required></label>
        <label class="field"><span>수업 소개</span><textarea name="description" rows="5" maxlength="600" placeholder="수업 방식, 숙제 관리, 학부모 피드백 등을 소개해 주세요." required></textarea></label>
        <div class="field"><span>프로필 이모지</span><div class="emoji-picker">${EMOJIS.map((e, i) => `<label class="emoji-option"><input type="radio" name="emoji" value="${e}" ${i === 0 ? 'checked' : ''}><span>${e}</span></label>`).join('')}</div></div>
        <div class="field"><span>가능 지역 <small>(방문 수업 시 필수)</small></span><div class="chip-check-grid">${REGIONS.map((r) => `<label class="check-chip"><input type="checkbox" name="regions" value="${esc(r)}"><span>${esc(r)}</span></label>`).join('')}</div></div>
        <div class="field"><span>가능 시간</span><div class="availability-row"><div class="day-checks">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label class="check-chip small"><input type="checkbox" name="days" value="${d}" ${[1, 3, 5].includes(d) ? 'checked' : ''}><span>${dayLabel(d)}</span></label>`).join('')}</div><div class="time-range"><input type="time" name="availStart" value="18:00" aria-label="시작 시간"><span>~</span><input type="time" name="availEnd" value="21:00" aria-label="종료 시간"></div></div><p class="field-help">선택한 요일에 같은 시간대를 사용합니다. 프로토타입에서는 단일 시간대만 설정합니다.</p></div>
      </section>

      <section class="form-section">
        <div class="form-section-head"><span class="form-num">02</span><div><h2>가격과 입찰 방식</h2><p>입찰 단위는 <b>시간당 수업료</b>입니다. 결제 총액은 시간당 가격 × 4회입니다.</p></div></div>
        <div class="method-picker">
          ${Object.entries(METHOD).map(([value, m], i) => `<label class="method-option"><input type="radio" name="method" value="${value}" ${i === 0 ? 'checked' : ''}><span class="method-card"><span class="method-icon">${m.icon}</span><b>${esc(m.label)}</b><small>${esc(m.desc)}</small></span></label>`).join('')}
        </div>
        <div class="form-grid two">
          <label class="field"><span>시간당 시작가</span><div class="input-won"><input type="number" name="startPrice" min="1000" step="1000" value="30000" required data-price-input><span>원</span></div><p class="field-help">학부모님이 볼 시작가입니다.</p></label>
          <label class="field" data-method-field="SEALED_MAX"><span>최소 입찰 단위</span><div class="input-won"><input type="number" name="minIncrement" min="1000" step="1000" value="1000"><span>원</span></div><p class="field-help">차순위 가격 + 이 금액으로 결제가 결정됩니다.</p></label>
          <label class="field" data-method-field="DUTCH"><span>최저가 (바닥가)</span><div class="input-won"><input type="number" name="floorPrice" min="1000" step="1000" value="20000"><span>원</span></div><p class="field-help">이 가격 아래로는 내려가지 않습니다.</p></label>
        </div>
        <div class="monthly-preview" data-monthly-preview><span>월 예상 결제</span><b>120,000원</b><small>시간당 30,000원 × 4회</small></div>
        <div class="dutch-preview" data-dutch-preview hidden><span>하락 경매 안내</span><p>등록 시점부터 말일까지 남은 시간에 맞춰 시간당 하락액을 자동 계산합니다. 현재가가 최저가에 도달하면 말일까지 최저가로 유지됩니다.</p></div>
      </section>

      <section class="form-section">
        <div class="form-section-head"><span class="form-num">03</span><div><h2>경매 사이클</h2><p>경매는 매월 1일부터 말일까지 진행됩니다.</p></div></div>
        <div class="cycle-options">${cycleCard(c0, 0)}${cycleCard(c1, 1)}</div>
        <p class="field-help">현재 사이클이 이미 종료된 경우 다음 달 경매로 자동 전환됩니다. 프로토타입에서는 서버 시간 대신 브라우저 시간을 사용합니다.</p>
      </section>

      <section class="form-section">
        <div class="form-section-head"><span class="form-num">04</span><div><h2>프리미엄 숏폼 영상</h2><p>30초 내외의 수업 소개 영상으로 신뢰를 높일 수 있습니다.</p></div></div>
        ${user.premium ? `<label class="switch-row"><input type="checkbox" name="useVideo"><span><b>숏폼 영상 사용</b><small>프리미엄 선생님 전용 · 모의 영상 카드로 표시됩니다.</small></span></label><div class="form-grid two video-fields" data-video-fields hidden><label class="field"><span>영상 제목</span><input name="videoTitle" maxlength="50" placeholder="예: 3분 만에 보는 수업 방식"></label><label class="field"><span>영상 길이 (초)</span><input type="number" name="videoDuration" min="10" max="60" value="30"></label></div>` : `<div class="premium-lock"><span>★</span><div><b>프리미엄 선생님 전용 기능</b><p>숏폼 영상과 월 1회 끌올을 사용하려면 프리미엄 구독이 필요합니다.</p></div><button type="button" class="btn btn-outline btn-sm" data-action="toggle-premium" data-id="${esc(user.id)}">프리미엄 시작</button></div>`}
      </section>

      <div class="form-actions"><a class="btn btn-ghost" href="#/teacher">취소</a><button class="btn btn-primary btn-lg" type="submit">경매 등록하기 <span aria-hidden="true">→</span></button></div>
      <p class="tiny muted form-disclaimer">등록 시 위 내용으로 경매가 즉시 열립니다. 월말에 자동 낙찰되며, 낙찰 전까지 입찰 금액은 비공개입니다.</p>
    </form>
  </main>`;
}

function bidStateLabel(state) {
  return {
    ACTIVE: ['입찰 참여 중', 'live'],
    WON: ['낙찰', 'awarded'],
    LOST: ['미낙찰', 'muted'],
    PAYMENT_FAILED: ['결제 실패', 'unsold'],
    CANCELLED: ['취소', 'muted'],
    PENDING_PAYMENT: ['결제 확인 중', 'pending'],
  }[state] || [state, 'muted'];
}

export function renderStudent() {
  const user = store.currentUser();
  if (user.role !== 'GUARDIAN') {
    return accessPrompt('학생·학부모', 'u_g_kim', '입찰, 결제, 수업 일정은 학부모 계정에서 확인할 수 있습니다.');
  }
  const profiles = store.studentProfiles();
  const cards = store.paymentMethods();
  const bids = store.myBids().sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt));
  const orders = store.myOrders().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const premiumLimit = user.premium ? 5 : 1;
  return `<main class="page dashboard">
    <header class="dash-head"><div><p class="eyebrow">FAMILY DESK</p><h1>${esc(user.name)} 학부모님${user.premium ? ' <span class="premium-star">★</span>' : ''}</h1><p class="dash-sub">${esc(user.phone)} · ${user.premium ? '프리미엄 학생' : '일반 학생'} · 자녀 ${profiles.length}/${premiumLimit}명</p></div><div class="dash-head-actions"><a class="btn btn-primary" href="#/">경매 둘러보기</a></div></header>
    <section class="dash-grid">
      <div class="dash-main">
        <div class="panel">
          <div class="panel-head"><div><p class="eyebrow">MY STUDENTS</p><h2>자녀 프로필</h2></div><button class="btn btn-sm btn-outline" type="button" data-action="open-child">+ 자녀 추가</button></div>
          <div class="student-grid">${profiles.map((p) => `<article class="student-card"><span class="student-avatar">${p.name.slice(0, 1)}</span><div><b>${esc(p.name)}</b><p>${esc(p.grade)} · ${esc(p.region)}</p><small>보호자 동의 완료</small></div></article>`).join('')}</div>
          <p class="tiny muted">${user.premium ? '프리미엄 학생은 최대 5명의 자녀를 등록할 수 있습니다.' : '일반 학생은 1명까지 등록할 수 있습니다. 프리미엄으로 업그레이드하면 최대 5명까지 가능합니다.'}</p>
        </div>
        <div class="panel">
          <div class="panel-head"><div><p class="eyebrow">MY BIDS</p><h2>내 입찰</h2></div><span class="count-pill">${bids.length}건</span></div>
          ${bids.length ? `<div class="my-bid-list">${bids.map(myBidRow).join('')}</div>` : emptyState({ icon: '🔒', title: '아직 입찰한 경매가 없어요', desc: '아이에게 맞는 선생님을 찾아 첫 입찰을 시작해 보세요.', action: '<a class="btn btn-primary" href="#/">경매 둘러보기</a>' })}
        </div>
        <div class="panel">
          <div class="panel-head"><div><p class="eyebrow">MY CLASSES</p><h2>수업과 결제</h2></div></div>
          ${orders.length ? `<div class="order-list">${orders.map(orderCard).join('')}</div>` : emptyState({ icon: '💳', title: '아직 결제한 수업이 없어요', desc: '낙찰되면 이곳에서 결제·일정·정산 상태를 확인할 수 있습니다.' })}
        </div>
      </div>
      <aside class="dash-side">
        <div class="panel premium-panel ${user.premium ? 'is-premium' : ''}">
          <div class="premium-head"><span class="premium-crown">★</span><div><p class="eyebrow">PREMIUM STUDENT</p><h2>${user.premium ? '프리미엄 학생' : '자녀를 더 등록하고 싶다면'}</h2></div></div>
          <ul class="benefit-list"><li>자녀 프로필 최대 5명</li><li>자녀별 입찰·결제 관리</li><li>프리미엄 배지와 우선 안내</li></ul>
          <div class="premium-price">${user.premium ? '월 9,900원 · 이용 중' : '월 9,900원 (모의 구독)'}</div>
          <button class="btn ${user.premium ? 'btn-outline' : 'btn-primary'} btn-block" type="button" data-action="toggle-premium" data-id="${esc(user.id)}">${user.premium ? '구독 해지 (데모)' : '프리미엄 시작하기'}</button>
        </div>
        <div class="panel">
          <div class="panel-head"><div><p class="eyebrow">PAYMENT METHODS</p><h2>결제수단</h2></div><button class="btn btn-sm btn-outline" type="button" data-action="open-card">+ 카드 추가</button></div>
          ${cards.length ? `<ul class="card-list">${cards.map((c) => `<li><span class="card-brand">${esc(c.brand)}</span><b>•••• ${esc(c.last4)}</b><small>${esc(c.exp)}${c.willFail ? ' · 테스트 실패 카드' : ''}</small></li>`).join('')}</ul>` : '<p class="small muted">등록된 카드가 없습니다.</p>'}
          <p class="tiny muted">실제 카드 정보는 저장하지 않습니다. 프로토타입은 마지막 4자리만 보관합니다.</p>
        </div>
        <div class="panel tip-panel"><span aria-hidden="true">🛡️</span><div><b>보호자 동의</b><p>미성년자 입찰에는 보호자 동의가 필요합니다. 결제수단은 보호자 명의 카드만 등록해 주세요.</p></div></div>
      </aside>
    </section>
  </main>`;
}

function myBidRow(bid) {
  const auction = store.getAuction(bid.auctionId);
  const [label, tone] = bidStateLabel(bid.state);
  if (!auction) return '';
  return `<article class="my-bid-row">
    <div class="my-bid-main"><div class="my-bid-badges">${methodBadge(auction.method)}<span class="status status-${tone}">${esc(label)}</span></div><a class="table-link" href="#/auction/${encodeURIComponent(auction.id)}">${esc(auction.listing?.title || '')}</a><p class="small muted">${esc(bid.bidderName)} · ${esc(bid.region)} · ${fmtShortDateTime(bid.placedAt)}</p></div>
    <div class="my-bid-amount"><span>${auction.method === BID_METHOD.SEALED_MAX ? '내 최대가' : '입찰가'}</span><b>${fmtWon(bid.amount)}</b><small>/시간</small></div>
    <a class="btn btn-sm btn-ghost" href="#/auction/${encodeURIComponent(auction.id)}">경매 보기</a>
  </article>`;
}

function orderCard(order) {
  const auction = store.state.auctions.find((a) => a.id === order.auctionId);
  const listing = auction ? store.listingById(auction.listingId) : null;
  const teacher = store.teacherById(order.teacherId)?.teacherProfile;
  const student = store.studentById(order.studentProfileId);
  return `<article class="order-card">
    <div class="order-card-head"><div><div class="order-badges">${orderBadge(order.status)}<span class="tiny muted">${esc(order.id)}</span></div><a href="#/order/${encodeURIComponent(order.id)}" class="order-title">${esc(listing?.title || '수업')}</a><p class="small muted">${esc(teacher?.displayName || '선생님')} · ${esc(student?.name || '학생')} · ${fmtWon(order.amount)}</p></div><a class="btn btn-sm btn-ghost" href="#/order/${encodeURIComponent(order.id)}">상세</a></div>
    ${stepper(order)}
    <div class="order-card-foot"><span>${order.lessonAt ? `수업 ${fmtDateTime(order.lessonAt)}` : '수업 일정 미정'}</span><span>${order.settledAt ? `정산 ${fmtDate(order.settledAt)}` : order.completedAt ? '정산 대기' : '에스크로 보관'}</span></div>
    ${order.status === ORDER_STATE.PAID ? `<button class="btn btn-sm btn-primary" type="button" data-action="open-schedule" data-id="${esc(order.id)}">수업 일정 확정</button>` : ''}
    ${order.status === ORDER_STATE.CONFIRMED ? `<button class="btn btn-sm btn-outline" type="button" data-action="complete-order" data-id="${esc(order.id)}">수업 완료 (데모)</button>` : ''}
  </article>`;
}

export function renderAdmin() {
  const user = store.currentUser();
  if (user.role !== 'ADMIN') {
    return accessPrompt('운영자', 'u_admin', '전체 경매·결제·정산 상태를 확인하려면 운영자 계정으로 전환해 주세요.');
  }
  const stats = store.stats();
  const auctions = store.listAuctions().sort((a, b) => new Date(b.endsAt) - new Date(a.endsAt));
  const orders = store.state.orders.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const payments = store.state.payments.slice(0, 12);
  const settlements = store.state.settlements.slice(0, 10);
  const events = store.state.events.slice(0, 12);
  const cycle = store.cycleNow();
  return `<main class="page dashboard admin-page">
    <header class="dash-head"><div><p class="eyebrow">OPERATIONS</p><h1>운영 콘솔</h1><p class="dash-sub">${esc(cycle.auctionLabel)} · ${esc(cycle.classLabel)} · 데모 시간 ${store.state.demo.offsetMs ? '이동됨' : '실시간'}</p></div><div class="dash-head-actions"><button class="btn btn-ghost" type="button" data-action="reset-demo">데모 초기화</button></div></header>
    <section class="stat-grid">
      <div class="stat-card"><span>진행 중 경매</span><b>${stats.live}</b><small>LIVE</small></div>
      <div class="stat-card"><span>낙찰 완료</span><b>${stats.awarded}</b><small>전체</small></div>
      <div class="stat-card"><span>유찰</span><b>${stats.unsold}</b><small>전체</small></div>
      <div class="stat-card accent"><span>에스크로 보관</span><b>${fmtWon(stats.escrow)}</b><small>HELD</small></div>
      <div class="stat-card"><span>누적 결제</span><b>${fmtWon(stats.gmv)}</b><small>GMV</small></div>
    </section>
    <section class="admin-time panel">
      <div><p class="eyebrow">TIME TRAVEL</p><h2>데모 시간·경매 마감 제어</h2><p class="small muted">월말 자동 낙찰과 하락 가격을 즉시 재현합니다. 실제 서비스에서는 서버 스케줄러가 담당합니다.</p></div>
      <div class="admin-time-actions"><button class="chip" type="button" data-action="shift-time" data-ms="3600000">+1시간</button><button class="chip" type="button" data-action="shift-time" data-ms="86400000">+1일</button><button class="chip" type="button" data-action="time-to-end">월말 10초 전</button><button class="chip" type="button" data-action="reset-time">시간 초기화</button><label class="switch-label"><input type="checkbox" data-action="toggle-rivals" ${store.state.demo.rivals ? 'checked' : ''}><span>가상 경쟁자 입찰</span></label></div>
    </section>
    <div class="panel">
      <div class="panel-head"><div><p class="eyebrow">AUCTIONS</p><h2>경매 모니터</h2></div><span class="count-pill">${auctions.length}</span></div>
      <div class="table-wrap"><table class="data-table admin-table"><thead><tr><th>경매</th><th>선생님</th><th>방식</th><th>상태</th><th>입찰</th><th>낙찰/현재가</th><th>마감</th><th></th></tr></thead><tbody>${auctions.map(adminAuctionRow).join('')}</tbody></table></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><p class="eyebrow">ORDERS</p><h2>주문·정산</h2></div></div>
      <div class="table-wrap"><table class="data-table admin-table"><thead><tr><th>주문</th><th>선생님</th><th>결제금</th><th>수수료</th><th>상태</th><th>수업일</th><th></th></tr></thead><tbody>${orders.length ? orders.map(adminOrderRow).join('') : '<tr><td colspan="7" class="muted">주문이 없습니다.</td></tr>'}</tbody></table></div>
    </div>
    <div class="admin-two-col">
      <div class="panel"><div class="panel-head"><div><p class="eyebrow">PAYMENTS</p><h2>결제 원장</h2></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>결제</th><th>금액</th><th>카드</th><th>에스크로</th><th>상태</th></tr></thead><tbody>${payments.map((p) => `<tr><td><small>${esc(p.tid || p.id)}</small>${p.orderId ? `<a class="table-link" href="#/order/${encodeURIComponent(p.orderId)}">${esc(p.orderId)}</a>` : ''}</td><td>${fmtWon(p.amount)}</td><td>${esc(p.brand || '-')} ${esc(p.last4 || '')}</td><td>${esc(p.escrow || '-')}</td><td>${p.status === 'PAID' ? '<span class="status status-paid">PAID</span>' : '<span class="status status-unsold">FAILED</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">결제 내역이 없습니다.</td></tr>'}</tbody></table></div></div>
      <div class="panel"><div class="panel-head"><div><p class="eyebrow">SETTLEMENTS</p><h2>정산 내역</h2></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>선생님</th><th>총액</th><th>수수료</th><th>실수령</th><th>상태</th></tr></thead><tbody>${settlements.map((s) => `<tr><td>${esc(store.teacherById(s.teacherId)?.name || '-')}</td><td>${fmtWon(s.gross)}</td><td>-${fmtWon(s.commission)}</td><td><b>${fmtWon(s.net)}</b></td><td><span class="status status-settled">${esc(s.status)}</span></td></tr>`).join('') || '<tr><td colspan="5" class="muted">정산 내역이 없습니다.</td></tr>'}</tbody></table></div></div>
    </div>
    <div class="panel"><div class="panel-head"><div><p class="eyebrow">EVENT LOG</p><h2>최근 이벤트</h2></div></div><ol class="event-log">${events.map((e) => `<li><span class="event-type">${esc(e.type)}</span><div><p>${esc(e.text)}</p><time>${fmtShortDateTime(e.createdAt)}</time></div></li>`).join('')}</ol></div>
  </main>`;
}

function adminAuctionRow(a) {
  const price = a.state === AUCTION_STATE.AWARDED ? a.finalPrice : a.method === BID_METHOD.DUTCH ? a.currentPrice : a.startPrice;
  return `<tr>
    <td><a class="table-link" href="#/auction/${encodeURIComponent(a.id)}">${esc(a.listing?.title || a.id)}</a><small>${esc(a.id)} · ${esc(a.cycleMonth)}</small></td>
    <td>${esc(a.teacher?.displayName || '-')}</td>
    <td>${esc(METHOD[a.method]?.short || a.method)}</td>
    <td>${stateBadge(a.state)}</td>
    <td>${a.bidCount}</td>
    <td>${price ? fmtWon(price) : '-'}</td>
    <td><small>${fmtShortDateTime(a.endsAt)}</small></td>
    <td>${[AUCTION_STATE.LIVE, AUCTION_STATE.SCHEDULED].includes(a.state) ? `<button class="btn btn-sm btn-outline" type="button" data-action="force-close" data-id="${esc(a.id)}">마감</button>` : `<a class="text-link" href="#/auction/${encodeURIComponent(a.id)}">보기</a>`}</td>
  </tr>`;
}

function adminOrderRow(o) {
  const teacher = store.teacherById(o.teacherId);
  return `<tr>
    <td><a class="table-link" href="#/order/${encodeURIComponent(o.id)}">${esc(o.id)}</a><small>${esc(store.listingById(store.state.auctions.find((a) => a.id === o.auctionId)?.listingId)?.title || '')}</small></td>
    <td>${esc(teacher?.name || '-')}</td>
    <td>${fmtWon(o.amount)}</td>
    <td class="muted">-${fmtWon(o.commissionAmount)}</td>
    <td>${orderBadge(o.status)}</td>
    <td><small>${o.lessonAt ? fmtShortDateTime(o.lessonAt) : '-'}</small></td>
    <td class="table-actions">
      ${o.status === ORDER_STATE.COMPLETED ? `<button class="btn btn-sm btn-primary" type="button" data-action="settle-order" data-id="${esc(o.id)}">정산</button>` : ''}
      ${[ORDER_STATE.PAID, ORDER_STATE.CONFIRMED, ORDER_STATE.COMPLETED].includes(o.status) ? `<button class="btn btn-sm btn-ghost" type="button" data-action="refund-order" data-id="${esc(o.id)}">환불</button>` : ''}
      <a class="text-link" href="#/order/${encodeURIComponent(o.id)}">상세</a>
    </td>
  </tr>`;
}

export function renderOrder(id) {
  const user = store.currentUser();
  const order = store.orderById(id);
  if (!order) {
    return `<main class="page narrow">${emptyState({ icon: '🧾', title: '주문을 찾을 수 없어요', desc: '주문 번호를 확인해 주세요.', action: '<a class="btn btn-primary" href="#/student">내 수업으로</a>' })}</main>`;
  }
  const allowed = user.role === 'ADMIN' || order.guardianId === user.id || order.teacherId === user.id;
  if (!allowed) {
    return `<main class="page narrow">${emptyState({ icon: '🔐', title: '접근할 수 없는 주문이에요', desc: '주문 당사자 또는 운영자만 확인할 수 있습니다.', action: '<a class="btn btn-primary" href="#/">경매 목록으로</a>' })}</main>`;
  }
  const auction = store.state.auctions.find((a) => a.id === order.auctionId);
  const listing = auction ? store.listingById(auction.listingId) : null;
  const teacher = store.teacherById(order.teacherId);
  const guardian = store.guardianById(order.guardianId);
  const student = store.studentById(order.studentProfileId);
  const payment = store.paymentForOrder(order.id);
  const settlement = store.settlementForOrder(order.id);
  const cycle = auction ? cycleFor(new Date(auction.startsAt), 0) : null;
  return `<main class="page narrow order-page">
    <nav class="breadcrumb"><a href="#/student">내 수업</a><span>›</span><b>${esc(order.id)}</b></nav>
    <header class="order-head">
      <div><p class="eyebrow">ORDER & SETTLEMENT</p><h1>${esc(listing?.title || '수업 주문')}</h1><p class="dash-sub">${esc(teacher?.name || '선생님')} · ${esc(student?.name || '학생')} · ${cycle ? esc(cycle.classLabel) : ''}</p></div>
      ${orderBadge(order.status)}
    </header>
    ${stepper(order)}
    ${order.status === ORDER_STATE.REFUNDED ? `<div class="notice notice-refund"><b>환불 완료</b><span>${esc(order.refundReason || '운영자 환불')} · ${fmtDateTime(order.refundedAt)}</span></div>` : ''}
    <div class="order-grid">
      <section class="panel">
        <div class="panel-head"><div><p class="eyebrow">PAYMENT</p><h2>결제 정보</h2></div></div>
        <dl class="detail-list">
          <div><dt>결제 금액</dt><dd><b>${fmtWon(order.amount)}</b></dd></div>
          <div><dt>시간당 낙찰가</dt><dd>${fmtWon(order.hourlyPrice)} × ${order.sessions}회</dd></div>
          <div><dt>플랫폼 수수료 (10%)</dt><dd>-${fmtWon(order.commissionAmount)}</dd></div>
          <div><dt>선생님 실수령</dt><dd><b>${fmtWon(order.amount - order.commissionAmount)}</b></dd></div>
          <div><dt>결제수단</dt><dd>${payment ? `${esc(payment.brand)} •••• ${esc(payment.last4)}` : '-'}</dd></div>
          <div><dt>승인번호</dt><dd>${payment ? esc(payment.tid || '-') : '-'}</dd></div>
          <div><dt>에스크로</dt><dd>${payment ? `<span class="status status-${payment.escrow === 'HELD' ? 'pending' : payment.escrow === 'RELEASED' ? 'settled' : 'muted'}">${esc(payment.escrow)}</span>` : '-'}</dd></div>
        </dl>
      </section>
      <section class="panel">
        <div class="panel-head"><div><p class="eyebrow">LESSON</p><h2>수업 정보</h2></div></div>
        <dl class="detail-list">
          <div><dt>수업 사이클</dt><dd>${cycle ? `${esc(cycle.classLabel)} · 주 1회 60분 × 4회` : '-'}</dd></div>
          <div><dt>수업 일정</dt><dd>${order.lessonAt ? fmtDateTime(order.lessonAt) : '미정'}</dd></div>
          <div><dt>학생</dt><dd>${esc(student?.name || '-')} (${esc(student?.grade || '')})</dd></div>
          <div><dt>보호자</dt><dd>${esc(guardian?.name || '-')} · ${esc(guardian?.phone || '')}</dd></div>
          <div><dt>선생님</dt><dd>${esc(teacher?.name || '-')}</dd></div>
          <div><dt>수업 방식</dt><dd>${esc(modeLabel(listing?.mode))} · ${esc((listing?.regions || []).join(', ') || '온라인')}</dd></div>
        </dl>
        <div class="order-actions">
          ${user.role === 'GUARDIAN' && order.status === ORDER_STATE.PAID ? `<button class="btn btn-primary" type="button" data-action="open-schedule" data-id="${esc(order.id)}">수업 일정 확정</button>` : ''}
          ${(user.role === 'GUARDIAN' || user.role === 'TEACHER') && order.status === ORDER_STATE.CONFIRMED ? `<button class="btn btn-outline" type="button" data-action="complete-order" data-id="${esc(order.id)}">수업 완료 처리 (데모)</button>` : ''}
          ${user.role === 'ADMIN' && order.status === ORDER_STATE.COMPLETED ? `<button class="btn btn-primary" type="button" data-action="settle-order" data-id="${esc(order.id)}">정산 실행</button>` : ''}
          ${user.role === 'ADMIN' && [ORDER_STATE.PAID, ORDER_STATE.CONFIRMED, ORDER_STATE.COMPLETED].includes(order.status) ? `<button class="btn btn-ghost" type="button" data-action="refund-order" data-id="${esc(order.id)}">환불</button>` : ''}
          ${payment && payment.status === 'PAID' ? `<button class="btn btn-ghost" type="button" data-action="open-receipt" data-id="${esc(order.id)}">영수증 보기</button>` : ''}
          <a class="btn btn-ghost" href="#/auction/${encodeURIComponent(order.auctionId)}">경매 보기</a>
        </div>
      </section>
    </div>
    ${settlement ? `<section class="panel settlement-panel"><div class="panel-head"><div><p class="eyebrow">SETTLEMENT</p><h2>정산 완료</h2></div><span class="status status-settled">PAID</span></div><div class="settlement-row"><div><span>총 결제금</span><b>${fmtWon(settlement.gross)}</b></div><div><span>수수료</span><b>-${fmtWon(settlement.commission)}</b></div><div><span>실수령</span><b>${fmtWon(settlement.net)}</b></div><div><span>정산일</span><b>${fmtDate(settlement.paidAt)}</b></div></div></section>` : ''}
    <section class="panel"><div class="panel-head"><div><p class="eyebrow">TIMELINE</p><h2>진행 기록</h2></div></div><ol class="order-timeline"><li><b>결제 완료</b><span>${fmtDateTime(order.paidAt)} · 에스크로 보관</span></li><li><b>수업 확정</b><span>${order.confirmedAt ? fmtDateTime(order.confirmedAt) : '대기 중'}</span></li><li><b>수업 완료</b><span>${order.completedAt ? fmtDateTime(order.completedAt) : '대기 중'}</span></li><li><b>정산 완료</b><span>${order.settledAt ? fmtDateTime(order.settledAt) : '대기 중'}</span></li></ol></section>
  </main>`;
}
