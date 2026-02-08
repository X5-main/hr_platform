import Link from 'next/link'
import { PositionRepository } from '@/lib/repositories/positions'
import { PositionCard } from '@/components/positions/PositionCard'

export default async function PositionsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const page = typeof searchParams.page === 'string' ? parseInt(searchParams.page, 10) : 1
  const search = typeof searchParams.search === 'string' ? searchParams.search : undefined
  const locationType = typeof searchParams.location_type === 'string' ? searchParams.location_type : undefined
  const employmentType = typeof searchParams.employment_type === 'string' ? searchParams.employment_type : undefined

  const positionRepo = new PositionRepository()
  const { positions, total, totalPages } = await positionRepo.list({
    page,
    limit: 10,
    search,
    location_type: locationType as 'remote' | 'hybrid' | 'onsite' | undefined,
    employment_type: employmentType as 'full_time' | 'part_time' | 'contract' | undefined,
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Open Positions</h1>
        <p className="mt-2 text-gray-600">
          Browse available positions and apply to join amazing teams.
        </p>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-4">
        <input
          type="text"
          name="search"
          defaultValue={search}
          placeholder="Search positions..."
          className="px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          name="location_type"
          defaultValue={locationType}
          className="px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Locations</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">On-site</option>
        </select>
        <select
          name="employment_type"
          defaultValue={employmentType}
          className="px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Types</option>
          <option value="full_time">Full-time</option>
          <option value="part_time">Part-time</option>
          <option value="contract">Contract</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Filter
        </button>
        {(search || locationType || employmentType) && (
          <Link
            href="/positions"
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Results */}
      {positions.length > 0 ? (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            {positions.map((position) => (
              <PositionCard key={position.id} position={position} />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex justify-center gap-2 pt-6">
            {page > 1 && (
              <Link
                href={{
                  pathname: '/positions',
                  query: {
                    ...searchParams,
                    page: page - 1,
                  },
                }}
                className="px-4 py-2 border rounded-md hover:bg-gray-50"
              >
                Previous
              </Link>
            )}
            <span className="px-4 py-2">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={{
                  pathname: '/positions',
                  query: {
                    ...searchParams,
                    page: page + 1,
                  },
                }}
                className="px-4 py-2 border rounded-md hover:bg-gray-50"
              >
                Next
              </Link>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-600">No positions found matching your criteria.</p>
        </div>
      )}

      {total > 0 && (
        <p className="text-sm text-gray-500 text-center">
          Showing {positions.length} of {total} positions
        </p>
      )}
    </div>
  )
}
