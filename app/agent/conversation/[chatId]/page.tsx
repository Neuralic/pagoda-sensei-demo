import { redirect } from 'next/navigation'

export default async function ConversationRedirect({ params }: { params: Promise<{ chatId: string }> }) {
  // Redirect /agent/conversation/:chatId -> /agent/conversation?chatId=...
  const { chatId } = await params
  
  if (!chatId) {
    // Fallback to conversation page if chatId is missing
    redirect('/agent/conversation')
  }
  
  redirect(`/agent/conversation?chatId=${encodeURIComponent(chatId)}`)
}
