import { redirect } from 'next/navigation'

export default async function ConversationRedirect({ params }: { params: Promise<{ chatId: string }> }) {
  // Redirect /guide/conversation/:chatId -> /guide/conversation?chatId=...
  const { chatId } = await params
  
  if (!chatId) {
    // Fallback to conversation page if chatId is missing
    redirect('/guide/conversation')
  }
  
  redirect(`/guide/conversation?chatId=${encodeURIComponent(chatId)}`)
}

