import { getSession } from '@/lib/auth'
import { apiError } from '@/lib/api-security'

export async function GET() {
  const session = await getSession()
  if (!session) return apiError(401, 'Unauthorized')
  return Response.json({ role: session.role })
}
