'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

interface PortalNavProps {
  user: User
}

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/positions', label: 'Positions' },
  { href: '/applications', label: 'My Applications' },
  { href: '/profile', label: 'Profile' },
]

export function PortalNav({ user }: PortalNavProps) {
  const pathname = usePathname()

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="text-xl font-semibold text-gray-900">
              HR Screening
            </Link>
            <div className="hidden sm:ml-10 sm:flex sm:space-x-8">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                      isActive
                        ? 'text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              {user.email}
            </span>
            <form action="/auth/logout" method="POST">
              <button
                type="submit"
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </div>
    </nav>
  )
}
