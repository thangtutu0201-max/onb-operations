import * as jose from 'jose';
import fs from 'fs';
import path from 'path';
import { DatabaseSchema, FIRST_ADMIN_EMAIL, writeDatabaseSync } from './db';
import { CurrentUserSession, AuthorizedAccount } from '../src/types';

// Load Firebase Project ID
let projectId = 'pacific-starlight-jmn89';
try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.projectId) {
      projectId = parsed.projectId;
    }
  }
} catch (e) {
  console.warn('Could not read firebase-applet-config.json, using fallback projectId', e);
}

const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const JWKS = jose.createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));

export interface TokenVerificationResult {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  [key: string]: any;
}

export async function verifyFirebaseIdToken(token: string): Promise<TokenVerificationResult> {
  const { payload } = await jose.jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId
  });

  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('ID Token thiếu trường sub (Firebase UID).');
  }

  return payload as TokenVerificationResult;
}

export interface AuthSuccess {
  success: true;
  session: CurrentUserSession;
  account: AuthorizedAccount;
  payload: TokenVerificationResult;
}

export interface AuthFailure {
  success: false;
  status: number;
  error: string;
  code: 'UNAUTHORIZED' | 'INVALID_TOKEN' | 'NO_EMAIL' | 'ACCOUNT_NOT_AUTHORIZED' | 'ACCOUNT_LOCKED';
  email?: string;
}

export type AuthenticateResult = AuthSuccess | AuthFailure;

export async function authenticateToken(
  authHeader: string | undefined,
  db: DatabaseSchema
): Promise<AuthenticateResult> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      success: false,
      status: 401,
      error: 'Chưa đăng nhập. Vui lòng đăng nhập bằng Google.',
      code: 'UNAUTHORIZED'
    };
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return {
      success: false,
      status: 401,
      error: 'Token xác thực rỗng.',
      code: 'UNAUTHORIZED'
    };
  }

  let payload: TokenVerificationResult;
  try {
    payload = await verifyFirebaseIdToken(token);
  } catch (err: any) {
    console.warn('Firebase token verification failed:', err.message);
    return {
      success: false,
      status: 401,
      error: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.',
      code: 'INVALID_TOKEN'
    };
  }

  const email = (payload.email || '').toLowerCase().trim();
  if (!email) {
    return {
      success: false,
      status: 403,
      error: 'Tài khoản Google không có thông tin email hợp lệ.',
      code: 'NO_EMAIL'
    };
  }

  // Ensure authorizedAccounts array exists
  if (!Array.isArray(db.authorizedAccounts)) {
    db.authorizedAccounts = [];
  }

  // Lookup account
  let account = db.authorizedAccounts.find(a => a.email.toLowerCase() === email);

  // If this is the designated First Admin and somehow not yet present, auto-create
  if (!account && email === FIRST_ADMIN_EMAIL.toLowerCase()) {
    account = {
      id: 'acc_first_admin',
      email: FIRST_ADMIN_EMAIL.toLowerCase(),
      onbCode: 'DTHANG',
      role: 'admin',
      status: 'ACTIVE',
      canEditBonus: true,
      canManageAllocation: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.authorizedAccounts.unshift(account);
    writeDatabaseSync(db);
  }

  // If still not found in authorized list
  if (!account) {
    return {
      success: false,
      status: 403,
      error: 'Tài khoản chưa được cấp quyền sử dụng. Vui lòng liên hệ quản trị viên.',
      code: 'ACCOUNT_NOT_AUTHORIZED',
      email
    };
  }

  // If account is LOCKED
  if (account.status !== 'ACTIVE') {
    return {
      success: false,
      status: 403,
      error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.',
      code: 'ACCOUNT_LOCKED',
      email
    };
  }

  // Update UID linkage and last login if changed
  let needsDbSave = false;
  const uid = payload.sub;
  if (!account.firebaseUid || account.firebaseUid !== uid) {
    account.firebaseUid = uid;
    needsDbSave = true;
  }
  if (payload.name && !account.displayName) {
    account.displayName = payload.name;
    needsDbSave = true;
  }
  if (payload.picture && !account.photoURL) {
    account.photoURL = payload.picture;
    needsDbSave = true;
  }
  account.lastLoginAt = new Date().toISOString();
  needsDbSave = true;

  if (needsDbSave) {
    writeDatabaseSync(db);
  }

  // Resolve member profile
  const member = db.members.find(m => m.code === account!.onbCode) ||
    db.members.find(m => m.email.toLowerCase() === email);

  const isMasterAdmin = account.role === 'admin' || email === FIRST_ADMIN_EMAIL.toLowerCase();

  const session: CurrentUserSession = {
    email: account.email,
    onbCode: account.onbCode || member?.code || 'USER',
    fullName: member?.fullName || account.displayName || account.email,
    role: isMasterAdmin ? 'admin' : 'user',
    isMasterAdmin,
    canEditBonus: isMasterAdmin || Boolean(account.canEditBonus),
    canManageAllocation: isMasterAdmin || Boolean(account.canManageAllocation),
    firebaseUid: uid,
    photoURL: (payload.picture as string) || undefined
  };

  return {
    success: true,
    session,
    account,
    payload
  };
}
