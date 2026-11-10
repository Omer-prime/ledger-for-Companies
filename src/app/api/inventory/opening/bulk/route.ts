import { postInventory } from '@/lib/inventory-posting'

export async function POST(req: Request) {
  return postInventory(req, 'opening')
}
