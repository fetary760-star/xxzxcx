'use client';

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Bell, User, LogOut, Settings, Mail, MessageSquare, PhoneCall, HelpCircle } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { getProfilePictureUrl, getInitials } from "@/lib/profile-picture-utils"

import NotificationPanel from "@/components/NotificationPanel"
import { useNotifications, useMarkNotificationAsRead, useMarkAllNotificationsAsRead, useUnreadCount } from "@/hooks/useNotifications"

/**
 * AnniversaryFallbackCaption: Displayed when the .gif anniversary video fails to load.
 * Shows a styled "80 Years of Excellence – The New Spirit of Africa" caption.
 */
function AnniversaryFallbackCaption() {
  return (
    <div className="relative z-10 flex items-center justify-center w-full h-full px-3">
      <div className="bg-[#48723C] px-6 py-2 rounded-full shadow-lg border border-white/10 flex items-center gap-3 text-center">
        {/* Decorative line */}
        <div className="hidden md:block w-8 h-px bg-gradient-to-r from-transparent to-white/20" />

        <div className="flex flex-col items-center leading-tight">
          {/* "80 Years of Excellence" in vibrant Gold (Amber) */}
          <span className="text-[10px] sm:text-xs font-bold tracking-[0.25em] uppercase text-amber-400 drop-shadow-sm">
            80 Years of Excellence
          </span>
          <span className="text-[9px] sm:text-[11px] font-semibold tracking-widest text-white mt-0.5 uppercase opacity-90">
            The New Spirit of Africa
          </span>
        </div>

        {/* Decorative line */}
        <div className="hidden md:block w-8 h-px bg-gradient-to-l from-transparent to-white/20" />
      </div>
    </div>
  );
}

/**
 * Header: shows logo, dynamic 80-year anniversary journey video, notifications badge, and user menu.
 * The video journey fills the space from the logo text up to the bell icon.
 * When the .gif is unavailable, a styled anniversary caption fallback is shown instead.
 */
export function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();

  // Original notification hooks
  const { data: notificationsData } = useNotifications();
  const notificationsList = Array.isArray(notificationsData?.notifications) ? notificationsData!.notifications : [];

  const { data: unreadData } = useUnreadCount();
  const unreadCount = unreadData?.unreadCount ?? (Array.isArray(notificationsList)
    ? notificationsList.filter((n: any) => {
        const readFlag = (n?.isRead !== undefined) ? n.isRead : (n?.is_read !== undefined ? n.is_read : false)
        return !readFlag
      }).length
    : 0);

  const [panelOpen, setPanelOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Track whether the anniversary .gif loaded successfully
  const [gifFailed, setGifFailed] = useState(false);

  useEffect(() => {
    function onDocumentClick(e: MouseEvent) {
      if (!containerRef.current) return;
      // Don't close if clicking inside the bell button container
      if (containerRef.current.contains(e.target as Node)) return;
      // Don't close if clicking inside any Radix portal element.
      // The DraggableDialog, DropdownMenu, Select, Tooltip, etc. all render
      // via portals outside this container's DOM tree, so clicks on buttons
      // like "Reconnect", "Fix", filter dropdowns, etc. would otherwise be
      // treated as "outside" clicks and close the panel prematurely.
      const target = e.target as HTMLElement;
      if (target.closest('[role="dialog"]')) return;
      if (target.closest('[data-radix-popper-content-wrapper]')) return;
      if (target.closest('[data-radix-overlay]')) return;
      if (target.closest('[data-radix-portal]')) return;
      if (target.closest('[data-state]')) return;
      // Also ignore clicks on sonner toast notifications
      if (target.closest('[data-sonner-toaster]') || target.closest('[data-sonner-toast]')) return;
      setPanelOpen(false);
    }

    if (panelOpen) {
      document.addEventListener('mousedown', onDocumentClick);
    }
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
    };
  }, [panelOpen]);

  const handleLogout = () => {
    logout();
  };

  const navigateToProfile = () => {
    router.push('/profile');
  };

  const navigateToSettings = () => {
    router.push('/settings');
  };

  const anniversaryVideoUrl = "https://portal.ethiopianairlines.com/default/Ops/MRO/Comp_Maint/Com_MaintSup/Production/Shared%20Documents/WEEKLY%20PERFORMANCE%20REPORT/AVIONICS_WEEKLY_PERFORMANCE_REPORT/CMT%20Eng%20Task%20Management/Image%20CMT%20Eng%20Task%20Management/80%20years%20Header%20Video%20Integration%20for%20Ethiopian%20Airlines.gif";

  return (
     <header className="flex flex-col border-b bg-gradient-to-r from-blue-50 via-white to-blue-50 shadow-md">
      {/* Top row with logo and user controls */}
      <div className="flex h-[5.5rem] items-center justify-between pl-1 pr-6">
        <div className="flex items-center space-x-6">
          {/* Logo and Title – border height slightly adjusted */}
          <div className="flex items-center space-x-4">
            <img
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQXp-ozwM_lGuq9AjEKrqyhUQfs74pxOsclcw&s"
              alt="Ethiopian Airlines"
              className="h-[5.25rem] w-auto object-contain"
            />
            <div>
              <div className="text-lg font-semibold text-gray-800">Ethiopian Airlines</div>
              <div className="text-base font-medium text-gray-700">የኢትዮጵያ</div>
            </div>
          </div>
        </div>

        {/* Center: Anniversary video or fallback caption */}
        <div className="flex-1 flex items-center justify-center h-full px-0 overflow-hidden">
          <div className="w-full h-full flex items-center justify-center">
            {!gifFailed ? (
              <img
                src={anniversaryVideoUrl}
                alt="Ethiopian Airlines Journey"
                className="h-[9.5rem] w-auto max-w-full object-contain pointer-events-none select-none"
                onError={() => setGifFailed(true)}
              />
            ) : (
              <AnniversaryFallbackCaption />
            )}
          </div>
        </div>

        {/* Right: Notifications and User Menu */}
        <div className="flex items-center space-x-4 shrink-0 pl-4">
          <div className="relative" ref={containerRef}>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={() => setPanelOpen(prev => !prev)}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]"
                >
                  {unreadCount}
                </Badge>
              )}
            </Button>

            {panelOpen && (
              <div className="absolute right-0 mt-2 z-50">
                <NotificationPanel
                  open={panelOpen}
                  onClose={() => setPanelOpen(false)}
                />
              </div>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage 
                    src={getProfilePictureUrl(user?.profilePicturePath)} 
                    alt="User" 
                  />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {getInitials(user?.fullName)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {user?.fullName || "User"}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email || "user@example.com"}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    Role: {user?.roleDisplayName || user?.role || "Unknown"}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={navigateToProfile}>
                <User className="mr-2 h-4 w-4" /> <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={navigateToSettings}>
                <Settings className="mr-2 h-4 w-4" /> <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}

export default Header;