import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wifi, WifiOff, RotateCcw, BellOff, BellRing, Bell, ShieldAlert, Info, TestTube, Wrench, Copy, CheckCheck, Volume2 } from 'lucide-react';
import { useSignalRNotifications } from '@/hooks/useSignalRNotifications';
import {
  requestNotificationPermission,
  getNotificationPermissionStatus,
  getEnhancedPermissionStatus,
  isSecureContext,
  isNotificationBlockedByInsecureOrigin,
  testDesktopNotification,
  NotificationTestResult,
  playNotificationSound,
  getAppOrigins,
  getChromeFlagsUrl,
} from '@/lib/notification-permission';

export const NotificationConnectionStatus = () => {
  const { 
    connectionStatus, 
    isConnecting, 
    isConnected, 
    connectToHub, 
    disconnectFromHub,
    connectionError,
    enhancedPermission,
    requestPermission,
  } = useSignalRNotifications();

  // Track permission status with local state
  const [permissionStatus, setPermissionStatus] = useState<string>(() =>
    getNotificationPermissionStatus()
  );
  const [localEnhancedStatus, setLocalEnhancedStatus] = useState<string>(() =>
    getEnhancedPermissionStatus()
  );
  const [showPermissionInfo, setShowPermissionInfo] = useState(false);
  const [showTroubleshooter, setShowTroubleshooter] = useState(false);
  const [testResult, setTestResult] = useState<NotificationTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Poll permission status to keep it in sync
  useEffect(() => {
    setPermissionStatus(getNotificationPermissionStatus());
    setLocalEnhancedStatus(getEnhancedPermissionStatus());

    const interval = setInterval(() => {
      const current = getNotificationPermissionStatus();
      setPermissionStatus(current);
      setLocalEnhancedStatus(getEnhancedPermissionStatus());
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const handleEnableNotifications = useCallback(async () => {
    // On insecure origins, we can't request OS-level permission.
    // Show an info message instead.
    if (!isSecureContext()) {
      setShowPermissionInfo(true);
      return;
    }

    const granted = await requestPermission();
    setPermissionStatus(granted ? 'granted' : getNotificationPermissionStatus());
    setLocalEnhancedStatus(getEnhancedPermissionStatus());
  }, [requestPermission]);

  const handleTestNotification = useCallback(async () => {
    setIsTesting(true);
    try {
      const result = await testDesktopNotification();
      setTestResult(result);
    } catch {
      setTestResult({
        success: false,
        method: 'none',
        message: 'Test failed unexpectedly.',
        permissionStatus: getNotificationPermissionStatus(),
        isSecureContext: isSecureContext(),
        swRegistered: false,
        swActive: false,
      });
    } finally {
      setIsTesting(false);
    }
  }, []);

  const copyToClipboard = useCallback(async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback for HTTP where clipboard API may not work
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    }
  }, []);

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'Connected':
        return 'bg-green-500';
      case 'Connecting':
      case 'Reconnecting':
        return 'bg-yellow-500';
      case 'Disconnected':
      case 'Disconnecting':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = () => {
    if (isConnecting) {
      return <RotateCcw className="h-3 w-3 animate-spin" />;
    }
    return isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />;
  };

  // Use the enhanced permission from the hook (more up-to-date)
  const effectiveEnhancedStatus = enhancedPermission || localEnhancedStatus;

  return (
    <div className="flex flex-col space-y-1">
      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
        {/* SignalR Connection Status */}
        <Badge 
          variant="outline" 
          className={`${getStatusColor()} text-white border-0 flex items-center space-x-1`}
        >
          {getStatusIcon()}
          <span className="text-xs">{connectionStatus}</span>
        </Badge>
        
        {!isConnected && !isConnecting && (
          <Button
            variant="ghost"
            size="sm"
            onClick={connectToHub}
            className="h-6 px-2 text-xs"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reconnect
          </Button>
        )}
        
        {isConnected && (
          <Button
            variant="ghost"
            size="sm"
            onClick={disconnectFromHub}
            className="h-6 px-2 text-xs"
          >
            Disconnect
          </Button>
        )}

        {/* Notification Permission Status — blocked by insecure origin (HTTP) */}
        {effectiveEnhancedStatus === 'insecure_blocked' && (
          <Badge
            variant="outline"
            className="bg-blue-500 text-white border-0 flex items-center space-x-1 cursor-pointer"
            onClick={() => setShowPermissionInfo(prev => !prev)}
          >
            <BellRing className="h-3 w-3" />
            <span className="text-xs">In-app notifications active</span>
            <Info className="h-3 w-3 ml-1 opacity-70" />
          </Badge>
        )}

        {/* Notification Permission Status — explicitly denied by user */}
        {effectiveEnhancedStatus === 'denied' && (
          <Badge
            variant="outline"
            className="bg-orange-500 text-white border-0 flex items-center space-x-1"
          >
            <BellOff className="h-3 w-3" />
            <span className="text-xs">Desktop blocked</span>
          </Badge>
        )}

        {/* Notification Permission — prompt to enable when not yet decided (secure origins only) */}
        {effectiveEnhancedStatus === 'default' && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnableNotifications}
            className="h-6 px-2 text-xs border-blue-300 text-blue-600 hover:bg-blue-50"
          >
            <BellRing className="h-3 w-3 mr-1" />
            Enable Notifications
          </Button>
        )}

        {/* Notification Permission — granted indicator */}
        {effectiveEnhancedStatus === 'granted' && (
          <Badge
            variant="outline"
            className="bg-emerald-500 text-white border-0 flex items-center space-x-1"
          >
            <Bell className="h-3 w-3" />
            <span className="text-xs">Notifications enabled</span>
          </Badge>
        )}

        {/* Test Notification Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleTestNotification}
          disabled={isTesting}
          className="h-6 px-2 text-xs"
          title="Send a test desktop notification"
        >
          {isTesting ? (
            <RotateCcw className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <TestTube className="h-3 w-3 mr-1" />
          )}
          Test
        </Button>

        {/* Troubleshooter Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowTroubleshooter(prev => !prev)}
          className="h-6 px-2 text-xs"
          title="Open notification troubleshooter"
        >
          <Wrench className="h-3 w-3 mr-1" />
          {showTroubleshooter ? 'Hide' : 'Fix'}
        </Button>
      </div>

      {/* Test notification result */}
      {testResult && (
        <div className={`text-xs p-2 rounded-md max-w-md ${
          testResult.success
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          <span className="font-semibold">{testResult.success ? '✅' : '❌'} </span>
          {testResult.message}
          <span className="ml-1 opacity-70">({testResult.method})</span>
        </div>
      )}

      {/* Connection error message */}
      {connectionError && !isConnected && (
        <div className="text-xs text-red-500 flex items-center space-x-1">
          <ShieldAlert className="h-3 w-3" />
          <span>{connectionError}</span>
        </div>
      )}

      {/* Info panel for HTTP notification limitations */}
      {showPermissionInfo && effectiveEnhancedStatus === 'insecure_blocked' && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-800 max-w-md">
          <div className="flex items-start space-x-2">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">Desktop notifications are not available because this site is served over HTTP.</p>
              <p>You will still receive all notifications as <strong>in-app alerts</strong> with <strong>sound chimes</strong> within this page.</p>
              <p>To enable desktop notifications, the site must be served over <strong>HTTPS</strong> or you can add this origin as a trusted secure origin in Chrome flags.</p>
              <p className="text-blue-600 mt-1">
                ✅ In-app notifications + sound alerts are working — you will see toast alerts and hear chimes for all events.
              </p>
              <div className="flex gap-2 mt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowPermissionInfo(false); setShowTroubleshooter(true); }}
                  className="h-5 px-2 text-xs text-blue-600 hover:bg-blue-100"
                >
                  Open Troubleshooter
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPermissionInfo(false)}
                  className="h-5 px-2 text-xs text-blue-600 hover:bg-blue-100"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inline Troubleshooter Panel */}
      {showTroubleshooter && (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs max-w-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-700 flex items-center gap-1">
              <Wrench className="h-3 w-3" /> Notification Troubleshooter
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTroubleshooter(false)}
              className="h-5 px-2 text-xs"
            >
              Close
            </Button>
          </div>

          {/* Diagnostic checklist */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              {typeof window !== 'undefined' && 'Notification' in window ? (
                <span className="text-green-600">✅</span>
              ) : (
                <span className="text-red-600">❌</span>
              )}
              <span>Browser Notification API: {typeof window !== 'undefined' && 'Notification' in window ? 'Supported' : 'Not supported'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {isSecureContext() ? (
                <span className="text-green-600">✅</span>
              ) : (
                <span className="text-red-600">❌</span>
              )}
              <span>Secure Context (HTTPS): {isSecureContext() ? 'Yes' : 'No — this is the main issue'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {permissionStatus === 'granted' ? (
                <span className="text-green-600">✅</span>
              ) : permissionStatus === 'denied' ? (
                <span className="text-red-600">❌</span>
              ) : (
                <span className="text-yellow-600">⚠️</span>
              )}
              <span>Permission: {permissionStatus}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-green-600">✅</span>
              <span>Notification Sound (Web Audio): Available — works on HTTP</span>
            </div>
          </div>

          {/* Sound Test Button */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => playNotificationSound('medium')}
              className="h-6 px-2 text-xs"
            >
              <Volume2 className="h-3 w-3 mr-1" />
              Test Sound
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => playNotificationSound('urgent')}
              className="h-6 px-2 text-xs border-red-300 text-red-600 hover:bg-red-50"
            >
              <Volume2 className="h-3 w-3 mr-1" />
              Test Urgent Sound
            </Button>
            <span className="text-gray-500">Sounds work on HTTP ✅</span>
          </div>

          {/* Fix instructions based on status */}
          {!isSecureContext() && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2 text-amber-900">
              <p className="font-semibold mb-1">🔧 Fix: Enable Desktop Notifications on HTTP</p>
              <p className="mb-1">Your site is on HTTP. Browsers block OS-level notifications on non-HTTPS origins. For internal networks, use Chrome flags:</p>
              <ol className="list-decimal list-inside space-y-0.5 ml-1">
                <li>
                  Go to{' '}
                  <code
                    className="bg-amber-100 px-1 rounded cursor-pointer hover:bg-amber-200"
                    onClick={() => copyToClipboard(getChromeFlagsUrl(), 'flags-url')}
                    title="Click to copy"
                  >
                    chrome://flags/#unsafely-treat-insecure-origin-as-secure
                  </code>
                  {copiedField === 'flags-url' ? (
                    <CheckCheck className="h-3 w-3 inline ml-1 text-green-600" />
                  ) : (
                    <Copy className="h-3 w-3 inline ml-1 opacity-50" />
                  )}
                </li>
                <li>
                  Enter <strong>both</strong> origins (comma-separated):
                  <div className="mt-1 space-y-1">
                    {getAppOrigins().map((origin, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <code
                          className="bg-amber-100 px-1.5 py-0.5 rounded cursor-pointer hover:bg-amber-200"
                          onClick={() => copyToClipboard(origin, `origin-${idx}`)}
                          title="Click to copy"
                        >
                          {origin}
                        </code>
                        {copiedField === `origin-${idx}` ? (
                          <CheckCheck className="h-3 w-3 text-green-600" />
                        ) : (
                          <Copy className="h-3 w-3 opacity-50 cursor-pointer" onClick={() => copyToClipboard(origin, `origin-${idx}`)} />
                        )}
                      </div>
                    ))}
                  </div>
                </li>
                <li>Set to <strong>Enabled</strong> → Click <strong>Relaunch</strong></li>
                <li>After restart, click the bell icon to grant permission</li>
              </ol>
              <p className="mt-1 text-amber-700">
                💡 <strong>Meanwhile:</strong> In-app notifications and sound alerts are fully working — you won&apos;t miss anything!
              </p>
            </div>
          )}

          {permissionStatus === 'denied' && (
            <div className="bg-orange-50 border border-orange-200 rounded p-2 text-orange-900">
              <p className="font-semibold mb-1">🔧 Fix: Re-enable Blocked Notifications</p>
              <ol className="list-decimal list-inside space-y-0.5 ml-1">
                <li>Click the <strong>lock/info icon</strong> in the address bar</li>
                <li>Find <strong>Notifications</strong> → Change to <strong>Allow</strong></li>
                <li>Reload the page</li>
              </ol>
            </div>
          )}

          {permissionStatus === 'default' && isSecureContext() && (
            <div className="bg-blue-50 border border-blue-200 rounded p-2 text-blue-900">
              <p className="font-semibold mb-1">🔧 Fix: Grant Notification Permission</p>
              <p>Click the <strong>bell icon</strong> or the <strong>&quot;Enable Notifications&quot;</strong> button above to trigger the permission prompt.</p>
            </div>
          )}

          {effectiveEnhancedStatus === 'granted' && (
            <div className="bg-green-50 border border-green-200 rounded p-2 text-green-900">
              <p className="font-semibold">✅ Desktop notifications are properly configured.</p>
              <p>If you&apos;re still not seeing notifications, click the <strong>Test</strong> button above to verify delivery.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationConnectionStatus;