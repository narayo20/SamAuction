import { store } from './store.js';
import {
  BID_METHOD,
  AUCTION_STATE,
  ORDER_STATE,
  cycleFor,
} from '../src/domain/auction-engine.mjs';
import {
  ui,
  esc,
  fmtWon,
  fmtDate,
  fmtDateTime,
  fmtShortDateTime,
  countdown,
  dday,
  timeAgo,
  METHOD,
  AUCTION_STATE_INFO,
  ORDER_STATE_INFO,
  modeLabel,
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

function navActive(prefix) {
  const hash = window.location.hash.startsWith('#/') ? window.location.hash.slice(1) : '/';
  return hash === prefix || (prefix !== '/' && hash.startsWith(prefix)) ? 'is-active' : '';
}

function formatOffset(ms) {
  if (!ms) return '실시간';
  const abs = Math.abs(ms);
  const sign = ms > 0 ? '+' : '-';
  if (abs >= 86_400_000) return `${sign}${(abs / 86_400_000).toFixed(1)}일`;
  if (abs >= 3_600_000) return `${sign}${Math.round(abs / 3_600_000)}시간`;
  return `${sign}${Math.round(abs / 60_000)}분`;
}

export function renderHeader() {
  const user = store.currentUser();
  const cycle = store.cycleNow();
  const demo = store.state.demo;
  const roleLabel = user.role === 'TEACHER' ? '선생님' : user.role === 'ADMIN' ? '운영자' : '학부모';
  const premium = user.premium ? '<span class="premium-star" title="프리미엄">★</span>' : '';
  return `<header class="site-header">
    <div class="header-inner">
      <a class="brand" href="#/" aria-label="옥션&액션 홈">
        <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span>
        <span class="brand-text">옥션<span>&</span>액션</span>
      </a>
      <span class="cycle-pill" title="이번 달 경매 사이클">
        <i class="live-dot"></i>
        ${esc(cycle.auctionLabel)} <b>→</b> ${esc(cycle.classLabel)}
      </span>
      <nav class="main-nav" aria-label="주요 메뉴">
        <a class="${navActive('/')}" href="#/">경매 둘러보기</a>
        <a class="${navActive('/teacher')}" href="#/teacher">선생님</a>
        <a class="${navActive('/student')}" href="#/student">내 수업</a>
        <a class="${navActive('/admin')}" href="#/admin">운영</a>
      </nav>
      <div class="header-actions">
        <button class="demo-toggle ${demo.offsetMs || demo.rivals ? 'is-on' : ''}" type="button" data-action="toggle-demo" aria-expanded="${ui.demoOpen}">
          <span aria-hidden="true">⏱</span> 데모 <b>${esc(formatOffset(demo.offsetMs))}</b>
        </button>
        <label class="role-switch">
          <span class="sr-only">체험 계정 전환</span>
          <select data-action="switch-user" aria-label="체험 계정 전환">
            <optgroup label="선생님">
              ${store.state.users
                .filter((u) => u.role === 'TEACHER')
                .map((u) => `<option value="${u.id}" ${u.id === user.id ? 'selected' : ''}>${esc(u.name)} 선생님${u.premium ? ' ★' : ''}</option>`)
                .join('')}
            </optgroup>
            <optgroup label="학생·학부모">
              ${store.state.users
                .filter((u) => u.role === 'GUARDIAN')
                .map((u) => `<option value="${u.id}" ${u.id === user.id ? 'selected' : ''}>${esc(u.name)} 학부모${u.premium ? ' ★' : ''}</option>`)
                .join('')}
            </optgroup>
            <optgroup label="운영">
              <option value="u_admin" ${user.id === 'u_admin' ? 'selected' : ''}>운영자</option>
            </optgroup>
          </select>
        </label>
        <span class="user-chip">${premium}<span>${esc(user.name)}</span><small>${roleLabel}</small></span>
      </div>
    </div>
    ${ui.demoOpen ? `<div class="demo-bar">
      <div class="demo-bar-copy"><b>프로토타입 시간 여행</b><span>월말 자동 낙찰과 하락 가격을 즉시 확인할 수 있습니다. 실제 서비스에서는 서버 스케줄러가 처리합니다.</span></div>
      <div class="demo-actions">
        <button type="button" class="chip" data-action="shift-time" data-ms="3600000">+1시간</button>
        <button type="button" class="chip" data-action="shift-time" data-ms="86400000">+1일</button>
        <button type="button" class="chip" data-action="time-to-end">월말 10초 전</button>
        <button type="button" class="chip" data-action="reset-time">시간 초기화</button>
        <label class="switch-label"><input type="checkbox" data-action="toggle-rivals" ${demo.rivals ? 'checked' : ''}><span>가상 경쟁자 입찰</span></label>
        <button type="button" class="chip chip-danger" data-action="reset-demo">데모 초기화</button>
      </div>
    </div>` : ''}
  </header>`;
}

export function renderFooter() {
  return `<footer class="site-footer">
    <div class="footer-inner">
      <div>
        <b>옥션&액션</b>
        <p>월간 1:1 과외 경매 프로토타입. 모든 결제는 모의 결제이며 실제 금액이 청구되지 않습니다.</p>
      </div>
      <div class="footer-meta">
        <span>경매 1일~말일</span><span>수업 주 1회 × 4회</span><span>에스크로 정산</span>
      </div>
    </div>
  </footer>`;
}

function priceOf(auction) {
  if (auction.state === AUCTION_STATE.AWARDED) return { label: '낙찰가', value: auction.finalPrice, monthly: auction.finalPrice * auction.sessions };
  if (auction.state === AUCTION_STATE.UNSOLD) return { label: '결과', value: null, monthly: null };
  if (auction.method === BID_METHOD.DUTCH) return { label: '현재가', value: auction.currentPrice, monthly: auction.currentPrice * auction.sessions };
  if (auction.method === BID_METHOD.FIRST_COME) return { label: '즉시 낙찰가', value: auction.startPrice, monthly: auction.startPrice * auction.sessions };
  return { label: '시작가', value: auction.startPrice, monthly: auction.startPrice * auction.sessions };
}

export function renderAuctionCard(auction, { compact = false } = {}) {
  const teacher = auction.teacher || {};
  const listing = auction.listing || {};
  const price = priceOf(auction);
  const live = auction.state === AUCTION_STATE.LIVE;
  const scheduled = auction.state === AUCTION_STATE.SCHEDULED;
  const ended = [AUCTION_STATE.AWARDED, AUCTION_STATE.UNSOLD].includes(auction.state);
  const myBid = auction.myBid;
  const countdownTarget = live ? auction.endsAt : scheduled ? auction.startsAt : auction.endedAt;
  const countdownLabel = live ? '마감까지' : scheduled ? '오픈까지' : '종료';
  const bumped = Boolean(auction.bumpedAt);
  return `<a class="auction-card ${compact ? 'is-compact' : ''} ${ended ? 'is-ended' : ''}" href="#/auction/${encodeURIComponent(auction.id)}">
    <div class="card-top">
      <div class="card-badges">
        ${methodBadge(auction.method)}
        ${auction.teacherPremium ? '<span class="badge badge-premium">★ 프리미엄</span>' : ''}
        ${bumped ? '<span class="badge badge-bump">끌올</span>' : ''}
        ${myBid ? '<span class="badge badge-mine">내 입찰</span>' : ''}
      </div>
      ${stateBadge(auction.state)}
    </div>
    <div class="card-main">
      ${avatar(teacher, 'avatar-lg', auction.teacherPremium)}
      <div class="card-copy">
        <div class="card-teacher">
          <b>${esc(teacher.displayName || '선생님')}</b>
          <span class="rating">★ ${Number(teacher.rating || 0).toFixed(1)}</span>
          <span class="review-count">후기 ${Number(teacher.reviewCount || 0)}</span>
        </div>
        <h3>${esc(listing.title || '수업 경매')}</h3>
        <p class="card-meta">${esc(listing.subject || '')} · ${esc(modeLabel(listing.mode))} · ${esc((listing.regions || []).slice(0, 2).join(', ') || '온라인')}</p>
      </div>
    </div>
    <div class="card-price-row">
      <div class="card-price">
        <span>${esc(price.label)}</span>
        ${price.value ? `<b>${fmtWon(price.value)}</b><small>/시간</small>` : '<b class="muted">유찰</b>'}
      </div>
      <div class="card-countdown">
        <span>${esc(countdownLabel)}</span>
        ${live || scheduled ? `<b data-countdown data-target="${esc(countdownTarget)}">${countdown(new Date(countdownTarget).getTime() - store.now.getTime())}</b>` : `<b>${esc(auction.state === AUCTION_STATE.AWARDED ? '낙찰 완료' : '유찰')}</b>`}
      </div>
    </div>
    <div class="card-foot">
      <span class="bid-count"><i aria-hidden="true">👥</i> 입찰 <b>${auction.bidCount}</b>건</span>
      ${auction.method === BID_METHOD.DUTCH && live
        ? `<span class="dutch-mini" data-dutch-next data-auction="${esc(auction.id)}">다음 하락 ${auction.nextTickAt ? countdown(new Date(auction.nextTickAt).getTime() - store.now.getTime()) : '최저가'}</span>`
        : `<span class="monthly-mini">월 ${fmtWon(price.monthly || 0)} · 4회</span>`}
    </div>
  </a>`;
}

function filterAuctions(auctions) {
  const f = ui.filters;
  let list = auctions.slice();
  if (f.subject !== '전체') list = list.filter((a) => a.listing?.subject === f.subject);
  if (f.method !== '전체') list = list.filter((a) => a.method === f.method);
  if (f.region !== '전체') {
    list = list.filter((a) =>
      f.region === '온라인'
        ? a.listing?.mode === 'ONLINE' || a.listing?.mode === 'BOTH'
        : (a.listing?.regions || []).includes(f.region),
    );
  }
  if (f.q.trim()) {
    const q = f.q.trim().toLowerCase();
    list = list.filter((a) =>
      `${a.listing?.title || ''} ${a.teacher?.displayName || ''} ${a.listing?.subject || ''}`
        .toLowerCase()
        .includes(q),
    );
  }
  if (f.sort === 'ending') list.sort((a, b) => new Date(a.endsAt) - new Date(b.endsAt));
  else if (f.sort === 'price') list.sort((a, b) => (priceOf(a).value || 0) - (priceOf(b).value || 0));
  else if (f.sort === 'bumped') list.sort((a, b) => new Date(b.bumpedAt || b.listing?.createdAt || 0) - new Date(a.bumpedAt || a.listing?.createdAt || 0));
  return list;
}

function subjectOptions(auctions) {
  return ['전체', ...new Set(auctions.map((a) => a.listing?.subject).filter(Boolean))];
}

function regionOptions(auctions) {
  const regions = new Set();
  for (const a of auctions) for (const r of a.listing?.regions || []) regions.add(r);
  if (auctions.some((a) => ['ONLINE', 'BOTH'].includes(a.listing?.mode))) regions.add('온라인');
  return ['전체', ...regions];
}

function heroCycleCard(cycle, liveAuctions) {
  const endsIn = new Date(cycle.auctionEnd).getTime() - store.now.getTime();
  return `<div class="hero-card">
    <div class="hero-card-top"><span class="live-pill"><i class="live-dot"></i> 이번 달 경매</span><span class="hero-dday">${dday(endsIn)}</span></div>
    <h3>${esc(cycle.auctionLabel)}</h3>
    <p class="hero-card-sub">${esc(cycle.classLabel)} · 주 1회 60분 × 4회</p>
    <div class="hero-countdown" data-countdown data-target="${esc(cycle.auctionEnd.toISOString())}">${countdown(endsIn)}</div>
    <div class="hero-card-foot">
      <div><b>${liveAuctions.length}</b><span>진행 중 경매</span></div>
      <div><b>${liveAuctions.reduce((sum, a) => sum + a.bidCount, 0)}</b><span>누적 입찰</span></div>
      <div><b>${new Set(liveAuctions.map((a) => a.teacher?.displayName)).size}</b><span>참여 선생님</span></div>
    </div>
    <div class="hero-card-note"><span aria-hidden="true">⏳</span> 말일 23:59에 자동으로 낙찰·결제가 진행됩니다.</div>
  </div>`;
}

export function renderHome() {
  const all = store.listAuctions();
  const cycle = store.cycleNow();
  const live = all.filter((a) => a.state === AUCTION_STATE.LIVE && a.cycleMonth === cycle.auctionMonth);
  const scheduled = all.filter((a) => a.state === AUCTION_STATE.SCHEDULED);
  const past = all
    .filter((a) => [AUCTION_STATE.AWARDED, AUCTION_STATE.UNSOLD].includes(a.state))
    .sort((a, b) => new Date(b.endedAt || 0) - new Date(a.endedAt || 0))
    .slice(0, 4);
  const filtered = filterAuctions(live);
  const subjects = subjectOptions(live);
  const regions = regionOptions(live);
  const user = store.currentUser();

  return `<main>
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow"><span class="eyebrow-line"></span> 월간 1:1 과외 경매</p>
        <h1>가격은 <em>경매</em>로,<br>수업은 <em>확실</em>하게.</h1>
        <p class="hero-sub">선생님은 한 달 수업을 열고, 학부모님은 아이에게 맞는 가격을 제안합니다.<br>말일 자동 낙찰부터 에스크로 결제·정산까지 한 번에.</p>
        <div class="hero-cta">
          <a class="btn btn-primary" href="#auctions">이번 달 경매 보기 <span aria-hidden="true">→</span></a>
          <a class="btn btn-ghost" href="#/teacher/new">선생님으로 등록</a>
        </div>
        <div class="hero-trust"><span>✓ 보호자 동의</span><span>✓ 카드 정보 확인</span><span>✓ 수업 완료 후 정산</span></div>
      </div>
      ${heroCycleCard(cycle, live)}
    </section>

    <section class="cycle-section">
      <div class="section-head">
        <div><p class="eyebrow">MONTHLY CYCLE</p><h2>매월 1일부터 말일까지, 한 달 수업권을 경매합니다</h2></div>
        <p class="section-note">낙찰된 수업은 <b>${esc(cycle.classLabel)}</b>에 시작됩니다. 주 1회 60분, 총 4회.</p>
      </div>
      ${calendarStrip(cycle)}
    </section>

    <section class="auction-section" id="auctions">
      <div class="section-head">
        <div><p class="eyebrow">LIVE AUCTIONS</p><h2>지금 입찰할 수 있는 수업</h2></div>
        <div class="result-count"><b>${filtered.length}</b>개의 경매</div>
      </div>
      <div class="filter-bar">
        <div class="filter-chips" role="group" aria-label="과목 필터">
          ${subjects.map((s) => `<button type="button" class="chip ${ui.filters.subject === s ? 'is-active' : ''}" data-filter="subject" data-value="${esc(s)}">${esc(s)}</button>`).join('')}
        </div>
        <div class="filter-selects">
          <label><span class="sr-only">입찰 방식</span><select data-filter="method">
            <option value="전체" ${ui.filters.method === '전체' ? 'selected' : ''}>입찰 방식 전체</option>
            ${Object.values(METHOD).map((m) => `<option value="${m.label === '비공개 최대가' ? 'SEALED_MAX' : m.label === '선착순' ? 'FIRST_COME' : 'DUTCH'}" ${ui.filters.method === (m.label === '비공개 최대가' ? 'SEALED_MAX' : m.label === '선착순' ? 'FIRST_COME' : 'DUTCH') ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
          </select></label>
          <label><span class="sr-only">지역</span><select data-filter="region">
            ${regions.map((r) => `<option value="${esc(r)}" ${ui.filters.region === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}
          </select></label>
          <label><span class="sr-only">정렬</span><select data-filter="sort">
            <option value="ending" ${ui.filters.sort === 'ending' ? 'selected' : ''}>마감 임박순</option>
            <option value="bumped" ${ui.filters.sort === 'bumped' ? 'selected' : ''}>끌올·최신순</option>
            <option value="price" ${ui.filters.sort === 'price' ? 'selected' : ''}>낮은 가격순</option>
          </select></label>
          <label class="search-box"><span aria-hidden="true">⌕</span><input type="search" placeholder="선생님·과목 검색" value="${esc(ui.filters.q)}" data-filter="q" aria-label="검색"></label>
        </div>
      </div>
      <div class="auction-grid" id="auction-grid">
        ${filtered.length ? filtered.map((a) => renderAuctionCard(a)).join('') : emptyState({ icon: '🔍', title: '조건에 맞는 경매가 없어요', desc: '필터를 바꾸거나 다음 달 경매를 기다려 주세요.' })}
      </div>
    </section>

    ${scheduled.length ? `<section class="scheduled-section">
      <div class="section-head"><div><p class="eyebrow">UP NEXT</p><h2>다음 달 오픈 예정</h2></div><p class="section-note">시작일에 자동으로 열립니다.</p></div>
      <div class="auction-grid">${scheduled.map((a) => renderAuctionCard(a)).join('')}</div>
    </section>` : ''}

    <section class="how-section">
      <div class="section-head"><div><p class="eyebrow">HOW IT WORKS</p><h2>경매부터 정산까지, 한 달에 한 번</h2></div></div>
      <div class="how-grid">
        <div class="how-card"><span class="how-num">01</span><span class="how-icon">📝</span><h3>선생님 수업 등록</h3><p>사진·이모지, 가능 시간, 시간당 가격, 입찰 방식을 설정합니다. 프리미엄은 숏폼 영상과 월 1회 끌올을 사용할 수 있어요.</p></div>
        <div class="how-card"><span class="how-num">02</span><span class="how-icon">🔒</span><h3>학부모 입찰</h3><p>아이 이름·지역·결제수단을 등록하고 입찰합니다. 비공개 최대가는 서로의 금액을 볼 수 없습니다.</p></div>
        <div class="how-card"><span class="how-num">03</span><span class="how-icon">⚖️</span><h3>말일 자동 낙찰</h3><p>경매 종료 시 서버가 최고가를 평가합니다. 낙찰자의 카드로 자동 결제하고, 실패하면 차순위로 넘어갑니다.</p></div>
        <div class="how-card"><span class="how-num">04</span><span class="how-icon">💳</span><h3>수업·정산</h3><p>결제금은 에스크로에 보관됩니다. 수업 완료 후 플랫폼 수수료 10%를 제외하고 선생님께 정산됩니다.</p></div>
      </div>
    </section>

    ${past.length ? `<section class="past-section">
      <div class="section-head"><div><p class="eyebrow">RESULTS</p><h2>지난 경매 결과</h2></div><a class="text-link" href="#/admin">전체 운영 보기 →</a></div>
      <div class="auction-grid">${past.map((a) => renderAuctionCard(a, { compact: true })).join('')}</div>
    </section>` : ''}

    <section class="cta-section">
      <div class="cta-card">
        <div><p class="eyebrow">FOR TEACHERS</p><h2>${esc(user.role === 'TEACHER' ? '이번 달 수업을 열어 보세요' : '선생님이라면, 이번 달 수업을 열어 보세요')}</h2><p>월 1회 끌올과 숏폼 영상으로 더 많은 학부모님께 수업을 알릴 수 있습니다.</p></div>
        <a class="btn btn-light" href="#/teacher/new">수업 등록하기 <span aria-hidden="true">→</span></a>
      </div>
    </section>
  </main>`;
}

function teacherCard(auction) {
  const t = auction.teacher || {};
  return `<section class="panel teacher-panel">
    <div class="teacher-head">
      ${avatar(t, 'avatar-xl', auction.teacherPremium)}
      <div class="teacher-copy">
        <div class="teacher-name-row"><h2>${esc(t.displayName || '선생님')}</h2>${auction.teacherPremium ? '<span class="badge badge-premium">★ 프리미엄</span>' : ''}</div>
        <div class="teacher-stats"><span class="rating">★ ${Number(t.rating || 0).toFixed(1)}</span><span>후기 ${Number(t.reviewCount || 0)}</span><span>완료 ${Number(t.completedCount || 0)}회</span></div>
        <p class="teacher-bio">${esc(t.bio || '')}</p>
        <div class="teacher-tags">${(t.subjects || []).map((s) => `<span class="tag">${esc(s)}</span>`).join('')}<span class="tag">${esc(modeLabel(auction.listing?.mode))}</span>${(t.regions || []).map((r) => `<span class="tag tag-soft">${esc(r)}</span>`).join('')}</div>
      </div>
    </div>
  </section>`;
}

function videoCard(video) {
  if (!video) return '';
  return `<section class="panel video-panel">
    <div class="video-poster" data-action="play-video" data-title="${esc(video.title)}" role="button" tabindex="0">
      <span class="video-emoji">${esc(video.poster || '🎬')}</span>
      <span class="video-play" aria-hidden="true">▶</span>
      <span class="video-duration">숏폼 ${Number(video.duration || 30)}초</span>
      <span class="video-premium">프리미엄</span>
    </div>
    <div class="video-copy"><p class="eyebrow">SHORT VIDEO</p><h3>${esc(video.title)}</h3><p>수업 분위기와 스타일을 30초 안에 확인하세요.</p></div>
  </section>`;
}

function methodExplainer(auction) {
  const m = METHOD[auction.method] || METHOD.SEALED_MAX;
  const steps = auction.method === BID_METHOD.SEALED_MAX
    ? [
        ['01', '최대가 비공개 제출', '학부모님만 아는 최대 시간당 가격을 제출합니다.'],
        ['02', '말일 최고가 낙찰', '경매 종료 시 가장 높은 최대가를 제출한 분이 낙찰됩니다.'],
        ['03', '차순위 + 1,000원 결제', '실제 결제가는 차순위 최고가 + 1,000원, 내 최대가를 넘지 않습니다.'],
      ]
    : auction.method === BID_METHOD.FIRST_COME
      ? [
          ['01', '즉시 낙찰가 확인', '선생님이 정한 시간당 가격을 확인합니다.'],
          ['02', '결제 완료', '카드 승인이 완료된 첫 번째 학부모님이 낙찰됩니다.'],
          ['03', '바로 수업 확정', '경매가 즉시 종료되고 수업 일정을 조율합니다.'],
        ]
      : [
          ['01', '시작가에서 출발', '선생님이 정한 시간당 가격에서 경매가 시작됩니다.'],
          ['02', '1시간마다 하락', '입찰자가 없으면 매시간 가격이 내려갑니다.'],
          ['03', '현재가에 즉시 낙찰', '현재 가격에 입찰하고 결제가 승인되면 바로 낙찰됩니다.'],
        ];
  return `<section class="panel explain-panel">
    <div class="panel-head"><div><p class="eyebrow">BID METHOD</p><h2>${esc(m.label)} 방식</h2></div>${methodBadge(auction.method)}</div>
    <p class="explain-desc">${esc(m.desc)}</p>
    <div class="explain-steps">${steps.map(([n, title, desc]) => `<div class="explain-step"><span>${n}</span><div><b>${esc(title)}</b><p>${esc(desc)}</p></div></div>`).join('')}</div>
    <p class="explain-hint">${esc(m.hint)}</p>
  </section>`;
}

function bidFeed(auction) {
  const events = store.bidFeed(auction.id, 7);
  return `<section class="panel feed-panel">
    <div class="panel-head"><div><p class="eyebrow">LIVE FEED</p><h2>경매 기록</h2></div><span class="live-pill"><i class="live-dot"></i> ${auction.state === AUCTION_STATE.LIVE ? 'LIVE' : '종료'}</span></div>
    ${events.length ? `<ol class="feed-list">${events.map((e) => `<li><span class="feed-dot feed-${esc(e.type.toLowerCase())}"></span><div><p>${esc(e.text)}</p><time>${fmtShortDateTime(e.createdAt)}</time></div></li>`).join('')}</ol>` : `<p class="muted small">아직 기록이 없습니다.</p>`}
  </section>`;
}

function planPanel(auction) {
  const cycle = cycleFor(new Date(auction.startsAt), 0);
  const price = priceOf(auction);
  return `<section class="panel plan-panel">
    <div class="panel-head"><div><p class="eyebrow">MONTHLY PLAN</p><h2>${esc(cycle.classLabel)}</h2></div><span class="plan-badge">4회</span></div>
    ${calendarStrip(cycle)}
    <div class="plan-grid">
      <div><span>수업 구성</span><b>주 1회 60분 · 총 4회</b></div>
      <div><span>가능 시간</span><b>${esc(availabilityText(auction.listing?.availability))}</b></div>
      <div><span>수업 방식</span><b>${esc(modeLabel(auction.listing?.mode))}</b></div>
      <div><span>가능 지역</span><b>${esc((auction.listing?.regions || []).join(', ') || '온라인')}</b></div>
      <div><span>시간당 ${auction.state === AUCTION_STATE.AWARDED ? '낙찰가' : '시작가'}</span><b>${price.value ? fmtWon(price.value) : '-'}</b></div>
      <div><span>월 예상 결제</span><b>${price.monthly ? fmtWon(price.monthly) : '-'}</b></div>
    </div>
    <p class="plan-note">결제금은 수업 완료 전까지 에스크로에 보관됩니다. 수업 완료 후 플랫폼 수수료 10%를 제외하고 선생님께 정산됩니다.</p>
  </section>`;
}

function bidPanel(auction) {
  const user = store.currentUser();
  const m = METHOD[auction.method] || METHOD.SEALED_MAX;
  const price = priceOf(auction);
  const live = auction.state === AUCTION_STATE.LIVE;
  const pending = auction.state === AUCTION_STATE.AWARD_PENDING;
  const ended = [AUCTION_STATE.AWARDED, AUCTION_STATE.UNSOLD, AUCTION_STATE.CANCELLED, AUCTION_STATE.VOIDED].includes(auction.state);
  const scheduled = auction.state === AUCTION_STATE.SCHEDULED;
  const myBid = auction.myBid;
  const isGuardian = user.role === 'GUARDIAN';
  const myOrder = auction.order && auction.order.guardianId === user.id ? auction.order : null;
  const endsIn = new Date(auction.endsAt).getTime() - store.now.getTime();

  let cta = '';
  if (live && isGuardian) {
    const label = auction.method === BID_METHOD.SEALED_MAX
      ? myBid ? '내 최대가 수정' : '비공개 입찰하기'
      : auction.method === BID_METHOD.FIRST_COME
        ? '선착순으로 낙찰받기'
        : '현재가에 낙찰받기';
    cta = `<button class="btn btn-primary btn-block btn-lg" type="button" data-action="open-bid" data-id="${esc(auction.id)}">${label} <span aria-hidden="true">→</span></button>`;
  } else if (live && auction.isOwner) {
    cta = `<button class="btn btn-block btn-lg" type="button" disabled>내가 등록한 경매</button>`;
  } else if (live && user.role === 'ADMIN') {
    cta = `<button class="btn btn-block btn-lg" type="button" data-action="force-close" data-id="${esc(auction.id)}">데모: 지금 마감</button>`;
  } else if (live) {
    cta = `<button class="btn btn-block btn-lg" type="button" disabled>학생·보호자 계정으로 입찰할 수 있어요</button>`;
  } else if (pending) {
    cta = `<button class="btn btn-block btn-lg" type="button" disabled><span class="spinner small"></span> 낙찰 처리 중</button>`;
  } else if (myOrder) {
    cta = `<a class="btn btn-primary btn-block btn-lg" href="#/order/${encodeURIComponent(myOrder.id)}">내 결제·수업 보기 <span aria-hidden="true">→</span></a>`;
  } else if (auction.state === AUCTION_STATE.AWARDED) {
    cta = `<button class="btn btn-block btn-lg" type="button" disabled>낙찰이 완료되었습니다</button>`;
  } else if (auction.state === AUCTION_STATE.UNSOLD) {
    cta = `<button class="btn btn-block btn-lg" type="button" disabled>입찰자가 없어 유찰되었습니다</button>`;
  } else if (scheduled) {
    cta = `<button class="btn btn-block btn-lg" type="button" disabled>${fmtDate(auction.startsAt)} 오픈 예정</button>`;
  } else {
    cta = `<button class="btn btn-block btn-lg" type="button" disabled>종료된 경매입니다</button>`;
  }

  const priceBlock = auction.state === AUCTION_STATE.UNSOLD
    ? `<div class="big-price muted">유찰</div><p class="price-caption">입찰자가 없어 다음 달을 기다립니다.</p>`
    : `<div class="big-price">${price.value ? fmtWon(price.value) : '-'}<small>/시간</small></div>
       <p class="price-caption">${esc(price.label)} · 월 ${price.monthly ? fmtWon(price.monthly) : '-'} (4회)</p>`;

  return `<aside class="bid-panel">
    <div class="bid-panel-top">
      <div class="bid-panel-badges">${methodBadge(auction.method)}${stateBadge(auction.state)}</div>
      ${live ? `<div class="panel-countdown"><span>경매 마감까지</span><b data-countdown data-target="${esc(auction.endsAt)}">${countdown(endsIn)}</b></div>` : scheduled ? `<div class="panel-countdown"><span>오픈까지</span><b data-countdown data-target="${esc(auction.startsAt)}">${countdown(new Date(auction.startsAt).getTime() - store.now.getTime())}</b></div>` : `<div class="panel-ended">${auction.state === AUCTION_STATE.AWARDED ? '낙찰 완료' : '경매 종료'}</div>`}
    </div>
    <div class="price-block">
      ${priceBlock}
      ${auction.method === BID_METHOD.DUTCH && live ? `<div class="dutch-live"><span>다음 하락까지</span><b data-dutch-next data-auction="${esc(auction.id)}">${auction.nextTickAt ? countdown(new Date(auction.nextTickAt).getTime() - store.now.getTime()) : '최저가 도달'}</b><small>매시간 ${fmtWon(auction.decrementPerHour)} 하락 · 최저 ${fmtWon(auction.floorPrice)}</small></div>` : ''}
      ${auction.method === BID_METHOD.SEALED_MAX && live ? `<div class="sealed-note"><span aria-hidden="true">🔒</span><div><b>현재 최고가 비공개</b><p>입찰 ${auction.bidCount}건 · 금액은 서로에게 공개되지 않습니다.</p></div></div>` : ''}
      ${myBid && auction.method === BID_METHOD.SEALED_MAX && live ? `<div class="my-bid-box"><span>내 최대가</span><b>${fmtWon(myBid.amount)}</b><small>${myBid.state === 'ACTIVE' ? '낙찰 시 차순위 + 1,000원으로 결제' : myBid.state}</small></div>` : ''}
      ${auction.state === AUCTION_STATE.AWARDED ? `<div class="winner-box"><span>낙찰자</span><b>${esc(auction.winner?.guardianName || '○○')} 학부모</b><small>${auction.winner ? esc(auction.winner.region) : ''} · ${fmtWon(auction.finalPrice)}/시간</small></div>` : ''}
    </div>
    <div class="bid-cta">${cta}</div>
    ${live ? `<p class="bid-footnote">${auction.method === BID_METHOD.SEALED_MAX ? '보호자 동의와 카드 확인 후 입찰할 수 있습니다. 낙찰 전까지 금액은 공개되지 않습니다.' : auction.method === BID_METHOD.FIRST_COME ? '결제가 승인된 순간 경매가 종료됩니다. 신중하게 참여해 주세요.' : '현재가가 바뀌면 결제 직전에 다시 확인합니다. 가격이 내려갈수록 경쟁이 빨라질 수 있어요.'}</p>` : ''}
    ${auction.isOwner ? `<div class="owner-actions">
      <button class="btn btn-outline btn-block" type="button" data-action="bump" data-id="${esc(auction.id)}" ${auction.canBump ? '' : 'disabled'}>${auction.hasBumpedThisPeriod ? '이번 달 끌올 사용 완료' : auction.canBump ? '프리미엄 끌올 사용' : '끌올은 프리미엄 전용'}</button>
      <p class="tiny muted">프리미엄 선생님은 월 1회 목록 상단 노출이 가능합니다.</p>
    </div>` : ''}
    <div class="trust-list">
      <div><span>🛡️</span><p><b>에스크로 보관</b>수업 완료 전까지 결제금을 안전하게 보관합니다.</p></div>
      <div><span>🤝</span><p><b>1:1 매칭</b>낙찰 후 선생님과 일정을 조율합니다.</p></div>
      <div><span>↩️</span><p><b>환불 정책</b>수업 24시간 전까지 전액 환불 가능합니다.</p></div>
    </div>
    <details class="demo-tools">
      <summary>프로토타입 도구</summary>
      <div class="demo-tool-grid">
        <button type="button" class="chip" data-action="demo-close" data-id="${esc(auction.id)}" data-seconds="10">10초 뒤 마감</button>
        <button type="button" class="chip" data-action="force-close" data-id="${esc(auction.id)}">지금 마감</button>
        <button type="button" class="chip" data-action="shift-time" data-ms="3600000">시간 +1시간</button>
        ${auction.method === BID_METHOD.SEALED_MAX ? `<button type="button" class="chip" data-action="add-rival" data-id="${esc(auction.id)}">경쟁 입찰 추가</button>` : ''}
      </div>
      <p class="tiny muted">데모 도구는 발표·검수용입니다. 실제 서비스에서는 서버 스케줄러가 월말에 자동 처리합니다.</p>
    </details>
  </aside>`;
}

export function renderAuction(id) {
  const auction = store.getAuction(id);
  if (!auction) {
    return `<main class="page narrow">${emptyState({ icon: '🧭', title: '경매를 찾을 수 없어요', desc: '주소가 올바른지 확인하거나 목록으로 돌아가 주세요.', action: '<a class="btn btn-primary" href="#/">경매 목록으로</a>' })}</main>`;
  }
  const listing = auction.listing || {};
  const teacher = auction.teacher || {};
  const cycle = cycleFor(new Date(auction.startsAt), 0);
  return `<main class="auction-page">
    <nav class="breadcrumb"><a href="#/">경매</a><span>›</span><span>${esc(listing.subject || '')}</span><span>›</span><b>${esc(listing.title || '')}</b></nav>
    <div class="auction-layout">
      <div class="auction-main">
        <div class="auction-title-block">
          <div class="title-badges">${methodBadge(auction.method)}${auction.teacherPremium ? '<span class="badge badge-premium">★ 프리미엄</span>' : ''}${auction.bumpedAt ? '<span class="badge badge-bump">끌올</span>' : ''}</div>
          <h1>${esc(listing.title || '')}</h1>
          <p class="auction-sub">${esc(listing.subject || '')} · ${esc(modeLabel(listing.mode))} · ${esc((listing.regions || []).join(', ') || '온라인')} · ${esc(cycle.classLabel)}</p>
        </div>
        ${teacherCard(auction)}
        ${videoCard(listing.premiumVideo)}
        <section class="panel desc-panel"><p class="eyebrow">ABOUT THE CLASS</p><h2>수업 소개</h2><p>${esc(listing.description || '')}</p></section>
        ${planPanel(auction)}
        ${methodExplainer(auction)}
        ${bidFeed(auction)}
      </div>
      <div class="bid-rail">${bidPanel(auction)}</div>
    </div>
  </main>`;
}
