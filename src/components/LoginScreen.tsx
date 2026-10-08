import React, { useState } from 'react';
import { signInWithGoogle, signOutUser } from '../services/firebase';
import { Shield, LogIn, AlertCircle, LogOut, Lock, CheckCircle2, RefreshCw } from 'lucide-react';

interface LoginScreenProps {
  authError?: {
    code?: string;
    message?: string;
    email?: string;
  } | null;
  onRefreshAuth?: () => void;
  isLoading?: boolean;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  authError,
  onRefreshAuth,
  isLoading = false
}) => {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setLocalError(null);
    try {
      await signInWithGoogle();
      // Auth state listener in App will handle session resolution
    } catch (err: any) {
      console.error('Google Sign-In failed', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setLocalError('Cửa sổ đăng nhập đã bị đóng trước khi hoàn tất.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        // User triggered another popup, ignore
      } else if (err.code === 'auth/popup-blocked') {
        setLocalError('Trình duyệt đã chặn cửa sổ đăng nhập (Pop-up). Vui lòng cho phép Pop-up để đăng nhập.');
      } else {
        setLocalError(err.message || 'Đăng nhập bằng Google không thành công. Vui lòng thử lại.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (err) {
      console.error('Sign out error', err);
    }
  };

  const isAccountUnauthorized = authError?.code === 'ACCOUNT_NOT_AUTHORIZED';
  const isAccountLocked = authError?.code === 'ACCOUNT_LOCKED';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 selection:bg-indigo-500 selection:text-white">
      {/* Background Subtle Accent Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] opacity-60 pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden">
          {/* Card Header Branding */}
          <div className="bg-gradient-to-br from-indigo-700 via-indigo-600 to-indigo-800 p-8 text-center text-white relative">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 mb-4 shadow-inner">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight mb-1 text-white">
              Hệ thống Quản lý Vận hành ONB
            </h1>
            <p className="text-xs text-indigo-100 font-medium tracking-wide">
              Bộ phận Onboarding &amp; Vận hành Nghiệp vụ
            </p>
          </div>

          {/* Card Body */}
          <div className="p-8 space-y-6">
            {/* Case 1: Account NOT Authorized */}
            {isAccountUnauthorized && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-amber-900">
                      Tài khoản chưa được cấp quyền sử dụng
                    </h3>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      Tài khoản chưa được cấp quyền sử dụng. Vui lòng liên hệ quản trị viên.
                    </p>
                  </div>
                </div>

                {authError?.email && (
                  <div className="text-xs font-mono bg-white/80 px-2.5 py-1.5 rounded-md border border-amber-200/60 text-slate-700 break-all">
                    Email: <strong>{authError.email}</strong>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-amber-200/60">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-900 bg-white hover:bg-amber-100/70 border border-amber-300 rounded-lg transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Đăng xuất / Đổi tài khoản
                  </button>
                  {onRefreshAuth && (
                    <button
                      type="button"
                      onClick={onRefreshAuth}
                      title="Kiểm tra lại quyền"
                      className="inline-flex items-center justify-center p-2 text-amber-900 bg-white hover:bg-amber-100/70 border border-amber-300 rounded-lg transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Case 2: Account LOCKED */}
            {isAccountLocked && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-rose-900">
                      Tài khoản đã bị khóa
                    </h3>
                    <p className="text-xs text-rose-800 leading-relaxed">
                      Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.
                    </p>
                  </div>
                </div>

                {authError?.email && (
                  <div className="text-xs font-mono bg-white/80 px-2.5 py-1.5 rounded-md border border-rose-200/60 text-slate-700 break-all">
                    Email: <strong>{authError.email}</strong>
                  </div>
                )}

                <div className="pt-2 border-t border-rose-200/60">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-900 bg-white hover:bg-rose-100/70 border border-rose-300 rounded-lg transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Đăng xuất
                  </button>
                </div>
              </div>
            )}

            {/* Local Sign-in Error */}
            {localError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{localError}</span>
              </div>
            )}

            {/* Normal Sign-in View (When not in unauthorized/locked state) */}
            {!isAccountUnauthorized && !isAccountLocked && (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <h2 className="text-base font-bold text-slate-900">
                    Đăng nhập tài khoản
                  </h2>
                  <p className="text-xs text-slate-500">
                    Sử dụng tài khoản Google được cấp phép bởi Quản trị viên
                  </p>
                </div>

                {/* Google Sign-in Button */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isSigningIn || isLoading}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-xl border border-slate-300 shadow-xs hover:shadow-md transition-all duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSigningIn || isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      <span>Đang kết nối Google...</span>
                    </>
                  ) : (
                    <>
                      {/* Official Google SVG Icon */}
                      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <span>Đăng nhập bằng Google</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Security Notice */}
            <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-500 text-center leading-relaxed space-y-1">
              <p className="flex items-center justify-center gap-1.5 font-medium text-slate-600">
                <Shield className="w-3.5 h-3.5 text-indigo-600" />
                Bảo mật xác thực Firebase &amp; Token Server-side
              </p>
              <p>
                Dữ liệu chỉ được cấp phép truy cập cho tài khoản Google đã được Quản trị viên kích hoạt trong Thiết lập hệ thống.
              </p>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-4 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} ONB Operations Management System
        </div>
      </div>
    </div>
  );
};
