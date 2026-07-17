'use client'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!session) return null

  const user = session.user as any

  return (
    <div className="min-h-screen flex bg-gray-950">
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col fixed inset-y-0">
        <div className="px-4 py-5 border-b border-gray-800">
          <h1 className="text-white font-bold text-lg">PayTerminal</h1>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          <NavLink href="/" label="Terminal" active={pathname === '/'}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </NavLink>
          <NavLink href="/customers" label="Customers" active={pathname === '/customers'}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </NavLink>
          <NavLink href="/transactions" label="Transactions" active={pathname === '/transactions'}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </NavLink>
          {user?.role === 'admin' && (
            <NavLink href="/admin" label="Settings" active={pathname === '/admin'}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            </NavLink>
          )}
        </nav>

        <div className="px-4 py-4 border-t border-gray-800">
          <p className="text-xs text-gray-500 truncate mb-2">{user?.name}</p>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-56 overflow-auto">{children}</main>
    </div>
  )
}

function NavLink({
  href, label, active, children,
}: {
  href: string; label: string; active: boolean; children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
      }`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {children}
      </svg>
      {label}
    </Link>
  )
}
