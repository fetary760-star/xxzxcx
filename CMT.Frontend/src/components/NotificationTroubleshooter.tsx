import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  RefreshCw,
  Monitor,
  Shield,
  Globe,
  Wrench,
  ChevronDown,
  ChevronUp,
  TestTube,
} from 'lucide-react';
import {
  requestNotificationPermission,
  getNotificationPermissionStatus,
  getEnhancedPermissionStatus,
  isSecureContext,
  isNotificationBlockedByInsecureOrigin,
  registerNotificationServiceWorker,
  testDesktopNotification,
  NotificationTestResult,
} from '@/lib/notification-permission';

interface DiagnosticStep {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warn' | 'pending';
  detail: string;
}

export const NotificationTroubleshooter = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [testResult, setTestResult] = useState<NotificationTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const permissionStatus = getNotificationPermissionStatus();
  const enhancedStatus = getEnhancedPermissionStatus();
  const secureContext = isSecureContext();
  const blockedByInsecure = isNotificationBlockedByInsecureOrigin();

  const getDiagnostics = (): DiagnosticStep[] => {
    const steps: DiagnosticStep[] = [];

    // Step 1: Browser support
    const hasNotificationAPI = typeof window !== 'undefined' && 'Notification' in window;
    steps.push({
      id: 'browser-support',
      label: 'Browser Notification API',
      status: hasNotificationAPI ? 'pass' : 'fail',
      detail: hasNotificationAPI
        ? 'Your browser supports the Notification API.'
        : 'Your browser does not support desktop notifications. Try Chrome, Edge, or Firefox.',
    });

    // Step 2: Secure context
    steps.push({
      id: 'secure-context',
      label: 'Secure Context (HTTPS or localhost)',
      status: secureContext ? 'pass' : 'fail',
      detail: secureContext
        ? 'The page is served over a secure origin. Notification permissions can be requested.'
        : `The page is served over HTTP (${window.location.host}). Browsers block notification permissions on non-HTTPS origins. This is the most likely reason desktop notifications are not working.`,
    });

    // Step 3: Permission status
    steps.push({
      id: 'permission',
      label: 'Notification Permission',
      status: permissionStatus === 'granted' ? 'pass' : permissionStatus === 'denied' ? 'fail' : 'warn',
      detail:
        permissionStatus === 'granted'
          ? 'Notification permission has been granted.'
          : permissionStatus === 'denied'
            ? 'Notification permission was denied. You must re-enable it in your browser settings (click the lock/icon in the address bar → Site settings → Notifications → Allow).'
            : 'Notification permission has not been requested yet. Click the bell icon or the "Enable Notifications" button to trigger the permission prompt.',
    });

    // Step 4: Service Worker
    const hasSW = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
    steps.push({
      id: 'service-worker',
      label: 'Service Worker Support',
      status: hasSW ? (secureContext ? 'pass' : 'warn') : 'fail',
      detail: hasSW
        ? secureContext
          ? 'Service Workers are supported and can be registered on this secure origin.'
          : 'Service Workers are supported but cannot be registered on this HTTP origin. Service Workers require HTTPS.'
        : 'Service Workers are not supported in this browser.',
    });

    return steps;
  };

  const handleTestNotification = useCallback(async () => {
    setIsTesting(true);
    try {
      const result = await testDesktopNotification();
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        method: 'none',
        message: `Test failed with error: ${err instanceof Error ? err.message : String(err)}`,
        permissionStatus,
        isSecureContext: secureContext,
        swRegistered: false,
        swActive: false,
      });
    } finally {
      setIsTesting(false);
    }
  }, [permissionStatus, secureContext]);

  const handleRequestPermission = useCallback(async () => {
    setIsRequestingPermission(true);
    try {
      const granted = await requestNotificationPermission();
      if (granted) {
        await registerNotificationServiceWorker();
      }
      // Re-run test after permission change
      const result = await testDesktopNotification();
      setTestResult(result);
    } catch (err) {
      // ignore
    } finally {
      setIsRequestingPermission(false);
    }
  }, []);

  const diagnostics = getDiagnostics();

  const getStatusIcon = (status: DiagnosticStep['status']) => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'fail':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warn':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'pending':
        return <RefreshCw className="h-4 w-4 text-gray-400 animate-spin" />;
    }
  };

  const getTestResultIcon = () => {
    if (!testResult) return null;
    return testResult.success ? (
      <CheckCircle2 className="h-5 w-5 text-green-500" />
    ) : (
      <XCircle className="h-5 w-5 text-red-500" />
    );
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader
        className="pb-2 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Notification Troubleshooter
          </CardTitle>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          )}
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className="space-y-4 pt-2">
          {/* Quick Status Summary */}
          <div className="flex items-center gap-2 flex-wrap">
            {enhancedStatus === 'granted' && (
              <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                <Bell className="h-3 w-3" /> Desktop Notifications Active
              </span>
            )}
            {enhancedStatus === 'insecure_blocked' && (
              <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                <BellRing className="h-3 w-3" /> In-App Only (HTTP)
              </span>
            )}
            {enhancedStatus === 'denied' && (
              <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                <BellOff className="h-3 w-3" /> Blocked by User
              </span>
            )}
            {enhancedStatus === 'default' && (
              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full">
                <Bell className="h-3 w-3" /> Not Yet Configured
              </span>
            )}
          </div>

          {/* Diagnostic Steps */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Diagnostics
            </h4>
            {diagnostics.map((step) => (
              <div
                key={step.id}
                className="flex items-start gap-2 p-2 bg-gray-50 rounded-md"
              >
                {getStatusIcon(step.status)}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">{step.label}</div>
                  <div className="text-xs text-gray-600 mt-0.5">{step.detail}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Test Notification */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Test Desktop Notification
            </h4>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestNotification}
                disabled={isTesting}
                className="text-xs"
              >
                {isTesting ? (
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <TestTube className="h-3 w-3 mr-1" />
                )}
                Send Test Notification
              </Button>
              {permissionStatus === 'default' && secureContext && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRequestPermission}
                  disabled={isRequestingPermission}
                  className="text-xs border-blue-300 text-blue-600 hover:bg-blue-50"
                >
                  {isRequestingPermission ? (
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <BellRing className="h-3 w-3 mr-1" />
                  )}
                  Grant Permission
                </Button>
              )}
            </div>
            {testResult && (
              <div
                className={`p-3 rounded-md text-xs ${
                  testResult.success
                    ? 'bg-green-50 border border-green-200 text-green-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {getTestResultIcon()}
                  <span className="font-semibold">
                    {testResult.success ? 'Notification Delivered' : 'Notification Failed'}
                  </span>
                </div>
                <p>{testResult.message}</p>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs opacity-80">
                  <span>Method: {testResult.method}</span>
                  <span>Permission: {testResult.permissionStatus}</span>
                  <span>Secure: {testResult.isSecureContext ? 'Yes' : 'No'}</span>
                  <span>SW Active: {testResult.swActive ? 'Yes' : 'No'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Fix Guide for HTTP Origins */}
          {blockedByInsecure && (
            <div className="space-y-2">
              <button
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                onClick={() =>
                  setExpandedSection(
                    expandedSection === 'http-fix' ? null : 'http-fix'
                  )
                }
              >
                {expandedSection === 'http-fix' ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                How to Enable Desktop Notifications on HTTP
              </button>

              {expandedSection === 'http-fix' && (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900 space-y-3">
                  <div className="flex items-start gap-2">
                    <Shield className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold">Why are desktop notifications blocked?</p>
                      <p className="mt-1">
                        Modern browsers (Chrome 62+, Firefox, Edge) block the Notification API on
                        non-HTTPS origins for security. Your site is served from{' '}
                        <code className="bg-amber-100 px-1 rounded">
                          {typeof window !== 'undefined' ? window.location.origin : 'http://...'}
                        </code>
                        , which is an HTTP origin.
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-amber-200 pt-3">
                    <p className="font-semibold flex items-center gap-1">
                      <Monitor className="h-4 w-4" /> Option 1: Chrome Flag (Internal Network)
                    </p>
                    <p className="mt-1 text-amber-800">
                      If this is an internal/trusted network, you can mark the origin as secure in Chrome:
                    </p>
                    <ol className="list-decimal list-inside mt-2 space-y-1 ml-2">
                      <li>
                        Open Chrome and go to{' '}
                        <code className="bg-amber-100 px-1 rounded">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>
                      </li>
                      <li>
                        In the input field, enter:{' '}
                        <code className="bg-amber-100 px-1 rounded">
                          {typeof window !== 'undefined' ? window.location.origin : 'http://svhqiis03:8757'}
                        </code>
                      </li>
                      <li>Set the dropdown to <strong>Enabled</strong></li>
                      <li>Click <strong>Relaunch</strong> to restart Chrome</li>
                      <li>After restart, click the bell icon and grant notification permission</li>
                    </ol>
                  </div>

                  <div className="border-t border-amber-200 pt-3">
                    <p className="font-semibold flex items-center gap-1">
                      <Globe className="h-4 w-4" /> Option 2: Edge Flag
                    </p>
                    <ol className="list-decimal list-inside mt-2 space-y-1 ml-2">
                      <li>
                        Open Edge and go to{' '}
                        <code className="bg-amber-100 px-1 rounded">edge://flags/#unsafely-treat-insecure-origin-as-secure</code>
                      </li>
                      <li>
                        Enter:{' '}
                        <code className="bg-amber-100 px-1 rounded">
                          {typeof window !== 'undefined' ? window.location.origin : 'http://svhqiis03:8757'}
                        </code>
                      </li>
                      <li>Set to <strong>Enabled</strong> → <strong>Restart</strong></li>
                    </ol>
                  </div>

                  <div className="border-t border-amber-200 pt-3">
                    <p className="font-semibold flex items-center gap-1">
                      <Shield className="h-4 w-4" /> Option 3: HTTPS (Recommended)
                    </p>
                    <p className="mt-1">
                      Configure the web server with an SSL/TLS certificate. Even a self-signed
                      certificate added to the trusted root store will work. This is the proper
                      long-term solution.
                    </p>
                  </div>

                  <div className="border-t border-amber-200 pt-3">
                    <p className="font-semibold flex items-center gap-1">
                      <Info className="h-4 w-4" /> Current Fallback
                    </p>
                    <p className="mt-1 text-green-700">
                      ✅ In-app toast notifications are working — you will see alerts within the
                      application for all task events. Desktop (OS-level) notifications require one
                      of the above fixes.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fix Guide for Denied Permission */}
          {permissionStatus === 'denied' && (
            <div className="space-y-2">
              <button
                className="flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-800"
                onClick={() =>
                  setExpandedSection(
                    expandedSection === 'denied-fix' ? null : 'denied-fix'
                  )
                }
              >
                {expandedSection === 'denied-fix' ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                How to Re-enable Blocked Notifications
              </button>

              {expandedSection === 'denied-fix' && (
                <div className="bg-orange-50 border border-orange-200 rounded-md p-3 text-xs text-orange-900 space-y-2">
                  <p>
                    You previously denied notification permission. To re-enable:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Click the <strong>lock icon</strong> (or info icon) in the browser address bar</li>
                    <li>Find <strong>Notifications</strong> in the permissions list</li>
                    <li>Change from &quot;Block&quot; to <strong>&quot;Allow&quot;</strong></li>
                    <li>Reload the page</li>
                    <li>Click the bell icon to confirm notifications are working</li>
                  </ol>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default NotificationTroubleshooter;