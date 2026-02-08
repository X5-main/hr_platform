import { NextResponse } from 'next/server'
import { PositionRepository } from '@/lib/repositories/positions'
import { positionQuerySchema } from '@/lib/validations/position'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawParams = Object.fromEntries(searchParams.entries())

    const validation = positionQuerySchema.safeParse(rawParams)
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters' },
        { status: 400 }
      )
    }

    const repository = new PositionRepository()
    const result = await repository.list(validation.data)

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Failed to fetch positions:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch positions' },
      { status: 500 }
    )
  }
}
