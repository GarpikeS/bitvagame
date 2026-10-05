export class AuthApiError extends Error {
  constructor(status, payload) {
    super(payload?.message || 'Не удалось выполнить запрос');
    this.name = 'AuthApiError';
    this.status = status;
    this.code = payload?.code || 'AUTH_REQUEST_FAILED';
    this.retryAfter = Number(payload?.retryAfter || 0);
  }
}

async function authRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method || 'GET',
      credentials: 'include',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new AuthApiError(0, { code: 'AUTH_SERVER_UNAVAILABLE', message: 'Сервер авторизации недоступен' });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new AuthApiError(response.status, payload.error);
  return payload;
}

export const authApi = {
  session: () => authRequest('/me'),
  register: (body) => authRequest('/auth/register', { method: 'POST', body }),
  verifyCode: (body) => authRequest('/auth/verify-code', { method: 'POST', body }),
  login: (body) => authRequest('/auth/login', { method: 'POST', body }),
  requestLoginCode: (email) => authRequest('/auth/login-code', { method: 'POST', body: { email } }),
  requestRecoveryCode: (email) => authRequest('/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (password) => authRequest('/auth/reset-password', { method: 'POST', body: { password } }),
  logout: () => authRequest('/auth/logout', { method: 'POST' }),
  updateProfile: (body) => authRequest('/me', { method: 'PATCH', body }),
  activatePromo: (code) => authRequest('/promocodes/activate', { method: 'POST', body: { code } }),
  createTochkaPayment: (amount) => authRequest('/payments/tochka', { method: 'POST', body: { amount } }),
  paymentStatus: (paymentId) => authRequest(`/payments/${encodeURIComponent(paymentId)}`),
  purchaseBlanks: (body) => authRequest('/purchases/blanks', { method: 'POST', body }),
  purchaseCategory: (category) => authRequest('/purchases/categories', { method: 'POST', body: { category } }),
  purchaseGameEntitlement: (entitlementId) => authRequest('/purchases/entitlements', { method: 'POST', body: { entitlementId } }),
};
