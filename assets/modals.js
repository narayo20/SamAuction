import { store } from './store.js';
import { BID_METHOD, kstParts } from '../src/domain/auction-engine.mjs';
import {
  esc,
  fmtWon,
  fmtDate,
  fmtDateTime,
  countdown,
  METHOD,
  modeLabel,
  availabilityText,
  openModal,
  closeModal,
  setModal,
  modalHeader,
  toast,
  errorBox,
} from './ui.js';
import { mockCharge, validateCardInput, TEST_CARDS, formatCardNumber, formatExpiry } from './payment.js';

const REGION_OPTIONS = [
  '서울 강남구', '서울 서초구', '서울 마포구', '서울 서대문구', '서울 송파구',
  '서울 강동구', '서울 용산구', '서울 노원구', '서울 관악구', '서울 성동구',
  '경기 성남시', '경기 용인시', '경기 고양시', '경기 수원시', '인천 연수구',
];

function tomorrowInput() {
  const p = kstParts(new Date(store.now.getTime() + 86_400_000));
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function openBidModal(auctionId) {
  const auction = store.getAuction(auctionId);
  const user = store.currentUser();
  if (!auction) return toast('경매를 찾을 수 없습니다.', 'error');
  if (user.role !== 'GUARDIAN') return toast('학생·보호자 계정으로 전환해 주세요.', 'error');
  const profiles = store.studentProfiles();
  if (profiles.length === 0) return toast('먼저 자녀 프로필을 등록해 주세요.', 'error');
  const cards = store.paymentMethods();
  const m = METHOD[auction.method] || METHOD.SEALED_MAX;
  const isSealed = auction.method === BID_METHOD.SEALED_MAX;
  const isDutch = auction.method === BID_METHOD.DUTCH;
  const myBid = auction.myBid;
  const defaultAmount = isSealed ? (myBid?.state === 'ACTIVE' ? myBid.amount : auction.startPrice) : auction.currentPrice;
  const listing = auction.listing || {};
  const regionChoices = listing.mode === 'VISIT'
    ? (listing.regions || [])
    : [...new Set([...(listing.regions || []), ...profiles.map((p) => p.region), ...REGION_OPTIONS])];
  const selectedProfile = profiles[0];
  const selectedCard = cards.find((c) => !c.willFail) || cards[0];
  const amountField = isSealed
    ? `<label class="field"><span>나의 최대 시간당 입찰가</span><div class="input-won"><input type="number" name="amount" min="${auction.startPrice}" step="1000" value="${defaultAmount}" required data-bid-amount><span>원</span></div><p class="field-help">시작가 ${fmtWon(auction.startPrice)} 이상. 이 금액은 다른 학부모님과 선생님에게 공개되지 않습니다.</p></label>
       <div class="bid-preview"><div><span>낙찰 시 결제 예상</span><b data-bid-monthly>${fmtWon(defaultAmount * 4)}</b><small>최대가 기준 월 4회 · 실제 결제가는 차순위 + 1,000원</small></div></div>`
    : `<div class="fixed-price-box"><span>${isDutch ? '현재 시간당 가격' : '즉시 낙찰가'}</span><b>${fmtWon(auction.currentPrice)}</b><small>월 ${fmtWon(auction.currentPrice * 4)} · 4회</small>${isDutch ? `<em>가격 고정 60초 · 다음 하락 ${auction.nextTickAt ? countdown(new Date(auction.nextTickAt).getTime() - store.now.getTime()) : '최저가'}</em>` : ''}</div>
       <input type="hidden" name="amount" value="${auction.currentPrice}">`;

  const paymentSection = cards.length
    ? `<div class="field"><span>결제수단</span><div class="pay-options">${cards.map((c) => `<label class="pay-option"><input type="radio" name="paymentMethodId" value="${esc(c.id)}" ${selectedCard?.id === c.id ? 'checked' : ''}><span><b>${esc(c.brand)}</b><small>•••• ${esc(c.last4)} · ${esc(c.exp)}${c.willFail ? ' · 실패 테스트' : ''}</small></span></label>`).join('')}</div><button type="button" class="text-link small" data-action="open-card" data-return-bid="${esc(auction.id)}">+ 새 카드 등록</button></div>`
    : `<div class="field"><span>결제수단</span><div class="no-card-box"><b>등록된 카드가 없습니다.</b><p>보호자 명의 카드를 먼저 등록해 주세요.</p><button type="button" class="btn btn-sm btn-outline" data-action="open-card" data-return-bid="${esc(auction.id)}">카드 등록하기</button></div></div>`;

  openModal(`${modalHeader(isSealed ? '비공개 최대가 입찰' : isDutch ? '현재가로 낙찰받기' : '선착순 낙찰', `${m.label} · ${auction.listing?.title || ''}`, 'modal-wide')}
    <div class="bid-modal-body">
      <div class="bid-modal-summary">
        <div class="modal-teacher"><span class="modal-teacher-emoji" aria-hidden="true">${esc(auction.teacher?.emoji || '📚')}</span><div><b>${esc(auction.teacher?.displayName || '선생님')}</b><small>${esc(modeLabel(listing.mode, listing.groupSize))} · ${esc((listing.regions || []).join(', ') || (listing.mode === 'GROUP' ? '그룹 · 지역 협의' : listing.mode === 'ONLINE' ? '화상 · 지역 무관' : '지역 협의'))}</small></div></div>
        <div class="modal-price"><span>${isSealed ? '시작가' : isDutch ? '현재가' : '낙찰가'}</span><b>${fmtWon(isSealed ? auction.startPrice : auction.currentPrice)}</b><small>/시간 · 월 ${fmtWon((isSealed ? auction.startPrice : auction.currentPrice) * 4)}</small></div>
      </div>
      <div class="modal-note">${esc(m.hint)}</div>
      <form data-form="bid" data-auction="${esc(auction.id)}" data-method="${esc(auction.method)}" novalidate>
        <div data-bid-error></div>
        <div class="form-grid two">
          <label class="field"><span>입찰할 자녀</span><select name="studentProfileId">${profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.grade)}</option>`).join('')}</select></label>
          <label class="field"><span>보호자</span><input value="${esc(user.name)}" readonly></label>
          <label class="field"><span>연락처</span><input name="contact" type="tel" value="${esc(user.phone)}" required></label>
          <label class="field"><span>입찰 지역</span><select name="regionCode">${regionChoices.map((r) => `<option value="${esc(r)}" ${r === selectedProfile.region ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
        </div>
        ${amountField}
        ${paymentSection}
        <label class="consent-row"><input type="checkbox" name="guardianConsent" required><span>보호자로서 본 입찰에 동의하며, 낙찰 시 자동 결제 및 환불 정책에 동의합니다.</span></label>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">취소</button><button type="submit" class="btn btn-primary btn-lg">${isSealed ? (myBid?.state === 'ACTIVE' ? '내 최대가 수정' : '비공개 입찰하기') : '결제하고 낙찰받기'} <span aria-hidden="true">→</span></button></div>
        <details class="test-card-hint"><summary>테스트 카드 안내</summary><p>성공: 4242 4242 4242 4242 · 실패: 4000 0000 0000 0002. 실제 결제는 발생하지 않습니다.</p></details>
      </form>
    </div>`, { className: 'modal-wide' });
}

export function openCardModal(returnToBid = '') {
  const user = store.currentUser();
  if (user.role !== 'GUARDIAN') return toast('보호자 계정에서만 카드를 등록할 수 있습니다.', 'error');
  openModal(`${modalHeader('카드 등록', '모의 카드 · 실제 결제 없음')}
    <form data-form="card" data-return-bid="${esc(returnToBid)}" novalidate>
      <div data-card-error></div>
      <label class="field"><span>카드 번호</span><input name="number" inputmode="numeric" placeholder="4242 4242 4242 4242" maxlength="19" required data-card-number></label>
      <div class="form-grid three">
        <label class="field"><span>유효기간</span><input name="exp" inputmode="numeric" placeholder="MM/YY" maxlength="5" required data-card-exp></label>
        <label class="field"><span>CVC</span><input name="cvc" inputmode="numeric" placeholder="123" maxlength="4" required></label>
        <label class="field"><span>비밀번호 앞 2자리</span><input name="password" type="password" inputmode="numeric" placeholder="**" maxlength="2" required></label>
      </div>
      <label class="field"><span>카드 소유자</span><input name="ownerName" value="${esc(user.name)}" required></label>
      <div class="modal-note">카드 등록 시 1원 승인 후 즉시 취소하는 모의 검증을 수행합니다. 카드 번호 전체는 저장하지 않고 마지막 4자리만 보관합니다.</div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">취소</button><button type="submit" class="btn btn-primary">카드 확인 및 등록</button></div>
      <details class="test-card-hint" open><summary>테스트 카드</summary>${TEST_CARDS.map((c) => `<p><b>${esc(c.number)}</b> · ${esc(c.label)}</p>`).join('')}</details>
    </form>`, { className: 'modal-sm' });
}

export function openScheduleModal(orderId) {
  const order = store.orderById(orderId);
  if (!order) return toast('주문을 찾을 수 없습니다.', 'error');
  const auction = store.state.auctions.find((a) => a.id === order.auctionId);
  const listing = auction ? store.listingById(auction.listingId) : null;
  openModal(`${modalHeader('수업 일정 확정', `${fmtWon(order.amount)} · 월 4회`)}
    <div class="schedule-summary"><b>${esc(listing?.title || '수업')}</b><p>${esc(availabilityText(listing?.availability))}</p><small>선생님 가능 시간 내에서 선택해 주세요. 확정 후 변경은 선생님과 협의가 필요합니다.</small></div>
    <form data-form="schedule" data-order="${esc(order.id)}" novalidate>
      <div data-schedule-error></div>
      <div class="form-grid two"><label class="field"><span>수업 날짜</span><input type="date" name="date" value="${tomorrowInput()}" min="${tomorrowInput()}" required></label><label class="field"><span>수업 시간</span><select name="time"><option>17:00</option><option>18:00</option><option selected>19:00</option><option>20:00</option><option>21:00</option></select></label></div>
      <div class="modal-note">프로토타입에서는 일정 확정 시 상태가 <b>PAID → CONFIRMED</b>로 전환됩니다. 실제 서비스에서는 선생님 캘린더 중복 검증이 추가됩니다.</div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">취소</button><button type="submit" class="btn btn-primary">일정 확정</button></div>
    </form>`);
}

export function openChildModal() {
  const user = store.currentUser();
  if (user.role !== 'GUARDIAN') return toast('보호자 계정에서만 자녀를 등록할 수 있습니다.', 'error');
  const limit = user.premium ? 5 : 1;
  const count = store.studentProfiles().length;
  if (count >= limit) {
    return toast(user.premium ? '프리미엄은 최대 5명까지 등록할 수 있습니다.' : '일반 학생은 1명만 등록할 수 있습니다. 프리미엄으로 업그레이드해 주세요.', 'error');
  }
  openModal(`${modalHeader('자녀 프로필 추가', `현재 ${count}/${limit}명`)}
    <form data-form="child" novalidate>
      <div data-child-error></div>
      <label class="field"><span>자녀 이름</span><input name="name" placeholder="예: 김하린" required></label>
      <div class="form-grid two"><label class="field"><span>학년</span><input name="grade" placeholder="예: 초6"></label><label class="field"><span>지역</span><select name="region">${REGION_OPTIONS.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label></div>
      <div class="modal-note">미성년자 프로필에는 보호자 동의가 필요합니다. 자녀별로 입찰·결제 내역이 분리됩니다.</div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">취소</button><button type="submit" class="btn btn-primary">프로필 추가</button></div>
    </form>`, { className: 'modal-sm' });
}

export function openVideoModal(title) {
  openModal(`${modalHeader(title || '숏폼 수업 영상', '프리미엄 선생님')}
    <div class="mock-player"><span class="mock-player-emoji">🎬</span><span class="mock-play">▶</span><div class="mock-progress"><i></i></div><span class="mock-time">00:12 / 00:32</span></div>
    <p class="modal-note">프로토타입에서는 실제 영상 대신 숏폼 플레이어 목업을 표시합니다. 실제 서비스에서는 60초 이내 MP4 업로드와 검수를 거칩니다.</p>
    <div class="modal-actions"><button type="button" class="btn btn-primary" data-action="close-modal">확인</button></div>`);
}

export function openBidSuccess({ title, description, amount, extra = '' }) {
  openModal(`${modalHeader(title, '접수 완료')}
    <div class="success-panel"><span class="success-check">✓</span><h3>${esc(title)}</h3><p>${esc(description)}</p>${amount ? `<div class="success-amount">${fmtWon(amount)}</div>` : ''}${extra}</div>
    <div class="modal-actions"><button type="button" class="btn btn-primary" data-action="close-modal">확인</button></div>`, { className: 'modal-sm' });
}

export function openReceipt(orderId) {
  const order = store.orderById(orderId);
  if (!order) return;
  const payment = store.paymentForOrder(orderId);
  const auction = store.state.auctions.find((a) => a.id === order.auctionId);
  const listing = auction ? store.listingById(auction.listingId) : null;
  const teacher = store.teacherById(order.teacherId);
  openModal(`${modalHeader('결제가 완료되었습니다', '모의 결제 영수증')}
    <div class="receipt">
      <div class="receipt-check">✓</div>
      <p class="receipt-label">에스크로 보관</p>
      <div class="receipt-amount">${fmtWon(order.amount)}</div>
      <dl class="detail-list">
        <div><dt>수업</dt><dd>${esc(listing?.title || '')}</dd></div>
        <div><dt>선생님</dt><dd>${esc(teacher?.name || '')}</dd></div>
        <div><dt>수업 사이클</dt><dd>${esc(auction?.classMonth || '')} · 4회</dd></div>
        <div><dt>결제수단</dt><dd>${esc(payment?.brand || '')} •••• ${esc(payment?.last4 || '')}</dd></div>
        <div><dt>승인번호</dt><dd>${esc(payment?.tid || '')}</dd></div>
        <div><dt>영수증 번호</dt><dd>${esc(payment?.receiptNo || '')}</dd></div>
      </dl>
      <p class="receipt-note">결제금은 수업 완료 전까지 에스크로에 보관됩니다. 수업 완료 후 플랫폼 수수료 10%를 제외하고 선생님께 정산됩니다.</p>
    </div>
    <div class="modal-actions"><a class="btn btn-primary" href="#/order/${encodeURIComponent(order.id)}" data-action="close-modal">수업 상세 보기</a><button type="button" class="btn btn-ghost" data-action="close-modal">닫기</button></div>`, { className: 'modal-sm' });
}

export function showProcessing({ amount, label = '카드 승인을 확인하고 있습니다' }) {
  setModal(`${modalHeader('결제 확인 중', '잠시만 기다려 주세요')}
    <div class="processing-panel"><span class="spinner large"></span><h3>${esc(label)}</h3><p>${fmtWon(amount)} · 모의 PG 승인 요청</p><div class="processing-bar"><i></i></div></div>`, { className: 'modal-sm' });
}

export function showBidError(message, auctionId) {
  const slot = document.querySelector('[data-bid-error]');
  if (slot) {
    slot.innerHTML = errorBox(message);
    slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    toast(message, 'error');
  }
  if (auctionId) {
    const form = document.querySelector('[data-form="bid"]');
    if (form) form.dataset.auction = auctionId;
  }
}

export function openPaymentFailure(message, auctionId) {
  openModal(`${modalHeader('결제가 승인되지 않았습니다', '모의 PG · 카드 거절')}
    <div class="fail-panel"><span class="fail-icon">!</span><h3>결제를 완료하지 못했습니다</h3><p>${esc(message || '카드 승인이 거절되었습니다.')}</p><div class="modal-note">입찰은 확정되지 않았으며 경매는 다시 열립니다. 다른 카드로 재시도할 수 있습니다.</div></div>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">닫기</button><button type="button" class="btn btn-primary" data-action="open-bid" data-id="${esc(auctionId)}">다시 시도</button></div>`, { className: 'modal-sm' });
}

export async function chargeCard({ card, amount }) {
  return mockCharge({ card, amount });
}

export { validateCardInput, formatCardNumber, formatExpiry };
