import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  X,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const DraggableDialog = DialogPrimitive.Root;
const DraggableDialogTrigger = DialogPrimitive.Trigger;
const DraggableDialogPortal = DialogPrimitive.Portal;
const DraggableDialogClose = DialogPrimitive.Close;

const DraggableDialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // Much lighter overlay with minimal blur to keep background fully visible and usable
      'fixed inset-0 z-50 bg-black/10 backdrop-blur-[1px]',
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DraggableDialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DraggableDialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  showDragHandle?: boolean;
  initialPosition?: { x: number; y: number };
  showMaximize?: boolean;
  open?: boolean;
}

const DraggableDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DraggableDialogContentProps
>(({ className, children, showDragHandle = true, initialPosition, showMaximize = false, open, ...props }, ref) => {
  const [position, setPosition] = React.useState(initialPosition || { x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });
  const [dragButton, setDragButton] = React.useState<number | null>(null); // 0 = left, 2 = right
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Expand / maximize state
  const [widthPx, setWidthPx] = React.useState<number | null>(null);
  const [isMaximized, setIsMaximized] = React.useState(false);

  // Prevent context menu while right-button dragging
  const preventContextMenu = React.useCallback((e: Event) => e.preventDefault(), []);

  // Start drag only when mousedown originates from header (data-drag-handle)
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isDragHandle = Boolean(target.closest('[data-drag-handle]'));
    if (!isDragHandle) return;

    // Accept left (0) or right (2)
    if (e.button !== 0 && e.button !== 2) return;

    e.preventDefault();
    setIsDragging(true);
    setDragButton(e.button);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleMouseMove = React.useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;

      // constrain in viewport with padding
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const dialogWidth = contentRef.current?.offsetWidth || 0;
      const dialogHeight = contentRef.current?.offsetHeight || 0;

      const minX = -(dialogWidth - 50);
      const maxX = viewportWidth - 50;
      const minY = -50;
      const maxY = viewportHeight - 50;

      const constrainedX = Math.max(minX, Math.min(maxX, newX));
      const constrainedY = Math.max(minY, Math.min(maxY, newY));

      setPosition({ x: constrainedX, y: constrainedY });
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = React.useCallback(() => {
    setIsDragging(false);
    setDragButton(null);
  }, []);

  // hook up global listeners while dragging
  React.useEffect(() => {
    if (!isDragging) return;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    if (dragButton === 2) {
      // suppress context menu while right-dragging
      document.addEventListener('contextmenu', preventContextMenu);
    }
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (dragButton === 2) document.removeEventListener('contextmenu', preventContextMenu);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp, dragButton, preventContextMenu]);

  // Reset on close
  React.useEffect(() => {
    if (!open) {
      setPosition(initialPosition || { x: 0, y: 0 });
      setWidthPx(null);
      setIsMaximized(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPosition]);

  // Expansion helpers (used by header controls)
  const EXPAND_STEP = 120;
  const expandLeft = () => {
    setWidthPx((w) => (w ? w + EXPAND_STEP : (contentRef.current?.offsetWidth || 640) + EXPAND_STEP));
    setPosition((p) => ({ x: p.x - EXPAND_STEP / 2, y: p.y }));
    setIsMaximized(false);
  };
  const expandRight = () => {
    setWidthPx((w) => (w ? w + EXPAND_STEP : (contentRef.current?.offsetWidth || 640) + EXPAND_STEP));
    setPosition((p) => ({ x: p.x + EXPAND_STEP / 2, y: p.y }));
    setIsMaximized(false);
  };
  const shrink = () => {
    setWidthPx((w) => {
      if (!w) return null;
      const nw = Math.max(360, w - EXPAND_STEP);
      if (nw === 360) return null;
      return nw;
    });
    setIsMaximized(false);
  };
  const toggleMaximize = () => {
    if (!isMaximized) {
      setIsMaximized(true);
      setPosition({ x: 0, y: 0 });
      setWidthPx(null);
    } else {
      setIsMaximized(false);
      setWidthPx(null);
      setPosition(initialPosition || { x: 0, y: 0 });
    }
  };

  // Keyboard nudge support when header is focused
  React.useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const handle = content.querySelector<HTMLElement>('[data-drag-handle]');
    if (!handle) return;

    // make sure handle is focusable and has accessible description
    handle.setAttribute('tabindex', '0');
    handle.setAttribute('role', 'button');
    handle.setAttribute('aria-label', 'Dialog title — drag to move. Press arrow keys to nudge. Press M to maximize/restore.');
    handle.title = 'Drag to move • Arrow keys to nudge • M to maximize';

    let onKeyDown = (e: KeyboardEvent) => {
      // Only act when handle has focus
      if (document.activeElement !== handle) return;
      const step = e.shiftKey ? 50 : 10;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setPosition((p) => ({ x: p.x - step, y: p.y }));
        setIsMaximized(false);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setPosition((p) => ({ x: p.x + step, y: p.y }));
        setIsMaximized(false);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPosition((p) => ({ x: p.x, y: p.y - step }));
        setIsMaximized(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPosition((p) => ({ x: p.x, y: p.y + step }));
        setIsMaximized(false);
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleMaximize();
      }
    };

    handle.addEventListener('keydown', onKeyDown as any);

    return () => {
      handle.removeEventListener('keydown', onKeyDown as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentRef.current, isMaximized, initialPosition]);

  // computed inline styles
  const computedStyle: React.CSSProperties = {};
  if (isMaximized) {
    computedStyle.width = 'calc(100% - 40px)';
    computedStyle.height = 'calc(100% - 80px)';
  } else if (widthPx) {
    computedStyle.width = `${widthPx}px`;
    computedStyle.maxWidth = 'none';
  }

  return (
    <DraggableDialogPortal>
      <DraggableDialogOverlay />
      <DialogPrimitive.Content
        ref={(node) => {
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as any).current = node;
          if (node) (contentRef as any).current = node;
        }}
        className={cn(
          'fixed z-50 grid w-full max-w-lg bg-white shadow-2xl duration-200',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'rounded-xl border-2 border-gray-300',
          'ring-1 ring-black/5',
          isDragging ? 'cursor-grabbing shadow-3xl' : 'shadow-2xl',
          className
        )}
        style={{
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
          transition: isDragging ? 'none' : 'transform 0.18s ease-out, box-shadow 0.2s ease-out',
          ...computedStyle,
        }}
        onMouseDown={handleMouseDown}
        aria-describedby={undefined}
        {...props}
      >
        {/* Modern drag handle with enhanced visual feedback */}
        {showDragHandle && (
          <div
            data-drag-handle
            className="absolute left-1/2 top-3 -translate-x-1/2 cursor-grab active:cursor-grabbing hover:bg-gray-100 rounded-lg transition-colors"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px' }}
            title="Drag to move"
          >
            <GripVertical className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors" />
          </div>
        )}

        {/* Enhanced window controls with modern styling */}
        <div className="absolute right-3 top-3 flex items-center gap-1.5 z-40">
          {showMaximize && (
            <>
              <button
                type="button"
                aria-label="Expand left"
                title="Expand left"
                onClick={expandLeft}
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              >
                <ChevronLeft className="h-4 w-4 text-gray-600" />
              </button>

              <button
                type="button"
                aria-label="Shrink"
                title="Shrink"
                onClick={shrink}
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              >
                <Minimize2 className="h-4 w-4 text-gray-600" />
              </button>

              <button
                type="button"
                aria-label="Expand right"
                title="Expand right"
                onClick={expandRight}
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              >
                <ChevronRight className="h-4 w-4 text-gray-600" />
              </button>

              <button
                type="button"
                aria-label={isMaximized ? 'Restore' : 'Maximize'}
                title={isMaximized ? 'Restore' : 'Maximize'}
                onClick={toggleMaximize}
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ml-1"
              >
                {isMaximized ? <Minimize2 className="h-4 w-4 text-gray-600" /> : <Maximize2 className="h-4 w-4 text-gray-600" />}
              </button>
            </>
          )}

          {/* Close button with modern styling */}
          <DraggableDialogClose asChild>
            <button
              type="button"
              aria-label="Close dialog"
              title="Close"
              className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 hover:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all ml-1"
            >
              <X className="h-4 w-4 text-red-600" />
            </button>
          </DraggableDialogClose>
        </div>

        {children}
      </DialogPrimitive.Content>
    </DraggableDialogPortal>
  );
});
DraggableDialogContent.displayName = DialogPrimitive.Content.displayName;

/**
 * DraggableDialogHeader with enhanced modern styling
 */
const DraggableDialogHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    data-drag-handle
    ref={ref}
    className={cn(
      'flex flex-col space-y-1.5 text-center sm:text-left pt-12 pb-4 px-6',
      'border-b border-gray-200 bg-gradient-to-r from-gray-50 via-white to-gray-50',
      'cursor-grab active:cursor-grabbing rounded-t-xl',
      className
    )}
    {...props}
  />
));
DraggableDialogHeader.displayName = 'DraggableDialogHeader';

const DraggableDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl',
      className
    )}
    {...props}
  />
);
DraggableDialogFooter.displayName = 'DraggableDialogFooter';

const DraggableDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-xl font-semibold leading-none tracking-tight text-gray-900', className)}
    {...props}
  />
));
DraggableDialogTitle.displayName = DialogPrimitive.Title.displayName;

const DraggableDialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DraggableDialogDescription.displayName = DialogPrimitive.Description.displayName;

const DraggableDialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('px-6 py-4 overflow-y-auto max-h-[calc(90vh-200px)]', className)} {...props} />
);
DraggableDialogBody.displayName = 'DraggableDialogBody';

export {
  DraggableDialog,
  DraggableDialogPortal,
  DraggableDialogOverlay,
  DraggableDialogClose,
  DraggableDialogTrigger,
  DraggableDialogContent,
  DraggableDialogHeader,
  DraggableDialogFooter,
  DraggableDialogTitle,
  DraggableDialogDescription,
  DraggableDialogBody,
};