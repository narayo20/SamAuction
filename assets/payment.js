export const TEST_CARDS = [
  { number: '4242 4242 4242 4242', label: '성공 카드', tone: 'success' },
  { number: '5555 5555 5555 4444', label: '성공 카드 (Mastercard)', tone: 'success' },
  { number: '4000 0000 0000 0002', label: '승인 거절 카드', tone: 'fail' },
];

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export function formatCardNumber(value) {
  const digits = digitsOnly(value).slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

export function formatExpiry(value) {
  const digits = digitsOnly(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function cardBrand(number) {
  const digits = digitsOnly(number);
  if (digits.startsWith('4')) return 'VISA';
  if (digits.startsWith('5')) return 'Mastercard';
  if (digits.startsWith('3')) return 'AMEX';
  return '국내카드';
}

export function validateCardInput({ number, exp, cvc, password, ownerName }) {
  const errors = {};
  const digits = digitsOnly(number);
  if (digits.length !== 16) errors.number = '카드 번호 16자리를 입력해 주세요.';
  if (!/^\d{2}\/\d{2}$/.test(String(exp || ''))) {
    errors.exp = 'MM/YY 형식으로 입력해 주세요.';
  } else {
    const [mm, yy] = String(exp).split('/').map(Number);
    if (mm < 1 || mm > 12) errors.exp = '유효한 월을 입력해 주세요.';
    else if (new Date(2000 + yy, mm, 1) <= new Date()) errors.exp = '유효기간이 만료되었습니다.';
  }
  if (!/^\d{3,4}$/.test(String(cvc || ''))) errors.cvc = 'CVC 3~4자리를 입력해 주세요.';
  if (!/^\d{2}$/.test(String(password || ''))) errors.password = '비밀번호 앞 2자리를 입력해 주세요.';
  if (!String(ownerName || '').trim()) errors.ownerName = '소유자 이름을 입력해 주세요.';
  return { ok: Object.keys(errors).length === 0, errors, digits, brand: cardBrand(digits) };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeTid() {
  return `TID${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
}

function makeReceiptNo() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `R-${stamp}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

/**
 * 모의 PG 승인. 실제 결제는 절대 발생하지 않습니다.
 * @param {{card: {last4?: string, willFail?: boolean, brand?: string}, amount: number, purpose?: string}} input
 */
export async function mockCharge({ card, amount, purpose = '결제' }) {
  await delay(1100);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, code: 'INVALID_AMOUNT', message: '결제 금액이 올바르지 않습니다.' };
  }
  const last4 = card?.last4 || digitsOnly(card?.number).slice(-4);
  const willFail = card?.willFail || last4 === '0002' || purpose === 'force-fail';
  if (willFail) {
    return {
      ok: false,
      code: 'CARD_DECLINED',
      message: '카드 승인이 거절되었습니다. (테스트 카드 0002)',
      last4,
    };
  }
  return {
    ok: true,
    tid: makeTid(),
    receiptNo: makeReceiptNo(),
    approvedAt: new Date().toISOString(),
    brand: card?.brand || '카드',
    last4: last4 || '4242',
    amount,
  };
}

/** 카드 등록 시 1원 승인 후 즉시 취소하는 모의 검증 */
export async function mockVerifyCard(input) {
  const validation = validateCardInput(input);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  await delay(700);
  return {
    ok: true,
    brand: validation.brand,
    last4: validation.digits.slice(-4),
    willFail: validation.digits.slice(-4) === '0002',
  };
}
