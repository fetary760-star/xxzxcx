'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { Eye, EyeOff, Plane } from 'lucide-react'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loginAccepted, setLoginAccepted] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const { login } = useAuth()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const navTimerRef = useRef<number | null>(null)
  const submittingRef = useRef(false)

  // Ensure timer is cleared on unmount
  useEffect(() => {
    return () => {
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current)
        navTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (loading && buttonRef.current) {
      buttonRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [loading])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Prevent duplicate submits
    if (submittingRef.current) return
    submittingRef.current = true

    // Client-side validation
    if (!username || username.trim() === '') {
      setError('Please enter your username')
      submittingRef.current = false
      return
    }

    if (!password || password.trim() === '') {
      setError('Please enter your password')
      submittingRef.current = false
      return
    }

    setLoading(true)
    setError('')

    try {
      await login(username.trim(), password)

      // Successful login
      setLoginAccepted(true)
      navTimerRef.current = window.setTimeout(() => {
        navTimerRef.current = null
        router.push('/dashboard')
      }, 160)

    } catch (err: any) {
      // Extract user-friendly message from error
      let userMessage = 'Unable to login. Please try again.'

      if (err?.message && typeof err.message === 'string') {
        // Use the message from the error (already user-friendly from API)
        userMessage = err.message
      } else if (err?.status) {
        // Map status codes to messages
        const status = Number(err.status)
        if (status === 401) {
          userMessage = 'Invalid username or password. Please try again.'
        } else if (status === 403) {
          userMessage = 'Access denied. Please contact your administrator.'
        } else if (status >= 500 || status === 503) {
          userMessage = 'Server is temporarily unavailable. Please try again later.'
        } else if (status === 429) {
          userMessage = 'Too many login attempts. Please wait a moment and try again.'
        }
      } else if (err instanceof TypeError || err?.name === 'TypeError') {
        // Network/fetch errors
        userMessage = 'Cannot reach the server. Please check your connection and try again.'
      }

      setError(userMessage)

      // Only log technical details in development (not visible to users)
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.debug('[Login] Error details (dev only):', {
          message: err?.message,
          status: err?.status,
          type: err?.constructor?.name
        })
      }

      // Cancel any pending navigation
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current)
        navTimerRef.current = null
      }

      // Reset UI state
      setLoading(false)
      setLoginAccepted(false)
      submittingRef.current = false
    }
  }

  const dismissError = () => {
    setError('')
  }

  return (
    <div className="min-h-screen w-full bg-[#f5f9ff] flex flex-col items-center justify-center px-4 relative overflow-x-hidden">
      <style>{`
        :root {
          --primary: #5E8F4D;
          --card-radius: 20px;
          --card-padding: 46px 32px 40px 32px;
        }

        .login-card {
          width: 100%;
          max-width: 426px;
          background: #fff;
          border-radius: var(--card-radius);
          box-shadow: 0 8px 32px 0 rgba(82, 100, 112, 0.16);
          padding: var(--card-padding);
          margin-top: 32px;
          margin-bottom: 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          transition: opacity .25s, transform .28s;
        }
        .login-card.hide { opacity: 0; pointer-events: none; transform: scale(.95); }
        .brand-row { display: flex; align-items: center; justify-content: center; gap: 14px; width: 100%; }
        .brand-plane { color: var(--primary); height: 2.5rem; width: 2.5rem; margin-bottom: 2px; flex-shrink: 0; }
        .brand-title { color: var(--primary); font-family: 'Inter', 'Segoe UI', sans-serif; font-weight: 800; font-size: 2rem; margin-bottom: 0; letter-spacing: -0.02em; display: inline-block; line-height: 1; }
        .brand-subtitle { color: #28323a; font-size: 1.04rem; margin: 12px 0 0 0; text-align: center; font-weight: 500; }
        .form-group { margin-top: 36px; width: 100%; display: flex; flex-direction: column; gap: 26px; }
        .input-wrapper { position: relative; width: 100%; }
        .input-label { display: none; }
        .input-field { width: 100%; height: 48px; border-radius: 10px; border: 1.5px solid #e5e7eb; padding: 0 50px 0 17px; font-size: 1.14rem; color: #233652; font-weight: 500; outline: none; background: #fff; transition: border 0.15s; box-sizing: border-box;}
        .input-field:focus { border-color: var(--primary); box-shadow: 0 0 0 4px rgba(94,143,77,0.06); }
        .input-field.error { border-color: #dc2626; }
        .input-field.error:focus { border-color: #dc2626; box-shadow: 0 0 0 4px rgba(220,38,38,0.08); }
        .password-eye-btn { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); background: transparent; border: none; display: flex; align-items: center; cursor: pointer; color: #6b7280; height: 32px; padding: 0; z-index: 4;}
        .login-btn-wrap { width: 100%; margin-top: 14px; height: 56px; display: flex;}
        .login-btn { width: 100%; padding: 15px 0; border-radius: 8px; background: var(--primary); color: #fff; font-weight: 700; font-size: 1.21rem; box-shadow: 0 1.8px 0px 0 rgba(82, 100, 112, 0.07); border: none; letter-spacing: .01em; transition: background .16s, opacity .22s; cursor: pointer;}
        .login-btn:disabled { background: #A4C59A; cursor: not-allowed; opacity: 0.7;}
        .hide-on-loading { transform: translateY(${loading ? '110%' : '0'}); opacity: ${loading ? 0 : 1}; pointer-events: ${loading ? 'none' : 'unset'}; transition: all .35s cubic-bezier(0.52,0.16,0.52,0.84); }
        .waiting-spinner { width: 100%; display: flex; align-items: center; justify-content: center; height: 56px; margin-top: 0; background: transparent; }
        .spinner-absolute-center { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); }
        .alert-box { width: 100%; color: #a71d2a; background: #fff3f5; font-size: 0.98rem; border-radius: 7px; margin-bottom: 7px; padding: 11px 14px; text-align: center; border: 1.5px solid #ffd8de; animation: slideDown 0.3s ease-out; position: relative; }
        .alert-close { position: absolute; right: 8px; top: 6px; background: transparent; border: none; font-size: 18px; line-height: 1; cursor: pointer; color: #6b7280; padding: 4px; }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 520px) {
          .login-card { padding:30px 12px 21px 12px; border-radius:11px }
          .brand-title { font-size:1.30rem }
        }
        @media (max-width: 420px) {
          .login-card { margin-top:12px; margin-bottom:10px }
        }

        .page-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-top: 26px;
          font-size: 1.01rem;
          color: #364452;
          padding: 10px 12px;
          width: 100%;
        }
        .footer-text-wrap { display: inline-flex; align-items: center; gap: 10px; line-height: 1; }
        .footer-img { height: 34px; width: auto; object-fit: contain; border-radius: 6px; margin-left: 6px; vertical-align: middle; transform: translateY(1px); box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
      `}</style>

      <main className={`login-card${loginAccepted ? ' hide' : ''} shadow-md`} role="main" aria-labelledby="login-heading">
        <header style={{ width: '100%' }}>
          <div className="brand-row">
            <Plane className="brand-plane" />
            <span className="brand-title" id="login-heading">Ethiopia Airlines</span>
          </div>
          <div className="brand-subtitle">
            CMT Eng Task Management System
          </div>
        </header>

        <form onSubmit={handleSubmit} style={{ width: '100%', marginTop: 0 }} autoComplete="on" aria-describedby="login-help" role="form" noValidate>
          {error && (
            <div className="alert-box" role="alert" aria-live="polite">
              <button className="alert-close" aria-label="Dismiss error" onClick={dismissError}>×</button>
              {error}
            </div>
          )}
          <div className="form-group">
            <div className="input-wrapper">
              <label htmlFor="username" className="input-label">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                className={`input-field ${error && !username ? 'error' : ''}`}
                autoComplete="username"
                placeholder="Username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                disabled={loading}
                aria-required={true}
                aria-invalid={error && !username ? 'true' : 'false'}
                tabIndex={1}
              />
            </div>
            <div className="input-wrapper">
              <label htmlFor="password" className="input-label">Password</label>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                className={`input-field ${error && !password ? 'error' : ''}`}
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                aria-required={true}
                aria-invalid={error && !password ? 'true' : 'false'}
                tabIndex={2}
                style={{ paddingRight: 43 }}
              />
              <button
                type="button"
                tabIndex={3}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="password-eye-btn"
                onClick={() => setShowPassword(s => !s)}
                disabled={loading}
                style={{ color: showPassword ? 'var(--primary)' : '#6b7280' }}
              >
                {showPassword ? <EyeOff size={23} /> : <Eye size={23} />}
              </button>
            </div>
          </div>
          <div className="login-btn-wrap">
            <button ref={buttonRef} type="submit" className={`login-btn hide-on-loading`} disabled={loading} tabIndex={4}>
              Login
            </button>
            {loading && !loginAccepted && (
              <div className="waiting-spinner" aria-live="polite" aria-busy="true">
                <Loader2 className="h-8 w-8 text-[var(--primary)] animate-spin" />
              </div>
            )}
          </div>
        </form>
      </main>

      {loginAccepted && (
        <div className="spinner-absolute-center" aria-live="polite" aria-busy="true">
          <Loader2 className="h-12 w-12 text-[var(--primary)] animate-spin" />
        </div>
      )}

      <footer className="page-footer" aria-hidden={false}>
        <div className="footer-text-wrap" aria-hidden={false}>
          <span>
            Copyright © {new Date().getFullYear()} CMT Integrated Dashboard. All rights reserved.
          </span>
          <a       >
          <img src="https://portal.ethiopianairlines.com/default/Ops/MRO/Comp_Maint/Com_MaintSup/Production/Shared%20Documents/WEEKLY%20PERFORMANCE%20REPORT/AVIONICS_WEEKLY_PERFORMANCE_REPORT/CMT%20Eng%20Task%20Management/Image%20CMT%20Eng%20Task%20Management/Image.png" alt="CMT Eng @ Santa" className="h-9 w-auto md:h-10" />
          </a>
        </div>
      </footer>
    </div>
  )
}