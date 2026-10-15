'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Archive, Building2, ClipboardList, FileText, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'

const links = [
  { label: 'Workspace', href: '/self-evaluation', icon: ClipboardList },
  { label: 'Archive', href: '/self-evaluation/archive', icon: Archive },
  { label: 'Reports', href: '/self-evaluation/reports', icon: FileText },
  { label: 'Routing', href: '/self-evaluation/routing', icon: GitBranch },
  { label: 'Shops', href: '/self-evaluation/shop', icon: Building2 },
]

export function SelfEvaluationSidebar() {
  const pathname = usePathname() ?? ''

  return (
    <aside className="flex w-14 shrink-0 flex-col border-r border-slate-200 bg-white md:w-56">
      <div className="border-b border-slate-200 px-2 py-4 md:px-4">
        <h2 className="hidden text-sm font-semibold text-slate-900 md:block">Self Evaluation</h2>
        <p className="mt-1 hidden text-xs text-slate-500 md:block">Forms and workflow</p>
      </div>
      <nav aria-label="Self Evaluation" className="space-y-1 p-3">
        {links.map(({ label, href, icon: Icon }) => {
          const active = href === '/self-evaluation'
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`)

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              title={label}
              className={cn(
                'flex items-center justify-center gap-3 rounded px-1 py-2 text-sm transition-colors md:justify-start md:px-3',
                active
                  ? 'bg-emerald-50 font-medium text-emerald-800'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="hidden md:inline">{label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}