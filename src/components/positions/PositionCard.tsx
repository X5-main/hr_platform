import Link from 'next/link'

interface Company {
  id: string
  name: string
  slug: string
  logo_url: string | null
}

interface Position {
  id: string
  title: string
  slug: string
  description: string
  employment_type: string | null
  location_type: string | null
  salary_range: { min?: number; max?: number; currency: string } | null
  companies: Company
}

interface PositionCardProps {
  position: Position
}

const LOCATION_TYPE_LABELS: Record<string, string> = {
  remote: 'Remote',
  on_site: 'On-site',
  hybrid: 'Hybrid',
}

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}

export function PositionCard({ position }: PositionCardProps) {
  const salaryText = position.salary_range
    ? `${position.salary_range.currency} ${position.salary_range.min?.toLocaleString() || ''} - ${position.salary_range.max?.toLocaleString() || ''}`
    : null

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-gray-900">
            {position.title}
          </h3>
          <p className="text-gray-600 mt-1">{position.companies.name}</p>
        </div>
        {position.companies.logo_url && (
          <img
            src={position.companies.logo_url}
            alt={position.companies.name}
            className="w-12 h-12 object-contain"
          />
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {position.employment_type && (
          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
            {EMPLOYMENT_TYPE_LABELS[position.employment_type] || position.employment_type}
          </span>
        )}
        {position.location_type && (
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
            {LOCATION_TYPE_LABELS[position.location_type] || position.location_type}
          </span>
        )}
        {salaryText && (
          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
            {salaryText}
          </span>
        )}
      </div>

      <p className="mt-4 text-gray-600 line-clamp-3">
        {position.description.slice(0, 200)}...
      </p>

      <div className="mt-4 pt-4 border-t">
        <Link
          href={`/positions/${position.companies.slug}/${position.slug}`}
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          View Details →
        </Link>
      </div>
    </div>
  )
}
